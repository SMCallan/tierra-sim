/**
 * SCI-001 post-v8 diagnostic audit — command-line entry point.
 *
 * Implements the SCI-001 post-v8 diagnostic audit specification, as amended by its v1.1
 * amendment.
 * Read-only with respect to every input. Writes only the declared tables in the declared
 * output directory. Emits no timestamp, hostname, or absolute path into any payload (risk R-002).
 *
 * Usage: node src/diagnostics/audit.ts [--raw-root <dir>] [--registry <csv>] [--output <dir>]
 *        [--sweep <json>]
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { formatNumber, renderCsv, type CsvRow, type NumberFormat } from './csv.ts';
import {
  AuditError,
  discoverRuns,
  joinRoot,
  loadRegistryExpectation,
  reconcileWithRegistry,
  type DiscoveredRun,
  type ReconciliationCounts,
} from './discovery.ts';
import {
  findChecksumLists,
  summariseRunIntegrity,
  verifyChecksumList,
  type ChecksumListResult,
} from './integrity.ts';
import {
  approximateOrganismTicks,
  computeExposureMetrics,
  computeOccupancyMetrics,
  computeSampledLineageState,
  definedMetric,
  definedOnlyMean,
  requireConsistentReportEveryTicks,
  undefinedMetric,
  type CumulativeCounters,
  type MetricValue,
} from './metrics.ts';
import {
  evaluateScreen,
  loadSweepSpecification,
  type LoadedSweepSpecification,
  type ScreenEvaluation,
  type ScreenRun,
} from './screen.ts';
import { readTimeseries } from './timeseries.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ANALYSIS_ROOT = resolve(HERE, '..', '..');
const PROJECT_ROOT = resolve(ANALYSIS_ROOT, '..');

export const DEFAULT_RAW_ROOT = resolve(
  PROJECT_ROOT,
  'Experiments/raw-data/external-diagnostics',
);
export const DEFAULT_REGISTRY = resolve(
  PROJECT_ROOT,
  'Experiments/diagnostics/post-v8-2026-07-19/campaign-inventory.csv',
);
export const DEFAULT_OUTPUT = resolve(
  PROJECT_ROOT,
  'Experiments/processed-data/diagnostics/post-v8-2026-07-19',
);
export const DEFAULT_SWEEP = resolve(
  PROJECT_ROOT,
  'Simulator/runner/presets/calibration-sweep-v8.json',
);

export const RUN_INVENTORY_COLUMNS = [
  'campaign',
  'run_id',
  'condition_id',
  'replicate_id',
  'seed',
  'source_git_commit',
  'dirty_worktree',
  'requested_ticks',
  'completed_ticks',
  'terminal_reason',
  'output_schema_version',
  'engine_version',
  'runner_version',
  'manifest_relative_path',
  'integrity',
] as const;

export const INTEGRITY_RECEIPT_COLUMNS = [
  'campaign',
  'checksum_list_relative_path',
  'entries_listed',
  'entries_present',
  'entries_verified',
  'entries_mismatched',
] as const;

const EXPOSURE_RATE_NAMES = [
  'births_rate_per_1000_activations',
  'deaths_total_rate_per_1000_activations',
  'autonomous_attempts_rate_per_1000_activations',
  'autonomous_successes_rate_per_1000_activations',
  'exploitative_attempts_rate_per_1000_activations',
  'exploitative_successes_rate_per_1000_activations',
  'hgt_attempts_rate_per_1000_activations',
  'hgt_successes_rate_per_1000_activations',
  'computation_rewards_rate_per_1000_activations',
  'energy_transferred_rate_per_1000_activations',
] as const;

const RATIO_NAMES = [
  'autonomous_success_ratio',
  'exploitative_success_ratio',
  'hgt_success_ratio',
  'late_window_mean_occupancy',
  'late_window_maximum_occupancy',
  'whole_run_maximum_occupancy',
] as const;

const APPROXIMATE_NAMES = ['organism_ticks_approx'] as const;

const SAMPLED_TICK_NAMES = [
  'both_lineages_observed_through_tick',
  'first_sampled_lineage_absence_tick',
  'global_extinction_tick',
  'last_sample_tick_with_cross_lineage_contact',
] as const;

const MEAN_METRICS: ReadonlyArray<{ readonly name: string; readonly format: NumberFormat }> = [
  ...EXPOSURE_RATE_NAMES.map((name) => ({ name, format: 'rate' as const })),
  ...RATIO_NAMES.map((name) => ({ name, format: 'ratio' as const })),
  ...APPROXIMATE_NAMES.map((name) => ({ name, format: 'rate' as const })),
  ...SAMPLED_TICK_NAMES.map((name) => ({ name, format: 'rate' as const })),
  { name: 'whole_run_exploitative_successes', format: 'rate' },
];

const withReasonColumns = (names: readonly string[]): string[] =>
  names.flatMap((name) => [name, `${name}_undefined_reason`]);

export const RUN_METRICS_COLUMNS = [
  'campaign',
  'run_id',
  'evidence_label',
  'dirty_worktree',
  'requested_ticks',
  'completed_ticks',
  'terminal_reason',
  'report_every_ticks',
  ...withReasonColumns(EXPOSURE_RATE_NAMES),
  ...withReasonColumns(RATIO_NAMES),
  ...withReasonColumns(APPROXIMATE_NAMES),
  ...withReasonColumns(SAMPLED_TICK_NAMES),
  'extinct_lineage',
  'extinct_lineage_undefined_reason',
  'whole_run_exploitative_successes',
] as const;

export const CAMPAIGN_SUMMARY_COLUMNS = [
  'campaign',
  'evidence_label',
  'run_count',
  'clean_run_count',
  'dirty_run_count',
  'completed_count',
  'extinction_count',
  'report_every_ticks',
  ...MEAN_METRICS.flatMap(({ name }) => [
    `${name}_mean`,
    `${name}_mean_undefined_reason`,
    `${name}_defined_n`,
    `${name}_undefined_n`,
  ]),
] as const;

export const SCREEN_EVALUATION_COLUMNS = [
  'run_id',
  'gate_key',
  'observed_value',
  'threshold',
  'comparison',
  'result',
  'reason',
] as const;

export interface AuditOptions {
  readonly rawRoot: string;
  readonly registryPath: string;
  readonly outputDirectory: string;
  /** Omission preserves SCI-001b's programmatic discovery-only test surface. CLI always sets it. */
  readonly sweepPath?: string;
}

export interface AuditResult {
  readonly counts: ReconciliationCounts;
  readonly runInventoryCsv: string;
  readonly integrityReceiptCsv: string;
  readonly runMetricsCsv: string;
  readonly campaignSummaryCsv: string;
  readonly screenEvaluationCsv: string;
  readonly checksumListCount: number;
  readonly entriesListed: number;
  readonly entriesVerified: number;
  readonly entriesMismatched: number;
  readonly entriesMissing: number;
  readonly runsFailingIntegrity: readonly string[];
}

const buildRunRow = (run: DiscoveredRun, integrity: string): CsvRow => ({
  campaign: run.campaign,
  run_id: run.runId,
  condition_id: run.conditionId,
  replicate_id: run.replicateId,
  seed: run.seed,
  source_git_commit: run.sourceGitCommit,
  dirty_worktree: run.dirtyWorktree,
  requested_ticks: run.requestedTicks,
  completed_ticks: run.completedTicks,
  terminal_reason: run.terminalReason,
  output_schema_version: run.outputSchemaVersion,
  engine_version: run.engineVersion,
  runner_version: run.runnerVersion,
  manifest_relative_path: run.manifestRelativePath,
  integrity,
});

type NumericOutputs = Record<string, number | null>;

interface AnalysedRun {
  readonly run: DiscoveredRun;
  readonly row: CsvRow;
  readonly numericOutputs: NumericOutputs;
  readonly reportEveryTicks: number;
  readonly screenRun: ScreenRun;
}

const readJsonObject = (path: string, label: string): Record<string, unknown> => {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new AuditError(`${label} "${path}" is not a JSON object`);
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof AuditError) {
      throw error;
    }
    throw new AuditError(`${label} "${path}" is not valid JSON: ${(error as Error).message}`);
  }
};

const requireObject = (
  parent: Readonly<Record<string, unknown>>,
  field: string,
  label: string,
): Record<string, unknown> => {
  const value = parent[field];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AuditError(`${label} field "${field}" must be an object`);
  }
  return value as Record<string, unknown>;
};

const requireNumber = (
  parent: Readonly<Record<string, unknown>>,
  field: string,
  label: string,
): number => {
  const value = parent[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AuditError(`${label} field "${field}" must be a finite number`);
  }
  return value;
};

const requireInteger = (
  parent: Readonly<Record<string, unknown>>,
  field: string,
  label: string,
): number => {
  const value = requireNumber(parent, field, label);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new AuditError(`${label} field "${field}" must be a non-negative safe integer`);
  }
  return value;
};

const requireString = (
  parent: Readonly<Record<string, unknown>>,
  field: string,
  label: string,
): string => {
  const value = parent[field];
  if (typeof value !== 'string') {
    throw new AuditError(`${label} field "${field}" must be a string`);
  }
  return value;
};

const loadCounters = (run: DiscoveredRun): CumulativeCounters & { readonly energy_created: number } => {
  const label = `Manifest ${run.manifestRelativePath} cumulative_counters`;
  const counters = requireObject(run.manifest, 'cumulative_counters', `Manifest ${run.manifestRelativePath}`);
  return {
    activations: requireInteger(counters, 'activations', label),
    births: requireInteger(counters, 'births', label),
    deaths_energy: requireInteger(counters, 'deaths_energy', label),
    deaths_exogenous: requireInteger(counters, 'deaths_exogenous', label),
    deaths_exploitation: requireInteger(counters, 'deaths_exploitation', label),
    autonomous_attempts: requireInteger(counters, 'autonomous_attempts', label),
    autonomous_successes: requireInteger(counters, 'autonomous_successes', label),
    exploitative_attempts: requireInteger(counters, 'exploitative_attempts', label),
    exploitative_successes: requireInteger(counters, 'exploitative_successes', label),
    hgt_attempts: requireInteger(counters, 'hgt_attempts', label),
    hgt_successes: requireInteger(counters, 'hgt_successes', label),
    computation_rewards: requireInteger(counters, 'computation_rewards', label),
    energy_transferred: requireInteger(counters, 'energy_transferred', label),
    energy_created: requireInteger(counters, 'energy_created', label),
  };
};

const addNumericOutput = (
  row: CsvRow,
  outputs: NumericOutputs,
  name: string,
  metric: { readonly value: number | null; readonly undefinedReason: string | null },
  format: NumberFormat,
): void => {
  row[name] = metric.value === null ? null : formatNumber(metric.value, format);
  row[`${name}_undefined_reason`] = metric.undefinedReason;
  outputs[name] = metric.value;
};

const analyseRun = (
  run: DiscoveredRun,
  rawRoot: string,
  sweep: LoadedSweepSpecification,
): AnalysedRun => {
  const directory = run.runRelativeDirectory;
  const configPath = joinRoot(rawRoot, `${directory}/resolved-config.json`);
  const summaryPath = joinRoot(rawRoot, `${directory}/final-summary.json`);
  const timeseriesPath = joinRoot(rawRoot, `${directory}/timeseries.csv`);
  const config = readJsonObject(configPath, 'Resolved configuration');
  const summary = readJsonObject(summaryPath, 'Final summary');
  const samples = readTimeseries(timeseriesPath, run.runId);

  const world = requireObject(config, 'world', `Resolved configuration ${run.manifestRelativePath}`);
  const duration = requireObject(
    config,
    'duration',
    `Resolved configuration ${run.manifestRelativePath}`,
  );
  const energy = requireObject(config, 'energy', `Resolved configuration ${run.manifestRelativePath}`);
  const reproduction = requireObject(
    config,
    'reproduction',
    `Resolved configuration ${run.manifestRelativePath}`,
  );
  const computationRewards = requireObject(
    energy,
    'computation_rewards',
    `Resolved configuration ${run.manifestRelativePath} energy`,
  );
  const gridWidth = requireInteger(world, 'width', `Resolved configuration ${run.manifestRelativePath} world`);
  const gridHeight = requireInteger(world, 'height', `Resolved configuration ${run.manifestRelativePath} world`);
  const configuredMinimumGenomeLength = requireInteger(
    reproduction,
    'min_genome_length',
    `Resolved configuration ${run.manifestRelativePath} reproduction`,
  );
  const configuredMaximumGenomeLength = requireInteger(
    reproduction,
    'max_genome_length',
    `Resolved configuration ${run.manifestRelativePath} reproduction`,
  );
  if (
    configuredMinimumGenomeLength === 0 ||
    configuredMinimumGenomeLength > configuredMaximumGenomeLength
  ) {
    throw new AuditError(
      `Run ${run.runId} has invalid configured genome bounds ${configuredMinimumGenomeLength}..${configuredMaximumGenomeLength}`,
    );
  }
  const reportEveryTicks = requireInteger(
    duration,
    'sample_every_ticks',
    `Resolved configuration ${run.manifestRelativePath} duration`,
  );
  if (reportEveryTicks !== sweep.reportEveryTicks) {
    throw new AuditError(
      `Run ${run.runId} sample_every_ticks ${reportEveryTicks} disagrees with sweep report_every_ticks ${sweep.reportEveryTicks}`,
    );
  }
  const configuredTicks = requireInteger(
    duration,
    'completed_ticks',
    `Resolved configuration ${run.manifestRelativePath} duration`,
  );
  if (configuredTicks !== run.requestedTicks) {
    throw new AuditError(
      `Run ${run.runId} configured ticks ${configuredTicks} disagree with manifest requested_ticks ${run.requestedTicks}`,
    );
  }
  const computationRewardAmounts = Object.entries(computationRewards)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([name, value]) => {
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
        throw new AuditError(
          `Run ${run.runId} computation reward "${name}" is not a non-negative safe integer`,
        );
      }
      return value;
    });

  const summaryCompletedTicks = requireInteger(summary, 'completed_ticks', `Final summary ${run.runId}`);
  const summaryTerminalReason = requireString(summary, 'terminal_reason', `Final summary ${run.runId}`);
  if (
    summaryCompletedTicks !== run.completedTicks ||
    summaryTerminalReason !== run.terminalReason
  ) {
    throw new AuditError(`Run ${run.runId} manifest and final summary terminal state disagree`);
  }
  const finalPopulation = requireObject(summary, 'final_population', `Final summary ${run.runId}`);
  const finalPopulationValues = {
    populationTotal: requireInteger(finalPopulation, 'population_total', `Final summary ${run.runId} final_population`),
    hostPopulation: requireInteger(finalPopulation, 'host_population', `Final summary ${run.runId} final_population`),
    parasitePopulation: requireInteger(finalPopulation, 'parasite_population', `Final summary ${run.runId} final_population`),
  };

  const counters = loadCounters(run);
  const exposure = computeExposureMetrics(counters);
  const occupancy = computeOccupancyMetrics(
    samples,
    gridWidth,
    gridHeight,
    run.requestedTicks,
    run.completedTicks,
    run.terminalReason,
    sweep.lateWindowFraction,
  );
  const organismTicks = approximateOrganismTicks(samples);
  const sampledState = computeSampledLineageState(
    samples,
    run.completedTicks,
    run.terminalReason,
  );
  const evidenceLabel =
    run.campaign === 'qualification-sweep' ? 'qualification-like (dirty)' : 'diagnostic';
  if (run.campaign === 'qualification-sweep' && !run.dirtyWorktree) {
    throw new AuditError(`Qualification-like run ${run.runId} is unexpectedly marked clean`);
  }

  const row: CsvRow = {
    campaign: run.campaign,
    run_id: run.runId,
    evidence_label: evidenceLabel,
    dirty_worktree: run.dirtyWorktree,
    requested_ticks: run.requestedTicks,
    completed_ticks: run.completedTicks,
    terminal_reason: run.terminalReason,
    report_every_ticks: reportEveryTicks,
  };
  const numericOutputs: NumericOutputs = {};
  const exposureRecord = exposure as unknown as Readonly<Record<string, MetricValue>>;
  for (const name of EXPOSURE_RATE_NAMES) {
    addNumericOutput(row, numericOutputs, name, exposureRecord[name] as MetricValue, 'rate');
  }
  for (const name of RATIO_NAMES.slice(0, 3)) {
    addNumericOutput(row, numericOutputs, name, exposureRecord[name] as MetricValue, 'ratio');
  }
  addNumericOutput(
    row,
    numericOutputs,
    'late_window_mean_occupancy',
    occupancy.late_window_mean_occupancy,
    'ratio',
  );
  addNumericOutput(
    row,
    numericOutputs,
    'late_window_maximum_occupancy',
    occupancy.late_window_maximum_occupancy,
    'ratio',
  );
  addNumericOutput(
    row,
    numericOutputs,
    'whole_run_maximum_occupancy',
    occupancy.whole_run_maximum_occupancy,
    'ratio',
  );
  addNumericOutput(row, numericOutputs, 'organism_ticks_approx', organismTicks, 'rate');
  addNumericOutput(
    row,
    numericOutputs,
    'both_lineages_observed_through_tick',
    sampledState.bothLineagesObservedThroughTick,
    'integer',
  );
  addNumericOutput(
    row,
    numericOutputs,
    'first_sampled_lineage_absence_tick',
    sampledState.firstSampledLineageAbsenceTick,
    'integer',
  );
  addNumericOutput(
    row,
    numericOutputs,
    'global_extinction_tick',
    sampledState.globalExtinctionTick,
    'integer',
  );
  addNumericOutput(
    row,
    numericOutputs,
    'last_sample_tick_with_cross_lineage_contact',
    sampledState.lastSampleTickWithCrossLineageContact,
    'integer',
  );
  row['extinct_lineage'] = sampledState.extinctLineage.value;
  row['extinct_lineage_undefined_reason'] = sampledState.extinctLineage.undefinedReason;
  row['whole_run_exploitative_successes'] = counters.exploitative_successes;
  numericOutputs['whole_run_exploitative_successes'] = counters.exploitative_successes;

  return {
    run,
    row,
    numericOutputs,
    reportEveryTicks,
    screenRun: {
      runId: run.runId,
      dirtyWorktree: run.dirtyWorktree,
      requestedTicks: run.requestedTicks,
      completedTicks: run.completedTicks,
      terminalReason: run.terminalReason,
      gridWidth,
      gridHeight,
      configuredMinimumGenomeLength,
      configuredMaximumGenomeLength,
      computationRewardAmounts,
      counters,
      finalPopulation: finalPopulationValues,
      samples,
    },
  };
};

const buildCampaignSummary = (runs: readonly AnalysedRun[]): CsvRow[] => {
  const byCampaign = new Map<string, AnalysedRun[]>();
  for (const run of runs) {
    const bucket = byCampaign.get(run.run.campaign);
    if (bucket === undefined) {
      byCampaign.set(run.run.campaign, [run]);
    } else {
      bucket.push(run);
    }
  }
  return [...byCampaign.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([campaign, campaignRuns]) => {
      const dirty = campaignRuns.filter((run) => run.run.dirtyWorktree).length;
      const row: CsvRow = {
        campaign,
        evidence_label:
          campaign === 'qualification-sweep' ? 'qualification-like (dirty)' : 'diagnostic',
        run_count: campaignRuns.length,
        clean_run_count: campaignRuns.length - dirty,
        dirty_run_count: dirty,
        completed_count: campaignRuns.filter((run) => run.run.terminalReason === 'completed').length,
        extinction_count: campaignRuns.filter((run) => run.run.terminalReason === 'extinction').length,
        report_every_ticks: requireConsistentReportEveryTicks(
          campaignRuns.map((run) => run.reportEveryTicks),
          campaign,
        ),
      };
      for (const { name, format } of MEAN_METRICS) {
        const aggregate = definedOnlyMean(
          campaignRuns.map((run) => {
            const value = run.numericOutputs[name];
            return value === null || value === undefined
              ? undefinedMetric('no_samples')
              : definedMetric(value);
          }),
        );
        row[`${name}_mean`] =
          aggregate.mean.value === null ? null : formatNumber(aggregate.mean.value, format);
        row[`${name}_mean_undefined_reason`] = aggregate.mean.undefinedReason;
        row[`${name}_defined_n`] = aggregate.definedN;
        row[`${name}_undefined_n`] = aggregate.undefinedN;
      }
      return row;
    });
};

const screenFormat = (gateKey: string): NumberFormat => {
  if (gateKey === 'minimum_late_mean_host_parasite_contact_edges') {
    return 'rate';
  }
  if (
    gateKey.includes('occupancy') ||
    gateKey.includes('proportion') ||
    gateKey.includes('share')
  ) {
    return 'ratio';
  }
  if (gateKey === 'maximum_projected_single_run_minutes') {
    return 'rate';
  }
  return 'integer';
};

export const screenEvaluationRow = (evaluation: ScreenEvaluation): CsvRow => {
  const format = screenFormat(evaluation.gateKey);
  return {
    run_id: evaluation.runId,
    gate_key: evaluation.gateKey,
    observed_value:
      evaluation.observedValue === null
        ? null
        : formatNumber(evaluation.observedValue, format),
    threshold: formatNumber(evaluation.threshold, format),
    comparison: evaluation.comparison,
    result: evaluation.result,
    reason: evaluation.reason,
  };
};

/**
 * Runs the audit and returns the rendered tables without writing them, so tests can assert on
 * content and callers can decide whether to persist.
 */
export const runAudit = async (options: AuditOptions): Promise<AuditResult> => {
  const runs = discoverRuns(options.rawRoot);
  const expectation = loadRegistryExpectation(options.registryPath);
  const counts = reconcileWithRegistry(runs, expectation);

  const listResults: ChecksumListResult[] = [];
  for (const listPath of findChecksumLists(options.rawRoot)) {
    listResults.push(await verifyChecksumList(options.rawRoot, listPath));
  }
  listResults.sort((left, right) =>
    left.listRelativePath < right.listRelativePath
      ? -1
      : left.listRelativePath > right.listRelativePath
        ? 1
        : 0,
  );

  // A run's own bundle is covered by the checksum list in its own directory. Sweep- and
  // candidate-level lists cover wider file sets and are reported independently in the receipt.
  const listsByDirectory = new Map<string, ChecksumListResult[]>();
  for (const result of listResults) {
    const directory = result.listRelativePath.split('/').slice(0, -1).join('/');
    const bucket = listsByDirectory.get(directory);
    if (bucket === undefined) {
      listsByDirectory.set(directory, [result]);
    } else {
      bucket.push(result);
    }
  }

  const runsFailingIntegrity: string[] = [];
  const runRows = runs.map((run) => {
    const own = listsByDirectory.get(run.runRelativeDirectory) ?? [];
    const integrity = summariseRunIntegrity(own);
    if (integrity !== 'verified') {
      runsFailingIntegrity.push(`${run.runId} (${integrity})`);
    }
    return buildRunRow(run, integrity);
  });

  let analysedRuns: AnalysedRun[] = [];
  let screenRows: CsvRow[] = [];
  if (options.sweepPath !== undefined) {
    const sweep = loadSweepSpecification(options.sweepPath);
    analysedRuns = runs.map((run) => analyseRun(run, options.rawRoot, sweep));
    screenRows = analysedRuns.flatMap((run) =>
      evaluateScreen(run.screenRun, sweep).map((evaluation) =>
        screenEvaluationRow(evaluation),
      ),
    );
  }

  const receiptRows: CsvRow[] = listResults.map((result) => ({
    campaign: result.campaign,
    checksum_list_relative_path: result.listRelativePath,
    entries_listed: result.entriesListed,
    entries_present: result.entriesPresent,
    entries_verified: result.entriesVerified,
    entries_mismatched: result.entriesMismatched,
  }));

  const entriesListed = listResults.reduce((total, result) => total + result.entriesListed, 0);
  const entriesVerified = listResults.reduce((total, result) => total + result.entriesVerified, 0);
  const entriesMismatched = listResults.reduce(
    (total, result) => total + result.entriesMismatched,
    0,
  );
  const entriesPresent = listResults.reduce((total, result) => total + result.entriesPresent, 0);

  return {
    counts,
    runInventoryCsv: renderCsv(RUN_INVENTORY_COLUMNS, runRows),
    integrityReceiptCsv: renderCsv(INTEGRITY_RECEIPT_COLUMNS, receiptRows),
    runMetricsCsv: renderCsv(
      RUN_METRICS_COLUMNS,
      analysedRuns.map((run) => run.row),
    ),
    campaignSummaryCsv: renderCsv(CAMPAIGN_SUMMARY_COLUMNS, buildCampaignSummary(analysedRuns)),
    screenEvaluationCsv: renderCsv(SCREEN_EVALUATION_COLUMNS, screenRows),
    checksumListCount: listResults.length,
    entriesListed,
    entriesVerified,
    entriesMismatched,
    entriesMissing: entriesListed - entriesPresent,
    runsFailingIntegrity,
  };
};

export const parseArguments = (argv: readonly string[]): AuditOptions => {
  let rawRoot = DEFAULT_RAW_ROOT;
  let registryPath = DEFAULT_REGISTRY;
  let outputDirectory = DEFAULT_OUTPUT;
  let sweepPath = DEFAULT_SWEEP;

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      flag === '--raw-root' ||
      flag === '--registry' ||
      flag === '--output' ||
      flag === '--sweep'
    ) {
      if (value === undefined) {
        throw new AuditError(`${flag} requires a path`);
      }
      if (flag === '--raw-root') {
        rawRoot = resolve(value);
      } else if (flag === '--registry') {
        registryPath = resolve(value);
      } else if (flag === '--output') {
        outputDirectory = resolve(value);
      } else {
        sweepPath = resolve(value);
      }
      index += 1;
      continue;
    }
    throw new AuditError(`Unrecognised argument "${String(flag)}"`);
  }

  return { rawRoot, registryPath, outputDirectory, sweepPath };
};

export const writeAudit = (options: AuditOptions, result: AuditResult): void => {
  mkdirSync(options.outputDirectory, { recursive: true });
  writeFileSync(resolve(options.outputDirectory, 'run-inventory.csv'), result.runInventoryCsv);
  writeFileSync(
    resolve(options.outputDirectory, 'integrity-receipt.csv'),
    result.integrityReceiptCsv,
  );
  writeFileSync(resolve(options.outputDirectory, 'run-metrics.csv'), result.runMetricsCsv);
  writeFileSync(
    resolve(options.outputDirectory, 'campaign-summary.csv'),
    result.campaignSummaryCsv,
  );
  writeFileSync(
    resolve(options.outputDirectory, 'screen-evaluation.csv'),
    result.screenEvaluationCsv,
  );

  const registrySha256 = createHash('sha256')
    .update(readFileSync(options.registryPath))
    .digest('hex');

  const toolFiles = readdirSync(HERE)
    .filter((file) => file.endsWith('.ts'))
    .sort();
  const toolSourceSha256: Record<string, string> = {};
  for (const file of toolFiles) {
    toolSourceSha256[file] = createHash('sha256')
      .update(readFileSync(resolve(HERE, file)))
      .digest('hex');
  }

  const provenance = {
    specification_version: '1.0',
    cli_entry_point: 'src/diagnostics/audit.ts',
    discovery_root: 'Experiments/raw-data/external-diagnostics',
    registry_sha256: registrySha256,
    discovered_counts: {
      manifests: result.counts.manifests,
      campaigns: result.counts.campaigns,
      clean: result.counts.clean,
      dirty: result.counts.dirty,
    },
    tool_source_sha256: toolSourceSha256,
  };

  writeFileSync(
    resolve(options.outputDirectory, 'provenance.json'),
    `${JSON.stringify(provenance, null, 2)}\n`,
  );
};

const isEntryPoint = (): boolean => {
  const entry = process.argv[1];
  return entry !== undefined && resolve(entry) === resolve(fileURLToPath(import.meta.url));
};

if (isEntryPoint()) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const result = await runAudit(options);
    writeAudit(options, result);

    process.stdout.write(
      [
        'SCI-001 discovery and integrity audit',
        `  manifests discovered : ${result.counts.manifests}`,
        `  campaigns            : ${result.counts.campaigns}`,
        `  clean / dirty        : ${result.counts.clean} / ${result.counts.dirty}`,
        `  checksum lists       : ${result.checksumListCount}`,
        `  entries listed       : ${result.entriesListed}`,
        `  entries verified     : ${result.entriesVerified}`,
        `  entries mismatched   : ${result.entriesMismatched}`,
        `  entries missing      : ${result.entriesMissing}`,
        `  runs failing integrity: ${
          result.runsFailingIntegrity.length === 0
            ? 'none'
            : result.runsFailingIntegrity.join(', ')
        }`,
        `  metric rows          : ${result.runMetricsCsv.trimEnd().split('\n').length - 1}`,
        `  campaign rows        : ${result.campaignSummaryCsv.trimEnd().split('\n').length - 1}`,
        `  screened clean runs  : ${
          new Set(
            result.screenEvaluationCsv
              .trimEnd()
              .split('\n')
              .slice(1)
              .map((line) => line.split(',')[0]),
          ).size
        }`,
        '',
      ].join('\n'),
    );
  } catch (error) {
    process.stderr.write(
      `${error instanceof AuditError ? 'AUDIT FAILED' : 'UNEXPECTED FAILURE'}: ${(error as Error).message}\n`,
    );
    process.exitCode = 1;
  }
}
