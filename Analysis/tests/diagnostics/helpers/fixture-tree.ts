/**
 * Synthetic evidence trees for the diagnostic-audit tests.
 *
 * Tests never touch `Experiments/raw-data/`. Building the tree here keeps every assertion
 * independent of what happens to exist on one machine.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export interface FixtureRunOptions {
  readonly campaign: string;
  readonly runId: string;
  readonly dirtyWorktree?: boolean;
  readonly requestedTicks?: number;
  readonly completedTicks?: number;
  readonly terminalReason?: string;
  readonly seed?: number;
  /** Omit a required manifest field, to test strict loading. */
  readonly omitField?: string;
  /** Corrupt the payload after the checksum list is written. */
  readonly corruptPayload?: boolean;
  /** Write the checksum list but never create the payload. */
  readonly omitPayload?: boolean;
  /** Skip writing a checksum list entirely. */
  readonly omitChecksumList?: boolean;
}

export class FixtureTree {
  readonly root: string;

  constructor() {
    this.root = mkdtempSync(join(tmpdir(), 'sci-001-'));
  }

  dispose(): void {
    rmSync(this.root, { recursive: true, force: true });
  }

  private writeFile(relativePath: string, contents: string): void {
    const target = join(this.root, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }

  addRun(options: FixtureRunOptions): void {
    const directory = `${options.campaign}/${options.runId}`;
    const manifest: Record<string, unknown> = {
      run_id: options.runId,
      condition_id: `${options.runId}__condition`,
      replicate_id: 0,
      seed: options.seed ?? 20260719,
      source_git_commit: 'b654e85b1cfa05f275f0f1a98fcc77eb841e30e0',
      dirty_worktree: options.dirtyWorktree ?? false,
      requested_ticks: options.requestedTicks ?? 4000,
      completed_ticks: options.completedTicks ?? 4000,
      terminal_reason: options.terminalReason ?? 'completed',
      output_schema_version: '0.5.0',
      engine_version: '0.1.0',
      runner_version: '0.1.0',
    };
    if (options.omitField !== undefined) {
      delete manifest[options.omitField];
    }

    const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
    this.writeFile(`${directory}/manifest.json`, manifestText);

    const payloadText = `payload for ${options.runId}\n`;
    const payloadDigest = createHash('sha256').update(payloadText).digest('hex');
    const manifestDigest = createHash('sha256').update(manifestText).digest('hex');

    if (!options.omitPayload) {
      this.writeFile(`${directory}/final-summary.json`, payloadText);
    }
    if (options.corruptPayload) {
      this.writeFile(`${directory}/final-summary.json`, `${payloadText}tampered\n`);
    }
    if (!options.omitChecksumList) {
      this.writeFile(
        `${directory}/checksums.sha256`,
        `${payloadDigest}  final-summary.json\n${manifestDigest}  manifest.json\n`,
      );
    }
  }

  /** Writes a raw file verbatim, for malformed-input tests. */
  addRawFile(relativePath: string, contents: string): void {
    this.writeFile(relativePath, contents);
  }

  /** Writes a registry CSV describing the expected campaign shape. */
  addRegistry(
    rows: ReadonlyArray<{
      readonly campaign: string;
      readonly manifests: number;
      readonly clean: number;
      readonly dirty: number;
    }>,
    filename = 'registry.csv',
  ): string {
    const header =
      'campaign_directory,manifest_count,clean_manifest_count,dirty_manifest_count,completed_count,extinction_count,source_git_commit,integrity_verified,disposition';
    const body = rows
      .map(
        (row) =>
          `${row.campaign},${row.manifests},${row.clean},${row.dirty},${row.manifests},0,b654e85,true,retained_dirty_diagnostic`,
      )
      .join('\n');
    const target = join(this.root, filename);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${header}\n${body}\n`);
    return target;
  }

  path(relativePath: string): string {
    return join(this.root, relativePath);
  }
}
