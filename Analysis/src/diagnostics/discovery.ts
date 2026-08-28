/**
 * Run discovery and registry reconciliation.
 *
 * Implements §2 of the SCI-001 post-v8 diagnostic audit specification.
 * Runs are discovered by walking the raw tree, never hard-coded, and the discovered set is
 * reconciled against the committed registry. The registry is never rewritten to match.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

import { parseCsv } from './csv.ts';

export const MANIFEST_FILENAME = 'manifest.json';

export interface DiscoveredRun {
  /** First path segment below the discovery root. */
  readonly campaign: string;
  /** Path of the manifest relative to the discovery root, with `/` separators. */
  readonly manifestRelativePath: string;
  /** Directory containing the manifest, relative to the discovery root. */
  readonly runRelativeDirectory: string;
  readonly runId: string;
  readonly conditionId: string;
  readonly replicateId: number;
  readonly seed: number;
  readonly sourceGitCommit: string;
  readonly dirtyWorktree: boolean;
  readonly requestedTicks: number;
  readonly completedTicks: number;
  readonly terminalReason: string;
  readonly outputSchemaVersion: string;
  readonly engineVersion: string;
  readonly runnerVersion: string;
  readonly manifest: Readonly<Record<string, unknown>>;
}

export interface RegistryExpectation {
  readonly campaigns: number;
  readonly manifests: number;
  readonly clean: number;
  readonly dirty: number;
  readonly campaignManifestCounts: ReadonlyMap<string, number>;
}

export class AuditError extends Error {}

const toPosix = (value: string): string => value.split(sep).join('/');

/** Recursively collects manifest paths, refusing any path that escapes the root. */
export const findManifestPaths = (root: string): string[] => {
  const resolvedRoot = resolve(root);
  const found: string[] = [];

  const walk = (directory: string): void => {
    const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    );
    for (const entry of entries) {
      const entryPath = resolve(directory, entry.name);
      const relativePath = relative(resolvedRoot, entryPath);
      if (relativePath.startsWith('..') || relativePath === '') {
        throw new AuditError(
          `Refusing to follow "${entryPath}": it resolves outside the discovery root ${resolvedRoot}`,
        );
      }
      if (entry.isSymbolicLink()) {
        // A symlink could point anywhere, including outside the root. Evidence discovery does
        // not follow them.
        continue;
      }
      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }
      if (entry.isFile() && entry.name === MANIFEST_FILENAME) {
        found.push(entryPath);
      }
    }
  };

  walk(resolvedRoot);
  return found;
};

const requireField = (
  manifest: Record<string, unknown>,
  field: string,
  kind: 'string' | 'number' | 'boolean',
  manifestPath: string,
): unknown => {
  if (!(field in manifest)) {
    throw new AuditError(
      `Manifest "${manifestPath}" is missing required field "${field}"; the audit substitutes no defaults`,
    );
  }
  const value = manifest[field];
  if (typeof value !== kind) {
    throw new AuditError(
      `Manifest "${manifestPath}" field "${field}" is ${typeof value}, expected ${kind}`,
    );
  }
  return value;
};

export const loadRun = (root: string, manifestPath: string): DiscoveredRun => {
  const resolvedRoot = resolve(root);
  const manifestRelativePath = toPosix(relative(resolvedRoot, manifestPath));
  const segments = manifestRelativePath.split('/');
  const campaign = segments[0];
  if (campaign === undefined || segments.length < 2) {
    throw new AuditError(
      `Manifest "${manifestRelativePath}" is not inside a campaign directory below the discovery root`,
    );
  }

  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
  } catch (error) {
    throw new AuditError(
      `Manifest "${manifestRelativePath}" is not valid JSON: ${(error as Error).message}`,
    );
  }

  return {
    campaign,
    manifestRelativePath,
    runRelativeDirectory: segments.slice(0, -1).join('/'),
    runId: requireField(manifest, 'run_id', 'string', manifestRelativePath) as string,
    conditionId: requireField(manifest, 'condition_id', 'string', manifestRelativePath) as string,
    replicateId: requireField(manifest, 'replicate_id', 'number', manifestRelativePath) as number,
    seed: requireField(manifest, 'seed', 'number', manifestRelativePath) as number,
    sourceGitCommit: requireField(
      manifest,
      'source_git_commit',
      'string',
      manifestRelativePath,
    ) as string,
    dirtyWorktree: requireField(
      manifest,
      'dirty_worktree',
      'boolean',
      manifestRelativePath,
    ) as boolean,
    requestedTicks: requireField(
      manifest,
      'requested_ticks',
      'number',
      manifestRelativePath,
    ) as number,
    completedTicks: requireField(
      manifest,
      'completed_ticks',
      'number',
      manifestRelativePath,
    ) as number,
    terminalReason: requireField(
      manifest,
      'terminal_reason',
      'string',
      manifestRelativePath,
    ) as string,
    outputSchemaVersion: requireField(
      manifest,
      'output_schema_version',
      'string',
      manifestRelativePath,
    ) as string,
    engineVersion: requireField(manifest, 'engine_version', 'string', manifestRelativePath) as string,
    runnerVersion: requireField(manifest, 'runner_version', 'string', manifestRelativePath) as string,
    manifest,
  };
};

/** Discovers every run below the root, rejecting duplicate run identifiers. */
export const discoverRuns = (root: string): DiscoveredRun[] => {
  const runs: DiscoveredRun[] = [];
  const byRunId = new Map<string, string>();

  for (const manifestPath of findManifestPaths(root)) {
    const run = loadRun(root, manifestPath);
    const existing = byRunId.get(run.runId);
    if (existing !== undefined) {
      throw new AuditError(
        `Duplicate run_id "${run.runId}" found at "${existing}" and "${run.manifestRelativePath}"; the audit will not silently overwrite a run`,
      );
    }
    byRunId.set(run.runId, run.manifestRelativePath);
    runs.push(run);
  }

  runs.sort((left, right) => {
    if (left.campaign !== right.campaign) {
      return left.campaign < right.campaign ? -1 : 1;
    }
    return left.runId < right.runId ? -1 : left.runId > right.runId ? 1 : 0;
  });
  return runs;
};

const readIntegerColumn = (
  record: Record<string, string>,
  column: string,
  registryPath: string,
): number => {
  const raw = record[column];
  if (raw === undefined) {
    throw new AuditError(`Registry "${registryPath}" is missing column "${column}"`);
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value)) {
    throw new AuditError(
      `Registry "${registryPath}" column "${column}" holds non-integer value "${raw}"`,
    );
  }
  return value;
};

/** Reads the expected campaign shape from the committed registry. Nothing here is hard-coded. */
export const loadRegistryExpectation = (registryPath: string): RegistryExpectation => {
  const records = parseCsv(readFileSync(registryPath, 'utf8'));
  const campaignManifestCounts = new Map<string, number>();
  let manifests = 0;
  let clean = 0;
  let dirty = 0;

  for (const record of records) {
    const campaign = record['campaign_directory'];
    if (campaign === undefined || campaign === '') {
      throw new AuditError(`Registry "${registryPath}" contains a row with no campaign_directory`);
    }
    if (campaignManifestCounts.has(campaign)) {
      throw new AuditError(`Registry "${registryPath}" lists campaign "${campaign}" twice`);
    }
    const count = readIntegerColumn(record, 'manifest_count', registryPath);
    campaignManifestCounts.set(campaign, count);
    manifests += count;
    clean += readIntegerColumn(record, 'clean_manifest_count', registryPath);
    dirty += readIntegerColumn(record, 'dirty_manifest_count', registryPath);
  }

  if (clean + dirty !== manifests) {
    throw new AuditError(
      `Registry "${registryPath}" is internally inconsistent: ${clean} clean + ${dirty} dirty != ${manifests} manifests`,
    );
  }

  return {
    campaigns: campaignManifestCounts.size,
    manifests,
    clean,
    dirty,
    campaignManifestCounts,
  };
};

export interface ReconciliationCounts {
  readonly campaigns: number;
  readonly manifests: number;
  readonly clean: number;
  readonly dirty: number;
}

export const countRuns = (runs: readonly DiscoveredRun[]): ReconciliationCounts => {
  const campaigns = new Set(runs.map((run) => run.campaign));
  const dirty = runs.filter((run) => run.dirtyWorktree).length;
  return {
    campaigns: campaigns.size,
    manifests: runs.length,
    clean: runs.length - dirty,
    dirty,
  };
};

/**
 * Aborts unless the discovered set matches the registry exactly, in totals and per campaign.
 * Clean/dirty status comes from each manifest's `dirty_worktree`, never from a directory name.
 */
export const reconcileWithRegistry = (
  runs: readonly DiscoveredRun[],
  expectation: RegistryExpectation,
): ReconciliationCounts => {
  const observed = countRuns(runs);
  const problems: string[] = [];

  if (observed.manifests !== expectation.manifests) {
    problems.push(`manifests: discovered ${observed.manifests}, registry ${expectation.manifests}`);
  }
  if (observed.campaigns !== expectation.campaigns) {
    problems.push(`campaigns: discovered ${observed.campaigns}, registry ${expectation.campaigns}`);
  }
  if (observed.clean !== expectation.clean) {
    problems.push(`clean manifests: discovered ${observed.clean}, registry ${expectation.clean}`);
  }
  if (observed.dirty !== expectation.dirty) {
    problems.push(`dirty manifests: discovered ${observed.dirty}, registry ${expectation.dirty}`);
  }

  const observedPerCampaign = new Map<string, number>();
  for (const run of runs) {
    observedPerCampaign.set(run.campaign, (observedPerCampaign.get(run.campaign) ?? 0) + 1);
  }
  for (const [campaign, expected] of expectation.campaignManifestCounts) {
    const actual = observedPerCampaign.get(campaign);
    if (actual === undefined) {
      problems.push(`campaign "${campaign}" is in the registry but was not discovered`);
    } else if (actual !== expected) {
      problems.push(`campaign "${campaign}": discovered ${actual}, registry ${expected}`);
    }
  }
  for (const campaign of observedPerCampaign.keys()) {
    if (!expectation.campaignManifestCounts.has(campaign)) {
      problems.push(`campaign "${campaign}" was discovered but is not in the registry`);
    }
  }

  if (problems.length > 0) {
    throw new AuditError(
      `Discovered evidence does not match the committed registry. The registry is authoritative and is not adjusted to fit.\n  - ${problems.join('\n  - ')}`,
    );
  }
  return observed;
};

export const joinRoot = (root: string, relativePath: string): string =>
  join(root, ...relativePath.split('/'));
