#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  defaultConcurrency,
  executeBatch,
  type BatchRunOutcome,
  type LiveProgress,
} from "./batch.js";

import {
  canonicalJson,
  parseEngineConfig,
  sha256,
  type EngineConfig,
} from "@tierra-sim/engine";

import { executeBenchmark, type BenchmarkProgress, type BenchmarkReport } from "./benchmark.js";
import { exportBenchmarkBundle } from "./benchmark-export.js";
import { requiredCalibrationSweepPath } from "./cli-options.js";
import { executeAndExportCalibrationSweep } from "./calibration-export.js";
import {
  executeCalibrationSweep,
  loadCalibrationSweep,
  type CalibrationCandidateIdentity,
  type CalibrationCandidateSummary,
  type CalibrationSweepReport,
} from "./calibration-sweep.js";
import { exportCompletedRun } from "./export.js";
import { executeRun } from "./run.js";
import type { RecordedSample } from "./types.js";

const runnerDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(runnerDirectory, "..");

interface ParsedArguments {
  readonly command: "demo" | "run" | "benchmark" | "calibrate" | "batch" | "fixture-digest" | "help";
  readonly values: ReadonlyMap<string, string | true>;
}

function usage(): string {
  return `TIERRA-SIM headless runner

Usage:
  npm run demo -- [--ticks N] [--seed N] [--run-id ID] [--output DIRECTORY]
  npm run run:headless -- --config FILE [--fixture FILE] [--output DIRECTORY]
  npm run benchmark -- [--ticks N] [--seed N] [--report-every N] [--output DIRECTORY]
  npm run calibrate -- --sweep FILE [--ticks N] [--limit N] [--output DIRECTORY]\n  node runner/dist/cli.js batch --batch FILE --output DIRECTORY [--concurrency N]
  npm run fixture:digest -- --fixture FILE

Commands:
  demo  Run the versioned first-look ecology preset. No files are written unless --output is used.
  run   Run a resolved JSON configuration and its content-addressed ancestor fixture.
  benchmark  Run the dense calibration/performance preset and report ecology plus resource use.
  calibrate  Run one explicitly named multi-candidate calibration screen.\n  batch  Execute a table of independent runs in parallel child processes.
  fixture-digest  Print the canonical fixture SHA-256 required by a configuration.

Options:
  --ticks N          Override demo or benchmark duration (positive integer).
  --seed N           Override demo or benchmark seed (unsigned 32-bit integer).
  --run-id ID        Override demo or benchmark run identifier.
  --config FILE      Resolved engine configuration for the run command.
  --fixture FILE     Ancestor fixture; defaults to fixture_path relative to Simulator/.
  --sweep FILE       Versioned calibration sweep specification.
  --limit N          Execute only the first N candidates and mark the result development-only.
  --output DIRECTORY Atomically retain a run or benchmark bundle beneath DIRECTORY.
  --benchmark-id ID  Stable retained benchmark directory name.
  --report-every N   Performance progress interval; must be a multiple of sample_every_ticks.
  --target-ticks N   Tick count used only for the labelled linear planning projection (default 500000).
  --run-count N      Run count used only for the labelled batch planning projection (default 60).
  --retain-events    Retain detailed events in the benchmark's standard run payload.
  --no-events        Disable detailed event retention for a demo or benchmark.
  --quiet            Suppress per-sample progress lines.
  --help             Show this help.
`;
}

function parseArguments(arguments_: readonly string[]): ParsedArguments {
  const first = arguments_[0];
  if (first === undefined || first === "--help" || first === "-h") {
    return { command: "help", values: new Map() };
  }
  if (
    first !== "demo" &&
    first !== "run" &&
    first !== "benchmark" &&
    first !== "calibrate" &&
    first !== "batch" &&
    first !== "fixture-digest"
  ) {
    throw new Error(`Unknown command: ${first}`);
  }
  const values = new Map<string, string | true>();
  for (let index = 1; index < arguments_.length; index += 1) {
    const argument = arguments_[index] as string;
    if (!argument.startsWith("--")) {
      throw new Error(`Unexpected positional argument: ${argument}`);
    }
    const key = argument.slice(2);
    if (["quiet", "no-events", "retain-events", "help"].includes(key)) {
      values.set(key, true);
      continue;
    }
    const value = arguments_[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Option --${key} requires a value.`);
    }
    values.set(key, value);
    index += 1;
  }
  return { command: first, values };
}

function stringOption(values: ReadonlyMap<string, string | true>, key: string): string | null {
  const value = values.get(key);
  return typeof value === "string" ? value : null;
}

function integerOption(
  values: ReadonlyMap<string, string | true>,
  key: string,
  minimum: number,
  maximum: number,
): number | null {
  const value = stringOption(values, key);
  if (value === null) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`--${key} must be an integer in [${minimum}, ${maximum}].`);
  }
  return parsed;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

function interval(current: number, previous: number): number {
  return current - previous;
}

function progressLine(sample: RecordedSample): string {
  const measurement = sample.measurement;
  const current = measurement.cumulative_counters;
  const previous = sample.previous_counters;
  const meanDelta = measurement.divergence?.total.mean_divergence;
  const formattedDelta = meanDelta === null || meanDelta === undefined ? "undefined" : meanDelta.toFixed(3);
  return [
    `tick ${String(measurement.tick).padStart(5)}`,
    `population ${measurement.state.population_total} (H ${measurement.state.host_population}, P ${measurement.state.parasite_population})`,
    `births +${interval(current.births, previous.births)}`,
    `HGT ${interval(current.hgt_successes, previous.hgt_successes)}/${interval(current.hgt_attempts, previous.hgt_attempts)}`,
    `mean delta ${formattedDelta}`,
  ].join(" | ");
}

async function demoInputs(values: ReadonlyMap<string, string | true>): Promise<{
  configuration: EngineConfig;
  fixture: unknown;
}> {
  const configurationPath = resolve(runnerDirectory, "presets/demo-config.json");
  const fixturePath = resolve(runnerDirectory, "presets/demo-fixture.json");
  const configuration = (await readJson(configurationPath)) as EngineConfig;
  const fixture = await readJson(fixturePath);
  const ticks = integerOption(values, "ticks", 1, Number.MAX_SAFE_INTEGER);
  const seed = integerOption(values, "seed", 0, 0xffff_ffff);
  const runId = stringOption(values, "run-id");
  if (ticks !== null) {
    configuration.duration.completed_ticks = ticks;
  }
  if (seed !== null) {
    configuration.identity.seed = seed;
  }
  if (runId !== null) {
    configuration.identity.run_id = runId;
  }
  if (values.has("no-events")) {
    configuration.measurement.detailed_event_logging = false;
  }
  return { configuration, fixture };
}

async function runInputs(values: ReadonlyMap<string, string | true>): Promise<{
  configuration: unknown;
  fixture: unknown;
}> {
  const configurationOption = stringOption(values, "config");
  if (configurationOption === null) {
    throw new Error("The run command requires --config FILE.");
  }
  const configurationPath = resolve(configurationOption);
  const configuration = await readJson(configurationPath);
  const parsed = parseEngineConfig(configuration);
  const fixtureOption = stringOption(values, "fixture");
  const fixturePath =
    fixtureOption === null
      ? resolve(workspaceRoot, parsed.initial_population.fixture_path)
      : resolve(fixtureOption);
  return { configuration, fixture: await readJson(fixturePath) };
}

async function benchmarkInputs(values: ReadonlyMap<string, string | true>): Promise<{
  configuration: EngineConfig;
  fixture: unknown;
}> {
  const configurationOption = stringOption(values, "config");
  let configuration: EngineConfig;
  let fixture: unknown;
  if (configurationOption === null) {
    configuration = (await readJson(
      resolve(runnerDirectory, "presets/calibration-performance-config.json"),
    )) as EngineConfig;
    fixture = await readJson(
      resolve(runnerDirectory, "presets/calibration-performance-fixture.json"),
    );
  } else {
    const inputs = await runInputs(values);
    configuration = structuredClone(parseEngineConfig(inputs.configuration)) as EngineConfig;
    fixture = inputs.fixture;
  }
  const ticks = integerOption(values, "ticks", 1, Number.MAX_SAFE_INTEGER);
  const seed = integerOption(values, "seed", 0, 0xffff_ffff);
  const runId = stringOption(values, "run-id");
  if (ticks !== null) {
    configuration.duration.completed_ticks = ticks;
  }
  if (seed !== null) {
    configuration.identity.seed = seed;
  }
  if (runId !== null) {
    configuration.identity.run_id = runId;
  }
  if (values.has("retain-events")) {
    configuration.measurement.detailed_event_logging = true;
  }
  if (values.has("no-events")) {
    configuration.measurement.detailed_event_logging = false;
  }
  return { configuration, fixture };
}

function formatDuration(milliseconds: number | null): string {
  if (milliseconds === null) {
    return "undefined";
  }
  const seconds = milliseconds / 1_000;
  if (seconds < 120) {
    return `${seconds.toFixed(1)} s`;
  }
  const minutes = seconds / 60;
  if (minutes < 120) {
    return `${minutes.toFixed(1)} min`;
  }
  return `${(minutes / 60).toFixed(1)} h`;
}

/**
 * Human clock formatting for long batches: `45s`, `3m 35s`, `11h 45m`.
 *
 * Distinct from `formatDuration`, which reports sub-second benchmark timings in decimal units.
 * Takes **milliseconds**, like `formatDuration` — passing seconds is the defect this replaced.
 */
export function formatClock(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }
  return `${seconds}s`;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) {
    return "not retained";
  }
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1_024 && unit < units.length - 1) {
    value /= 1_024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`;
}

function benchmarkProgressLine(progress: BenchmarkProgress): string {
  const eligible = progress.divergence_eligible_proportion;
  return [
    `tick ${String(progress.tick).padStart(7)}`,
    `${progress.interval_ticks_per_second.toFixed(0)} tick/s`,
    `${progress.cumulative_activations_per_second.toFixed(0)} activation/s`,
    `occupancy ${(progress.occupancy_proportion * 100).toFixed(1)}%`,
    `RSS ${formatBytes(progress.memory.rss_bytes)}`,
    `eligible ${eligible === null ? "undefined" : `${(eligible * 100).toFixed(1)}%`}`,
  ].join(" | ");
}

function benchmarkSummary(report: BenchmarkReport): string {
  const ecology = report.ecology;
  const energy = ecology.energy_balance;
  return [
    `\nBenchmark ${report.benchmark_id} ${report.terminal_reason} at tick ${report.completed_ticks}.`,
    `Throughput: ${report.performance.ticks_per_second.toFixed(1)} ticks/s; ${report.performance.activations_per_second.toFixed(0)} organism activations/s.`,
    `Execution: ${formatDuration(report.performance.tick_loop_wall_ms)} tick loop + ${formatDuration(report.performance.post_terminal_finalization_wall_ms)} final hash/pedigree materialisation${report.performance.evidence_export_wall_ms === null ? "" : ` + ${formatDuration(report.performance.evidence_export_wall_ms)} retained export`}.`,
    `Peak RSS: ${formatBytes(report.performance.peak_rss_bytes)}; retained evidence: ${formatBytes(report.storage?.retained_run_bytes ?? null)}.`,
    `Occupancy: ${(ecology.occupancy.initial_proportion * 100).toFixed(1)}% initially, ${(ecology.occupancy.final_proportion * 100).toFixed(1)}% finally; extinction ${ecology.extinction.occurred ? `at tick ${ecology.extinction.tick}` : "not observed"}.`,
    `Pedigree: ${ecology.pedigree.organisms_ever_born.toLocaleString()} organisms recorded, ${ecology.pedigree.organisms_living.toLocaleString()} living.`,
    `Energy ledger residual: ${energy.ledger_residual}; computation supplied ${energy.computation_share_of_created_energy === null ? "undefined" : `${(energy.computation_share_of_created_energy * 100).toFixed(1)}%`} of created energy.`,
    `HGT: ${ecology.hgt_opportunity.donor_opportunities}/${ecology.hgt_opportunity.splice_instruction_attempts} attempts found a donor; ${ecology.hgt_opportunity.successes} succeeded.`,
    `Mutation: ${ecology.mutation_exposure.attempted_total} attempted, ${ecology.mutation_exposure.accepted_total} accepted.`,
    `Naive ${report.scaling_projection.target_ticks.toLocaleString()}-tick projection: ${formatDuration(report.scaling_projection.naive_single_run_wall_ms)} per run and ${formatDuration(report.scaling_projection.naive_sequential_batch_wall_ms)} for ${report.scaling_projection.run_count} sequential runs.`,
  ].join("\n");
}

async function runBenchmarkCommand(values: ReadonlyMap<string, string | true>): Promise<void> {
  const inputs = await benchmarkInputs(values);
  const parsed = parseEngineConfig(inputs.configuration);
  const reportEvery =
    integerOption(values, "report-every", 1, Number.MAX_SAFE_INTEGER) ??
    parsed.duration.sample_every_ticks * 5;
  const targetTicks =
    integerOption(values, "target-ticks", 1, Number.MAX_SAFE_INTEGER) ?? 500_000;
  const runCount = integerOption(values, "run-count", 1, Number.MAX_SAFE_INTEGER) ?? 60;
  const benchmarkId =
    stringOption(values, "benchmark-id") ?? `${parsed.identity.run_id}-benchmark`;
  const quiet = values.has("quiet");
  const completed = executeBenchmark({
    ...inputs,
    benchmark_id: benchmarkId,
    report_every_ticks: reportEvery,
    projection_target_ticks: targetTicks,
    projection_run_count: runCount,
    ...(quiet
      ? {}
      : {
          onProgress: (progress: BenchmarkProgress): void => {
            process.stdout.write(`${benchmarkProgressLine(progress)}\n`);
          },
        }),
  });
  const outputRoot = stringOption(values, "output");
  if (outputRoot === null) {
    process.stdout.write(`${benchmarkSummary(completed.report)}\n`);
    process.stdout.write(
      "No files written. Add --output ../Experiments/raw-data/calibration to retain the benchmark and standard auditable run.\n",
    );
    return;
  }
  const exported = await exportBenchmarkBundle(completed.run, completed.report, {
    output_root: outputRoot,
    workspace_root: workspaceRoot,
  });
  process.stdout.write(`${benchmarkSummary(exported.report)}\n`);
  process.stdout.write(`Benchmark evidence written atomically to ${exported.path}\n`);
}

function calibrationCandidateLine(
  candidate: CalibrationCandidateIdentity,
  total: number,
): string {
  return [
    `\nCandidate ${candidate.execution_index}/${total}`,
    `income ${candidate.environmental_income}`,
    candidate.exec_nbr_attempt_cost === null
      ? null
      : `EXEC_NBR cost ${candidate.exec_nbr_attempt_cost}`,
    candidate.exec_nbr_donor_copy_rule === null
      ? null
      : `donor rule ${candidate.exec_nbr_donor_copy_rule}`,
    candidate.autonomous_reproduction_cost === null
      ? null
      : `autonomous cost ${candidate.autonomous_reproduction_cost}`,
    candidate.reproduction_cooldown_ticks === null
      ? null
      : `cooldown ${candidate.reproduction_cooldown_ticks}`,
    candidate.resource_regeneration_per_tick === null
      ? null
      : `resource regen ${candidate.resource_regeneration_per_tick}`,
    candidate.resource_harvest_per_activation === null
      ? null
      : `harvest cap ${candidate.resource_harvest_per_activation}`,
    `death ${candidate.exogenous_death_probability.numerator}/${candidate.exogenous_death_probability.denominator}`,
    `seed ${candidate.seed}`,
  ].filter((value): value is string => value !== null).join(" | ");
}

function percent(value: number | null): string {
  return value === null ? "undefined" : `${(value * 100).toFixed(1)}%`;
}

function calibrationCompletedLine(summary: CalibrationCandidateSummary): string {
  return [
    `candidate complete`,
    `late occupancy ${percent(summary.occupancy.late_mean_proportion)}`,
    `lineage floor ${percent(summary.lineage_survival.minimum_final_lineage_proportion)}`,
    `eligible ${percent(summary.measurement_eligibility.late_mean_eligible_proportion)}`,
    `resource ${percent(summary.local_resources.late_mean_stock_proportion)}`,
    `gates ${summary.ecological_gate_passes} ecological passes, ${summary.mandatory_gate_failures} mandatory failures`,
  ].join(" | ");
}

function calibrationSummary(report: CalibrationSweepReport): string {
  const label = report.stage === "mechanism_control"
    ? "Calibration mechanism control"
    : "Calibration screen";
  const lines = [
    `\n${label} ${report.sweep_id} completed: ${report.screening_pass_count}/${report.executed_candidate_count} candidates passed every screening gate.`,
  ];
  for (const candidate of report.candidates.slice(0, 5)) {
    lines.push(
      `rank ${candidate.rank}: income ${candidate.environmental_income}, death ${candidate.exogenous_death_probability.label}, occupancy ${percent(candidate.occupancy.late_mean_proportion)}, resource ${percent(candidate.local_resources.late_mean_stock_proportion)}, interaction through ${candidate.interaction_exposure.last_sample_tick_with_both_lineages ?? "none"}, eligibility ${percent(candidate.measurement_eligibility.late_mean_eligible_proportion)}, ecological gates ${candidate.ecological_gate_passes}.`,
    );
  }
  if (report.development_override.ticks !== null || report.development_override.candidate_limit !== null) {
    lines.push("This was a development-only override and cannot qualify a confirmation candidate.");
  }
  return lines.join("\n");
}

async function runCalibrationCommand(values: ReadonlyMap<string, string | true>): Promise<void> {
  const sweepPath = requiredCalibrationSweepPath(values);
  const loaded = await loadCalibrationSweep(sweepPath, workspaceRoot);
  const ticksOverride = integerOption(values, "ticks", 1, Number.MAX_SAFE_INTEGER) ?? undefined;
  const candidateLimit = integerOption(values, "limit", 1, Number.MAX_SAFE_INTEGER) ?? undefined;
  const targetTicks =
    integerOption(values, "target-ticks", 1, Number.MAX_SAFE_INTEGER) ?? 500_000;
  const runCount = integerOption(values, "run-count", 1, Number.MAX_SAFE_INTEGER) ?? 60;
  const quiet = values.has("quiet");
  const total = Math.min(
    loaded.specification.factors.environmental_income.length *
      loaded.specification.factors.exogenous_death_probability.length *
      (loaded.specification.factors.autonomous_reproduction_cost?.length ?? 1) *
      (loaded.specification.factors.reproduction_cooldown_ticks?.length ?? 1) *
      (loaded.specification.factors.exec_nbr_attempt_cost?.length ?? 1) *
      (loaded.specification.factors.exec_nbr_donor_copy_rule?.length ?? 1) *
      (loaded.specification.factors.resource_regeneration_per_tick?.length ?? 1) *
      (loaded.specification.factors.resource_harvest_per_activation?.length ?? 1) *
      loaded.specification.replicate_seeds.length,
    candidateLimit ?? Number.MAX_SAFE_INTEGER,
  );
  const callbacks = quiet
    ? {}
    : {
        onCandidateStarted: (candidate: CalibrationCandidateIdentity): void => {
          process.stdout.write(`${calibrationCandidateLine(candidate, total)}\n`);
        },
        onCandidateProgress: (
          _candidate: CalibrationCandidateIdentity,
          progress: BenchmarkProgress,
        ): void => {
          process.stdout.write(`${benchmarkProgressLine(progress)}\n`);
        },
        onCandidateCompleted: (
          _completed: unknown,
          summary: CalibrationCandidateSummary,
        ): void => {
          process.stdout.write(`${calibrationCompletedLine(summary)}\n`);
        },
      };
  const executionOptions = {
    ...(ticksOverride === undefined ? {} : { ticks_override: ticksOverride }),
    ...(candidateLimit === undefined ? {} : { candidate_limit: candidateLimit }),
    projection_target_ticks: targetTicks,
    projection_run_count: runCount,
    ...callbacks,
  };
  const outputRoot = stringOption(values, "output");
  if (outputRoot === null) {
    const report = await executeCalibrationSweep(loaded, executionOptions);
    process.stdout.write(`${calibrationSummary(report)}\n`);
    process.stdout.write(
      "No files written. Add --output ../Experiments/raw-data/calibration to retain the governed sweep bundle.\n",
    );
    return;
  }
  const exported = await executeAndExportCalibrationSweep(loaded, {
    ...executionOptions,
    output_root: outputRoot,
    workspace_root: workspaceRoot,
  });
  process.stdout.write(`${calibrationSummary(exported.report)}\n`);
  process.stdout.write(`Calibration evidence written atomically to ${exported.path}\n`);
}

async function main(): Promise<void> {
  const parsedArguments = parseArguments(process.argv.slice(2));
  if (parsedArguments.command === "help" || parsedArguments.values.has("help")) {
    process.stdout.write(usage());
    return;
  }
  if (parsedArguments.command === "fixture-digest") {
    const fixtureOption = stringOption(parsedArguments.values, "fixture");
    if (fixtureOption === null) {
      throw new Error("The fixture-digest command requires --fixture FILE.");
    }
    const fixture = await readJson(resolve(fixtureOption));
    process.stdout.write(`${sha256(canonicalJson(fixture))}\n`);
    return;
  }
  if (parsedArguments.command === "benchmark") {
    await runBenchmarkCommand(parsedArguments.values);
    return;
  }
  if (parsedArguments.command === "calibrate") {
    await runCalibrationCommand(parsedArguments.values);
    return;
  }
  if (parsedArguments.command === "batch") {
    await runBatchCommand(parsedArguments.values);
    return;
  }
  const inputs =
    parsedArguments.command === "demo"
      ? await demoInputs(parsedArguments.values)
      : await runInputs(parsedArguments.values);
  const quiet = parsedArguments.values.has("quiet");
  const completed = executeRun({
    ...inputs,
    ...(quiet
      ? {}
      : {
          onSample: (sample: RecordedSample): void => {
            process.stdout.write(`${progressLine(sample)}\n`);
          },
        }),
  });
  const finalSample = completed.samples.at(-1)?.measurement;
  process.stdout.write(
    `\nRun ${parseEngineConfig(completed.configuration).identity.run_id} ${completed.terminal_reason} at tick ${completed.completed_ticks}.\n`,
  );
  process.stdout.write(
    `Final population: ${finalSample?.state.population_total ?? 0}; organisms ever born: ${completed.lineage_records.length}.\n`,
  );
  process.stdout.write(`Final scientific state hash: ${completed.final_state_hash}\n`);

  const outputRoot = stringOption(parsedArguments.values, "output");
  if (outputRoot === null) {
    process.stdout.write("No files written. Add --output ./runs to retain an auditable run directory.\n");
  } else {
    const outputPath = await exportCompletedRun(completed, {
      output_root: outputRoot,
      workspace_root: workspaceRoot,
    });
    process.stdout.write(`Results written atomically to ${outputPath}\n`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`TIERRA-SIM runner error: ${message}\n`);
  process.exitCode = 1;
});

async function runBatchCommand(values: ReadonlyMap<string, string | true>): Promise<void> {
  const specification = stringOption(values, "batch");
  if (specification === null) {
    throw new Error("The batch command requires --batch FILE.");
  }
  const output = stringOption(values, "output");
  if (output === null) {
    throw new Error("The batch command requires --output DIRECTORY.");
  }
  const concurrencyOption = stringOption(values, "concurrency");
  const concurrency =
    concurrencyOption === null ? defaultConcurrency() : Number.parseInt(concurrencyOption, 10);
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new Error("--concurrency must be a positive integer.");
  }

  // The run count is known from the specification before anything executes, so the first
  // heartbeat reports a real denominator instead of a placeholder.
  let totalRuns: number | null = null;
  try {
    const declared = (await readJson(resolve(specification))) as { runs?: unknown };
    if (Array.isArray(declared.runs)) {
      totalRuns = declared.runs.length;
    }
  } catch {
    // executeBatch performs the authoritative parse and will report any real problem.
  }

  process.stdout.write(
    `Launching batch preset "${specification}" with concurrency ${concurrency}` +
      `${totalRuns === null ? "" : ` over ${totalRuns} runs`}...\n`,
  );

  const startTime = Date.now();
  let completedCount = 0;

  // Holder rather than a bare variable: assignment happens inside a callback, which
  // control-flow analysis cannot see, and would otherwise narrow the call site to never.
  const liveProgress: { current: (() => LiveProgress) | null } = { current: null };
  const heartbeat = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const total = totalRuns;
    const live = liveProgress.current?.();
    // Fractional progress counts each in-flight run by how far through it is, so a long single
    // run reports movement instead of sitting at 0% for its whole duration.
    const effective = live?.effectiveCompleted ?? completedCount;
    const share = total === null || total === 0 ? null : (effective / total) * 100;
    const active = live?.activeWorkers ?? Math.min(concurrency, (total ?? concurrency) - completedCount);
    const eta =
      total !== null && effective > 0 ? (total - effective) * (elapsed / effective) : null;
    process.stdout.write(
      `[Heartbeat ${formatClock(elapsed)}] ${completedCount}/${total ?? "?"} runs` +
        `${share === null ? "" : `, ${share.toFixed(1)}% overall`} | ${active} active` +
        `${eta === null ? "" : ` | EST remaining: ${formatClock(eta)}`}\n`,
    );
  }, 60_000);
  // Never keep the process alive for a timer; the batch decides when it is finished.
  heartbeat.unref();

  try {
    const report = await executeBatch({
      specificationPath: specification,
      outputRoot: output,
      concurrency,
      onLiveProgress: (live): void => {
        liveProgress.current = live;
      },
      onProgress: (outcome, completed, total): void => {
        completedCount = completed;
        totalRuns = total;
        const pct = ((completed / total) * 100).toFixed(1);
        const elapsed = Date.now() - startTime;
        // Wall clock per completed run already reflects the pool running in parallel, so dividing
        // by concurrency again would understate the remaining time by that factor.
        const remaining = (total - completed) * (elapsed / completed);
        const status = outcome.exit_code === 0 ? "ok" : `FAILED (exit ${outcome.exit_code})`;
        process.stdout.write(
          `[${completed}/${total} (${pct}%)] ${outcome.run_id} ${status} in ${formatClock(outcome.duration_seconds * 1_000)}` +
            ` | Elapsed: ${formatClock(elapsed)} | EST remaining: ${formatClock(remaining)}\n`,
        );
      },
    });

    process.stdout.write(
      `\nBatch ${report.batch_id}: ${report.succeeded}/${report.run_count} succeeded at concurrency ${report.concurrency} in ${formatClock(report.wall_clock_seconds * 1_000)}.\n`,
    );
    if (report.failed > 0) {
      for (const outcome of report.outcomes.filter((candidate) => candidate.exit_code !== 0)) {
        process.stdout.write(`  FAILED ${outcome.run_id}: ${outcome.stderr_tail ?? "no stderr"}\n`);
      }
      process.exitCode = 1;
    }
  } finally {
    clearInterval(heartbeat);
  }
}
