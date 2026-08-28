import { statSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseCsv } from '../../src/diagnostics/csv.ts';
import {
  INTEGRITY_RECEIPT_COLUMNS,
  parseArguments,
  RUN_INVENTORY_COLUMNS,
  runAudit,
  writeAudit,
} from '../../src/diagnostics/audit.ts';
import { FixtureTree } from './helpers/fixture-tree.ts';

let tree: FixtureTree;

beforeEach(() => {
  tree = new FixtureTree();
});

afterEach(() => {
  tree.dispose();
});

const buildTree = (): string => {
  tree.addRun({ campaign: 'alpha', runId: 'a-1' });
  tree.addRun({ campaign: 'alpha', runId: 'a-2', dirtyWorktree: true, terminalReason: 'extinction' });
  tree.addRun({ campaign: 'beta', runId: 'b-1', dirtyWorktree: true });
  return tree.addRegistry([
    { campaign: 'alpha', manifests: 2, clean: 1, dirty: 1 },
    { campaign: 'beta', manifests: 1, clean: 0, dirty: 1 },
  ]);
};

describe('audit tables', () => {
  it('emits one inventory row per run with the declared columns', async () => {
    const registryPath = buildTree();

    const result = await runAudit({
      rawRoot: tree.root,
      registryPath,
      outputDirectory: tree.path('out'),
    });

    const rows = parseCsv(result.runInventoryCsv);
    expect(rows).toHaveLength(3);
    expect(result.runInventoryCsv.split('\n')[0]).toBe(RUN_INVENTORY_COLUMNS.join(','));
    expect(rows.map((row) => row['run_id'])).toEqual(['a-1', 'a-2', 'b-1']);
    expect(rows[1]).toMatchObject({
      campaign: 'alpha',
      dirty_worktree: 'true',
      terminal_reason: 'extinction',
      integrity: 'verified',
    });
  });

  it('carries the dirty_worktree flag on every row', async () => {
    const registryPath = buildTree();

    const result = await runAudit({
      rawRoot: tree.root,
      registryPath,
      outputDirectory: tree.path('out'),
    });

    for (const row of parseCsv(result.runInventoryCsv)) {
      expect(['true', 'false']).toContain(row['dirty_worktree']);
    }
  });

  it('emits one receipt row per checksum list, sorted by path', async () => {
    const registryPath = buildTree();

    const result = await runAudit({
      rawRoot: tree.root,
      registryPath,
      outputDirectory: tree.path('out'),
    });

    const rows = parseCsv(result.integrityReceiptCsv);
    expect(result.integrityReceiptCsv.split('\n')[0]).toBe(INTEGRITY_RECEIPT_COLUMNS.join(','));
    expect(rows.map((row) => row['checksum_list_relative_path'])).toEqual([
      'alpha/a-1/checksums.sha256',
      'alpha/a-2/checksums.sha256',
      'beta/b-1/checksums.sha256',
    ]);
    expect(result.entriesListed).toBe(6);
    expect(result.entriesVerified).toBe(6);
  });

  it('marks a corrupt run failed and continues auditing the rest', async () => {
    tree.addRun({ campaign: 'alpha', runId: 'a-1', corruptPayload: true });
    tree.addRun({ campaign: 'alpha', runId: 'a-2' });
    const registryPath = tree.addRegistry([
      { campaign: 'alpha', manifests: 2, clean: 2, dirty: 0 },
    ]);

    const result = await runAudit({
      rawRoot: tree.root,
      registryPath,
      outputDirectory: tree.path('out'),
    });

    const rows = parseCsv(result.runInventoryCsv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ run_id: 'a-1', integrity: 'failed' });
    expect(rows[1]).toMatchObject({ run_id: 'a-2', integrity: 'verified' });
    expect(result.entriesMismatched).toBe(1);
    expect(result.runsFailingIntegrity).toEqual(['a-1 (failed)']);
  });

  it('reports a run with no checksum list without failing the audit', async () => {
    tree.addRun({ campaign: 'alpha', runId: 'a-1', omitChecksumList: true });
    const registryPath = tree.addRegistry([
      { campaign: 'alpha', manifests: 1, clean: 1, dirty: 0 },
    ]);

    const result = await runAudit({
      rawRoot: tree.root,
      registryPath,
      outputDirectory: tree.path('out'),
    });

    expect(parseCsv(result.runInventoryCsv)[0]).toMatchObject({ integrity: 'no_checksum_list' });
  });

  it('aborts when the discovered set disagrees with the registry', async () => {
    tree.addRun({ campaign: 'alpha', runId: 'a-1' });
    const registryPath = tree.addRegistry([
      { campaign: 'alpha', manifests: 2, clean: 2, dirty: 0 },
    ]);

    await expect(
      runAudit({ rawRoot: tree.root, registryPath, outputDirectory: tree.path('out') }),
    ).rejects.toThrow(/The registry is authoritative and is not adjusted to fit/);
  });
});

describe('determinism and read-only behaviour', () => {
  it('produces byte-identical tables on a second run', async () => {
    const registryPath = buildTree();
    const options = { rawRoot: tree.root, registryPath, outputDirectory: tree.path('out') };

    const first = await runAudit(options);
    const second = await runAudit(options);

    expect(second.runInventoryCsv).toBe(first.runInventoryCsv);
    expect(second.integrityReceiptCsv).toBe(first.integrityReceiptCsv);
  });

  it('emits no absolute path, hostname, or timestamp into a payload', async () => {
    const registryPath = buildTree();

    const result = await runAudit({
      rawRoot: tree.root,
      registryPath,
      outputDirectory: tree.path('out'),
    });

    for (const csv of [result.runInventoryCsv, result.integrityReceiptCsv]) {
      expect(csv).not.toContain(tree.root);
      expect(csv).not.toMatch(/^\//m);
      expect(csv).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    }
  });

  it('does not modify the raw tree', async () => {
    const registryPath = buildTree();
    const manifestPath = tree.path('alpha/a-1/manifest.json');
    const before = statSync(manifestPath);

    const options = { rawRoot: tree.root, registryPath, outputDirectory: tree.path('out') };
    writeAudit(options, await runAudit(options));

    const after = statSync(manifestPath);
    expect(after.mtimeMs).toBe(before.mtimeMs);
    expect(after.size).toBe(before.size);
  });
});

describe('argument parsing', () => {
  it('defaults every path when no argument is supplied', () => {
    const options = parseArguments([]);
    expect(options.rawRoot).toMatch(/Experiments\/raw-data\/external-diagnostics$/);
    expect(options.registryPath).toMatch(/campaign-inventory\.csv$/);
    expect(options.outputDirectory).toMatch(/processed-data\/diagnostics\/post-v8-2026-07-19$/);
  });

  it('rejects an unrecognised flag rather than ignoring it', () => {
    expect(() => parseArguments(['--promote'])).toThrow(/Unrecognised argument/);
  });

  it('rejects a flag with no value', () => {
    expect(() => parseArguments(['--raw-root'])).toThrow(/requires a path/);
  });
});
