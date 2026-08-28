/**
 * Checksum list parsing and SHA-256 re-verification.
 *
 * Governed by Analysis/specifications/sci-001-post-v8-diagnostic-audit-v1.0.md §3.
 * Integrity is recomputed, never inherited from a prior verification. A mismatch is reported,
 * not thrown: concealing a corrupt bundle would be worse than reporting one.
 */

import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

import { AuditError } from './discovery.ts';

export const CHECKSUM_FILENAME = 'checksums.sha256';

export interface ChecksumEntry {
  readonly digest: string;
  /** Payload path relative to the directory containing the checksum list. */
  readonly path: string;
}

export type EntryStatus = 'verified' | 'mismatched' | 'missing';

export interface EntryResult extends ChecksumEntry {
  readonly status: EntryStatus;
  readonly observedDigest: string | null;
}

export interface ChecksumListResult {
  /** Path of the checksum list relative to the discovery root, with `/` separators. */
  readonly listRelativePath: string;
  readonly campaign: string;
  readonly entriesListed: number;
  readonly entriesPresent: number;
  readonly entriesVerified: number;
  readonly entriesMismatched: number;
  readonly entries: readonly EntryResult[];
}

const HASH_LINE = /^([0-9a-f]{64}) {2}(.+)$/;

const toPosix = (value: string): string => value.split(sep).join('/');

export const parseChecksumList = (text: string, listPath: string): ChecksumEntry[] => {
  const entries: ChecksumEntry[] = [];
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    if (line.trim() === '') {
      return;
    }
    const match = HASH_LINE.exec(line);
    if (match === null) {
      throw new AuditError(
        `Checksum list "${listPath}" line ${index + 1} is not "<64 hex digits><two spaces><path>": ${line}`,
      );
    }
    entries.push({ digest: match[1] as string, path: match[2] as string });
  });
  return entries;
};

export const hashFile = async (filePath: string): Promise<string> => {
  const hash = createHash('sha256');
  await new Promise<void>((resolveHash, rejectHash) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', rejectHash);
    stream.on('end', () => resolveHash());
  });
  return hash.digest('hex');
};

/** Finds every checksum list below the root, in stable order. */
export const findChecksumLists = (root: string): string[] => {
  const resolvedRoot = resolve(root);
  const found: string[] = [];

  const walk = (directory: string): void => {
    const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    );
    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        continue;
      }
      const entryPath = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }
      if (entry.isFile() && entry.name === CHECKSUM_FILENAME) {
        found.push(entryPath);
      }
    }
  };

  walk(resolvedRoot);
  return found;
};

/**
 * Re-verifies one checksum list.
 *
 * A payload path that escapes the list's own directory is refused outright rather than hashed:
 * a checksum list is not a licence to read arbitrary parts of the filesystem.
 */
export const verifyChecksumList = async (
  root: string,
  listPath: string,
): Promise<ChecksumListResult> => {
  const resolvedRoot = resolve(root);
  const listDirectory = resolve(listPath, '..');
  const listRelativePath = toPosix(relative(resolvedRoot, listPath));
  const campaign = listRelativePath.split('/')[0] as string;
  const entries = parseChecksumList(readFileSync(listPath, 'utf8'), listRelativePath);

  const results: EntryResult[] = [];
  for (const entry of entries) {
    const payloadPath = resolve(listDirectory, entry.path);
    const withinList = relative(listDirectory, payloadPath);
    if (withinList.startsWith('..') || resolve(payloadPath) !== payloadPath) {
      throw new AuditError(
        `Checksum list "${listRelativePath}" references "${entry.path}", which resolves outside its own directory`,
      );
    }
    if (!existsSync(payloadPath) || !statSync(payloadPath).isFile()) {
      results.push({ ...entry, status: 'missing', observedDigest: null });
      continue;
    }
    const observedDigest = await hashFile(payloadPath);
    results.push({
      ...entry,
      status: observedDigest === entry.digest ? 'verified' : 'mismatched',
      observedDigest,
    });
  }

  return {
    listRelativePath,
    campaign,
    entriesListed: results.length,
    entriesPresent: results.filter((entry) => entry.status !== 'missing').length,
    entriesVerified: results.filter((entry) => entry.status === 'verified').length,
    entriesMismatched: results.filter((entry) => entry.status === 'mismatched').length,
    entries: results,
  };
};

/** `verified` only when every entry of every list covering the run passed. */
export const summariseRunIntegrity = (
  results: readonly ChecksumListResult[],
): 'verified' | 'failed' | 'no_checksum_list' => {
  if (results.length === 0) {
    return 'no_checksum_list';
  }
  const clean = results.every(
    (result) => result.entriesMismatched === 0 && result.entriesPresent === result.entriesListed,
  );
  return clean ? 'verified' : 'failed';
};
