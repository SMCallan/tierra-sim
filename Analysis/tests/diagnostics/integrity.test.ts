import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  findChecksumLists,
  parseChecksumList,
  summariseRunIntegrity,
  verifyChecksumList,
} from '../../src/diagnostics/integrity.ts';
import { FixtureTree } from './helpers/fixture-tree.ts';

let tree: FixtureTree;

beforeEach(() => {
  tree = new FixtureTree();
});

afterEach(() => {
  tree.dispose();
});

const digestOf = (text: string): string => createHash('sha256').update(text).digest('hex');

describe('checksum list parsing', () => {
  it('accepts the standard two-space shasum format and ignores blank lines', () => {
    const entries = parseChecksumList(`${'a'.repeat(64)}  file.json\n\n`, 'list');
    expect(entries).toEqual([{ digest: 'a'.repeat(64), path: 'file.json' }]);
  });

  it('rejects a malformed line, naming the line number', () => {
    expect(() => parseChecksumList(`${'a'.repeat(64)} single-space.json\n`, 'list')).toThrow(
      /line 1 is not/,
    );
  });

  it('rejects a truncated digest', () => {
    expect(() => parseChecksumList(`${'a'.repeat(63)}  file.json\n`, 'list')).toThrow(/line 1/);
  });
});

describe('checksum verification', () => {
  it('verifies an intact bundle', async () => {
    tree.addRun({ campaign: 'alpha', runId: 'a-1' });

    const [listPath] = findChecksumLists(tree.root);
    const result = await verifyChecksumList(tree.root, listPath as string);

    expect(result).toMatchObject({
      entriesListed: 2,
      entriesPresent: 2,
      entriesVerified: 2,
      entriesMismatched: 0,
    });
    expect(summariseRunIntegrity([result])).toBe('verified');
  });

  it('reports a tampered payload rather than throwing', async () => {
    tree.addRun({ campaign: 'alpha', runId: 'a-1', corruptPayload: true });

    const [listPath] = findChecksumLists(tree.root);
    const result = await verifyChecksumList(tree.root, listPath as string);

    expect(result).toMatchObject({ entriesPresent: 2, entriesVerified: 1, entriesMismatched: 1 });
    expect(result.entries.find((entry) => entry.status === 'mismatched')?.path).toBe(
      'final-summary.json',
    );
    expect(summariseRunIntegrity([result])).toBe('failed');
  });

  it('distinguishes a missing payload from a mismatched one', async () => {
    tree.addRun({ campaign: 'alpha', runId: 'a-1', omitPayload: true });

    const [listPath] = findChecksumLists(tree.root);
    const result = await verifyChecksumList(tree.root, listPath as string);

    expect(result).toMatchObject({ entriesListed: 2, entriesPresent: 1, entriesMismatched: 0 });
    expect(result.entries.find((entry) => entry.status === 'missing')?.path).toBe(
      'final-summary.json',
    );
    expect(summariseRunIntegrity([result])).toBe('failed');
  });

  it('recomputes rather than trusting the recorded digest', async () => {
    // The list claims a digest that is wrong for the payload it names. A tool that echoed the
    // list back would report success here.
    tree.addRawFile('alpha/a-1/final-summary.json', 'real contents\n');
    tree.addRawFile('alpha/a-1/checksums.sha256', `${'0'.repeat(64)}  final-summary.json\n`);

    const [listPath] = findChecksumLists(tree.root);
    const result = await verifyChecksumList(tree.root, listPath as string);

    expect(result.entriesMismatched).toBe(1);
    expect(result.entries[0]?.observedDigest).toBe(digestOf('real contents\n'));
  });

  it('refuses a checksum entry that escapes its own directory', async () => {
    tree.addRawFile('alpha/a-1/checksums.sha256', `${'0'.repeat(64)}  ../../etc/passwd\n`);

    const [listPath] = findChecksumLists(tree.root);

    await expect(verifyChecksumList(tree.root, listPath as string)).rejects.toThrow(
      /resolves outside its own directory/,
    );
  });

  it('reports a run with no checksum list distinctly from a failed one', () => {
    expect(summariseRunIntegrity([])).toBe('no_checksum_list');
  });
});
