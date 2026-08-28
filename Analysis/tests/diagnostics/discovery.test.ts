import { symlinkSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  countRuns,
  discoverRuns,
  findManifestPaths,
  loadRegistryExpectation,
  reconcileWithRegistry,
} from '../../src/diagnostics/discovery.ts';
import { FixtureTree } from './helpers/fixture-tree.ts';

let tree: FixtureTree;

beforeEach(() => {
  tree = new FixtureTree();
});

afterEach(() => {
  tree.dispose();
});

describe('run discovery', () => {
  it('finds every manifest and attributes it to its campaign directory', () => {
    tree.addRun({ campaign: 'alpha', runId: 'alpha-1' });
    tree.addRun({ campaign: 'alpha', runId: 'alpha-2' });
    tree.addRun({ campaign: 'beta', runId: 'beta-1', dirtyWorktree: true });

    const runs = discoverRuns(tree.root);

    expect(runs).toHaveLength(3);
    expect(runs.map((run) => run.runId)).toEqual(['alpha-1', 'alpha-2', 'beta-1']);
    expect(runs.map((run) => run.campaign)).toEqual(['alpha', 'alpha', 'beta']);
    expect(runs[0]?.manifestRelativePath).toBe('alpha/alpha-1/manifest.json');
  });

  it('orders runs by campaign then run_id regardless of filesystem order', () => {
    tree.addRun({ campaign: 'zulu', runId: 'z-2' });
    tree.addRun({ campaign: 'alpha', runId: 'a-9' });
    tree.addRun({ campaign: 'alpha', runId: 'a-1' });

    expect(discoverRuns(tree.root).map((run) => run.runId)).toEqual(['a-1', 'a-9', 'z-2']);
  });

  it('takes clean/dirty status from the manifest, not from the directory name', () => {
    tree.addRun({ campaign: 'looks-clean', runId: 'r-1', dirtyWorktree: true });
    tree.addRun({ campaign: 'looks-dirty', runId: 'r-2', dirtyWorktree: false });

    expect(countRuns(discoverRuns(tree.root))).toMatchObject({ clean: 1, dirty: 1 });
  });

  it('aborts on a duplicate run_id rather than overwriting a run', () => {
    tree.addRun({ campaign: 'alpha', runId: 'shared' });
    tree.addRawFile(
      'beta/shared/manifest.json',
      `${JSON.stringify({
        run_id: 'shared',
        condition_id: 'c',
        replicate_id: 0,
        seed: 1,
        source_git_commit: 'abc',
        dirty_worktree: false,
        requested_ticks: 10,
        completed_ticks: 10,
        terminal_reason: 'completed',
        output_schema_version: '0.5.0',
        engine_version: '0.1.0',
        runner_version: '0.1.0',
      })}\n`,
    );

    expect(() => discoverRuns(tree.root)).toThrow(/Duplicate run_id "shared"/);
  });

  it('refuses a required field that is absent rather than substituting a default', () => {
    tree.addRun({ campaign: 'alpha', runId: 'r-1', omitField: 'terminal_reason' });

    expect(() => discoverRuns(tree.root)).toThrow(/missing required field "terminal_reason"/);
  });

  it('refuses a required field of the wrong type', () => {
    tree.addRawFile(
      'alpha/r-1/manifest.json',
      `${JSON.stringify({
        run_id: 'r-1',
        condition_id: 'c',
        replicate_id: 0,
        seed: 1,
        source_git_commit: 'abc',
        dirty_worktree: 'false',
        requested_ticks: 10,
        completed_ticks: 10,
        terminal_reason: 'completed',
        output_schema_version: '0.5.0',
        engine_version: '0.1.0',
        runner_version: '0.1.0',
      })}\n`,
    );

    expect(() => discoverRuns(tree.root)).toThrow(/field "dirty_worktree" is string, expected boolean/);
  });

  it('names the offending file when a manifest is not valid JSON', () => {
    tree.addRawFile('alpha/r-1/manifest.json', '{ not json');

    expect(() => discoverRuns(tree.root)).toThrow(/alpha\/r-1\/manifest.json" is not valid JSON/);
  });

  it('does not follow symlinks out of the discovery root', () => {
    tree.addRun({ campaign: 'alpha', runId: 'r-1' });
    const outside = new FixtureTree();
    try {
      outside.addRun({ campaign: 'elsewhere', runId: 'secret' });
      symlinkSync(outside.root, tree.path('escape'), 'dir');

      const runs = discoverRuns(tree.root);

      expect(runs.map((run) => run.runId)).toEqual(['r-1']);
      expect(findManifestPaths(tree.root)).toHaveLength(1);
    } finally {
      outside.dispose();
    }
  });
});

describe('registry reconciliation', () => {
  it('reads expected totals from the registry rather than hard-coding them', () => {
    const registry = tree.addRegistry([
      { campaign: 'alpha', manifests: 2, clean: 1, dirty: 1 },
      { campaign: 'beta', manifests: 3, clean: 0, dirty: 3 },
    ]);

    expect(loadRegistryExpectation(registry)).toMatchObject({
      campaigns: 2,
      manifests: 5,
      clean: 1,
      dirty: 4,
    });
  });

  it('rejects a registry whose clean and dirty counts do not sum to its manifest count', () => {
    const registry = tree.addRegistry([{ campaign: 'alpha', manifests: 5, clean: 1, dirty: 1 }]);

    expect(() => loadRegistryExpectation(registry)).toThrow(/internally inconsistent/);
  });

  it('passes when the discovered set matches the registry exactly', () => {
    tree.addRun({ campaign: 'alpha', runId: 'a-1' });
    tree.addRun({ campaign: 'alpha', runId: 'a-2', dirtyWorktree: true });
    const registry = tree.addRegistry([{ campaign: 'alpha', manifests: 2, clean: 1, dirty: 1 }]);

    expect(
      reconcileWithRegistry(discoverRuns(tree.root), loadRegistryExpectation(registry)),
    ).toMatchObject({ manifests: 2, campaigns: 1, clean: 1, dirty: 1 });
  });

  it('aborts when a run is missing relative to the registry', () => {
    tree.addRun({ campaign: 'alpha', runId: 'a-1' });
    const registry = tree.addRegistry([{ campaign: 'alpha', manifests: 2, clean: 2, dirty: 0 }]);

    expect(() =>
      reconcileWithRegistry(discoverRuns(tree.root), loadRegistryExpectation(registry)),
    ).toThrow(/manifests: discovered 1, registry 2/);
  });

  it('aborts when an extra campaign appears that the registry does not list', () => {
    tree.addRun({ campaign: 'alpha', runId: 'a-1' });
    tree.addRun({ campaign: 'rogue', runId: 'r-1' });
    const registry = tree.addRegistry([{ campaign: 'alpha', manifests: 1, clean: 1, dirty: 0 }]);

    expect(() =>
      reconcileWithRegistry(discoverRuns(tree.root), loadRegistryExpectation(registry)),
    ).toThrow(/campaign "rogue" was discovered but is not in the registry/);
  });

  it('aborts when the clean/dirty split disagrees, even at the correct total', () => {
    tree.addRun({ campaign: 'alpha', runId: 'a-1', dirtyWorktree: true });
    tree.addRun({ campaign: 'alpha', runId: 'a-2', dirtyWorktree: true });
    const registry = tree.addRegistry([{ campaign: 'alpha', manifests: 2, clean: 1, dirty: 1 }]);

    expect(() =>
      reconcileWithRegistry(discoverRuns(tree.root), loadRegistryExpectation(registry)),
    ).toThrow(/clean manifests: discovered 0, registry 1/);
  });
});
