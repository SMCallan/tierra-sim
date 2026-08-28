/**
 * Parallel batch execution of independent runs.
 *
 * The formal programme is a table of independent runs, not a parameter search, so each run is
 * executed as its own `run` child process rather than in-process. That buys real parallelism on
 * multiple cores, isolates a crash to a single run, and reuses the already-governed `run` command
 * unchanged — this orchestrator adds no science and changes no engine behaviour.
 *
 * Every resolved configuration is written to the output before execution, so the batch carries its
 * own provenance and a rerun does not depend on regenerating inputs.
 */

import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { cpus } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson, sha256 } from "@tierra-sim/engine";

const RUNNER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export interface BatchRunSpecification {
  readonly run_id: string;
  readonly condition_id: string;
  readonly replicate_id: number;
  readonly seed: number;
  /** Partial configuration merged over the base, for factorial conditions. */
  readonly overrides?: Record<string, unknown>;
}

export interface BatchSpecification {
  readonly schema_version: string;
  readonly batch_id: string;
  readonly base_configuration_path: string;
  readonly fixture_path: string;
  readonly runs: readonly BatchRunSpecification[];
}

export interface BatchRunOutcome {
  readonly run_id: string;
  readonly condition_id: string;
  readonly replicate_id: number;
  readonly seed: number;
  readonly exit_code: number;
  readonly duration_seconds: number;
  readonly output_directory: string;
  readonly stderr_tail: string | null;
}

export interface BatchReport {
  readonly batch_id: string;
  readonly specification_sha256: string;
  readonly concurrency: number;
  readonly run_count: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly wall_clock_seconds: number;
  readonly outcomes: readonly BatchRunOutcome[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Recursive merge used for condition overrides. Arrays replace rather than concatenate. */
export function mergeConfiguration(
  base: Record<string, unknown>,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    const existing = merged[key];
    merged[key] =
      isPlainObject(existing) && isPlainObject(value)
        ? mergeConfiguration(existing, value)
        : value;
  }
  return merged;
}

function resolveFromRunnerRoot(path: string): string {
  return isAbsolute(path) ? path : resolve(RUNNER_ROOT, path);
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

/**
 * Builds the resolved configuration for one run: base, then condition overrides, then the
 * identity fields the batch controls. Identity is applied last so a condition override cannot
 * silently change which run a bundle claims to be.
 */
export function resolveRunConfiguration(
  baseConfiguration: Record<string, unknown>,
  run: BatchRunSpecification,
): Record<string, unknown> {
  const withOverrides = mergeConfiguration(
    structuredClone(baseConfiguration),
    run.overrides ?? {},
  );
  const identity = isPlainObject(withOverrides["identity"])
    ? { ...(withOverrides["identity"] as Record<string, unknown>) }
    : {};
  identity["run_id"] = run.run_id;
  identity["condition_id"] = run.condition_id;
  identity["replicate_id"] = run.replicate_id;
  identity["seed"] = run.seed;
  withOverrides["identity"] = identity;
  return withOverrides;
}

/**
 * Default concurrency: half the reported cores, minimum one.
 *
 * A batch is an unusually harsh thermal load — every worker pins a core at 100% with no idle gaps
 * for hours, which is a harder sustained load than a GPU-bound game where the CPU waits on frames.
 * Saturating every core for a twelve-hour run drives sustained thermal throttling, and a throttled
 * pool can finish no faster than a smaller unthrottled one while running far hotter.
 *
 * Half also avoids counting efficiency cores as if they were performance cores: `cpus().length`
 * reports both on Apple Silicon, and scheduling heavy work onto efficiency cores buys little.
 *
 * This is a deliberately conservative default for long unattended runs. Pass `--concurrency` to
 * override it when the machine is well cooled or the batch is short.
 */
export function defaultConcurrency(): number {
  return Math.max(1, Math.floor(cpus().length / 2));
}

function executeOne(
  configurationPath: string,
  fixturePath: string,
  runsDirectory: string,
  run: BatchRunSpecification,
  onTick?: (tick: number) => void,
): Promise<BatchRunOutcome> {
  return new Promise((resolveOutcome) => {
    const startedAt = Date.now();
    const child = spawn(
      process.execPath,
      [
        resolve(RUNNER_ROOT, "runner", "dist", "cli.js"),
        "run",
        "--config",
        configurationPath,
        "--fixture",
        fixturePath,
        "--output",
        runsDirectory,
        // Progress lines are the child's only channel for within-run position. They are parsed
        // and discarded here, never echoed, so the cost is one small regex per sample rather than
        // any accumulation: at a 200-tick sample interval a 250,000-tick run emits ~1,250 lines.
        ...(onTick === undefined ? ["--quiet"] : []),
      ],
      { stdio: ["ignore", onTick === undefined ? "ignore" : "pipe", "pipe"] },
    );
    if (onTick !== undefined && child.stdout !== null) {
      let pending = "";
      child.stdout.on("data", (chunk: Buffer) => {
        pending += chunk.toString();
        let newline = pending.indexOf("\n");
        while (newline !== -1) {
          const line = pending.slice(0, newline);
          pending = pending.slice(newline + 1);
          // Only lines that begin with the tick marker are of interest; everything else is
          // dropped without further inspection.
          if (line.startsWith("tick")) {
            const parsed = Number.parseInt(line.slice(4).trimStart(), 10);
            if (Number.isSafeInteger(parsed)) {
              onTick(parsed);
            }
          }
          newline = pending.indexOf("\n");
        }
        // A partial line is bounded by one progress line's length; it can never accumulate.
        if (pending.length > 4096) {
          pending = "";
        }
      });
    }
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      resolveOutcome({
        run_id: run.run_id,
        condition_id: run.condition_id,
        replicate_id: run.replicate_id,
        seed: run.seed,
        exit_code: code ?? -1,
        duration_seconds: Number(((Date.now() - startedAt) / 1000).toFixed(3)),
        output_directory: runsDirectory,
        stderr_tail: stderr.length === 0 ? null : stderr.slice(-2000),
      });
    });
  });
}

export interface BatchOptions {
  readonly specificationPath: string;
  readonly outputRoot: string;
  readonly concurrency?: number;
  readonly onProgress?: (outcome: BatchRunOutcome, completed: number, total: number) => void;
  /**
   * Live position of the workers, refreshed as children report ticks. Reading it is O(active
   * workers) and allocation-free, so a heartbeat can call it as often as it likes.
   */
  readonly onLiveProgress?: (live: () => LiveProgress) => void;
}

export interface LiveProgress {
  /** Completed runs plus the fractional position of each run still in flight. */
  readonly effectiveCompleted: number;
  readonly activeWorkers: number;
}

export async function executeBatch(options: BatchOptions): Promise<BatchReport> {
  const specificationPath = resolve(options.specificationPath);
  const rawSpecification = await readJson(specificationPath);
  const specification = rawSpecification as BatchSpecification;
  if (!Array.isArray(specification.runs) || specification.runs.length === 0) {
    throw new Error("Batch specification declares no runs.");
  }

  const seenRunIds = new Set<string>();
  for (const run of specification.runs) {
    if (seenRunIds.has(run.run_id)) {
      throw new Error(`Batch specification repeats run_id "${run.run_id}".`);
    }
    seenRunIds.add(run.run_id);
  }

  const batchDirectory = join(resolve(options.outputRoot), specification.batch_id);
  if (existsSync(batchDirectory)) {
    // Raw results are immutable; a batch never writes into an existing bundle.
    throw new Error(
      `Batch output directory already exists: ${batchDirectory}. Choose a new --output.`,
    );
  }
  const configurationsDirectory = join(batchDirectory, "configurations");
  const runsDirectory = join(batchDirectory, "runs");
  await mkdir(configurationsDirectory, { recursive: true });
  await mkdir(runsDirectory, { recursive: true });

  const baseConfiguration = (await readJson(
    resolveFromRunnerRoot(specification.base_configuration_path),
  )) as Record<string, unknown>;
  const fixturePath = resolveFromRunnerRoot(specification.fixture_path);

  // Materialise every resolved configuration before executing anything, so the inputs are frozen
  // and on disk even if the batch is interrupted partway.
  const prepared: { run: BatchRunSpecification; configurationPath: string }[] = [];
  for (const run of specification.runs) {
    const configuration = resolveRunConfiguration(baseConfiguration, run);
    const configurationPath = join(configurationsDirectory, `${run.run_id}.json`);
    await writeFile(configurationPath, `${JSON.stringify(configuration, null, 2)}\n`);
    prepared.push({ run, configurationPath });
  }

  // Ticks requested per run, read once from the resolved configuration rather than re-derived.
  const requestedTicks = new Map<string, number>();
  for (const { run, configurationPath } of prepared) {
    const configuration = (await readJson(configurationPath)) as {
      duration?: { completed_ticks?: number };
    };
    requestedTicks.set(run.run_id, configuration.duration?.completed_ticks ?? 0);
  }
  // Two small numbers per in-flight run; entries are removed as runs finish, so this never grows
  // beyond the pool size.
  const liveTicks = new Map<string, number>();

  const concurrency = Math.max(1, options.concurrency ?? defaultConcurrency());
  options.onLiveProgress?.((): LiveProgress => {
    let fractional = 0;
    for (const [runId, tick] of liveTicks) {
      const target = requestedTicks.get(runId) ?? 0;
      if (target > 0) {
        fractional += Math.min(1, tick / target);
      }
    }
    return { effectiveCompleted: completed + fractional, activeWorkers: liveTicks.size };
  });

  const startedAt = Date.now();
  const outcomes: BatchRunOutcome[] = [];
  let nextIndex = 0;
  let completed = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      const item = prepared[index];
      if (item === undefined) {
        return;
      }
      const outcome = await executeOne(
        item.configurationPath,
        fixturePath,
        runsDirectory,
        item.run,
        options.onLiveProgress === undefined
          ? undefined
          : (tick): void => {
              liveTicks.set(item.run.run_id, tick);
            },
      );
      liveTicks.delete(item.run.run_id);
      outcomes.push(outcome);
      completed += 1;
      options.onProgress?.(outcome, completed, prepared.length);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, prepared.length) }, worker));

  outcomes.sort((left, right) => (left.run_id < right.run_id ? -1 : left.run_id > right.run_id ? 1 : 0));
  const failed = outcomes.filter((outcome) => outcome.exit_code !== 0).length;
  const report: BatchReport = {
    batch_id: specification.batch_id,
    specification_sha256: sha256(canonicalJson(rawSpecification)),
    concurrency,
    run_count: prepared.length,
    succeeded: outcomes.length - failed,
    failed,
    wall_clock_seconds: Number(((Date.now() - startedAt) / 1000).toFixed(3)),
    outcomes,
  };
  await writeFile(
    join(batchDirectory, "batch-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
}
