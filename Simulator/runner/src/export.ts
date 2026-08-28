import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

import {
  canonicalJson,
  DeathCause,
  EcologicalOperation,
  EcologicalResultCode,
  parseEngineConfig,
  type RunCounters,
} from "@tierra-sim/engine";

import type { CompletedRun, MechanismCounters, RecordedSample } from "./types.js";
import {
  aggregateLineageDiagnostics,
  aggregateLineageMechanisms,
  assertLineageDiagnosticIdentities,
  lineageDiagnosticIdentityResiduals,
} from "./diagnostics.js";
import { NODE_SHA256_IMPLEMENTATION } from "./node-sha256.js";

export interface ExportOptions {
  readonly output_root: string;
  readonly workspace_root: string;
}

interface PayloadDescription {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}

function sortedJsonValue(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Output JSON cannot contain NaN or Infinity.");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortedJsonValue);
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, item]) => [key, sortedJsonValue(item)]),
    );
  }
  throw new TypeError(`Unsupported output JSON value: ${typeof value}.`);
}

function prettyJson(value: unknown): string {
  return `${JSON.stringify(sortedJsonValue(value), null, 2)}\n`;
}

function compactJson(value: unknown): string {
  return JSON.stringify(sortedJsonValue(value));
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new TypeError("CSV output cannot contain NaN or Infinity.");
  }
  const text = String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsvStream(
  filePath: string,
  rows: readonly Record<string, unknown>[],
): Promise<void> {
  if (rows.length === 0) {
    return writeFile(filePath, "", "utf8");
  }
  return new Promise((resolveStream, rejectStream) => {
    const stream = createWriteStream(filePath, { encoding: "utf8" });
    stream.on("error", rejectStream);
    stream.on("finish", resolveStream);

    const columns = Object.keys(rows[0] as Record<string, unknown>);
    stream.write(`${columns.map(csvCell).join(",")}\n`);
    for (const row of rows) {
      stream.write(`${columns.map((column) => csvCell(row[column])).join(",")}\n`);
    }
    stream.end();
  });
}

function writeNdjsonStream(
  filePath: string,
  items: readonly unknown[],
): Promise<void> {
  if (items.length === 0) {
    return writeFile(filePath, "", "utf8");
  }
  return new Promise((resolveStream, rejectStream) => {
    const stream = createWriteStream(filePath, { encoding: "utf8" });
    stream.on("error", rejectStream);
    stream.on("finish", resolveStream);

    for (const item of items) {
      stream.write(`${compactJson(item)}\n`);
    }
    stream.end();
  });
}

function totalDeaths(counters: Readonly<RunCounters>): number {
  return counters.deaths_exogenous + counters.deaths_energy + counters.deaths_exploitation;
}

function addDivergenceColumns(
  row: Record<string, unknown>,
  sample: RecordedSample,
): void {
  const divergence = sample.measurement.divergence;
  for (const lineage of ["total", "host", "parasite"] as const) {
    const summary = divergence?.[lineage] ?? null;
    const prefix = `${lineage}_`;
    row[`${prefix}eligible_count`] = summary?.eligible_count ?? null;
    row[`${prefix}eligible_proportion`] = summary?.eligible_proportion ?? null;
    row[`${prefix}inactive_count`] = summary?.inactive_count ?? null;
    row[`${prefix}inactive_proportion`] = summary?.inactive_proportion ?? null;
    row[`${prefix}mean_delta`] = summary?.mean_divergence ?? null;
    row[`${prefix}median_delta`] = summary?.median_divergence ?? null;
    row[`${prefix}q25_delta`] = summary?.q25_divergence ?? null;
    row[`${prefix}q75_delta`] = summary?.q75_divergence ?? null;
    row[`${prefix}mean_exploitative_tendency`] =
      summary?.mean_exploitative_tendency ?? null;
    row[`${prefix}window_autonomous_successes`] = summary?.autonomous_successes ?? null;
    row[`${prefix}window_exploitative_successes`] = summary?.exploitative_successes ?? null;
  }
}

function addClassColumns(row: Record<string, unknown>, sample: RecordedSample): void {
  const classes = sample.measurement.functional_classes;
  for (const lineage of ["total", "host", "parasite"] as const) {
    for (const functionalClass of [
      "autonomous",
      "mixed",
      "exploitative",
      "inactive",
    ] as const) {
      row[`${lineage}_${functionalClass}_count`] = classes?.[lineage][functionalClass] ?? null;
    }
  }
}

function addLineageIntervalColumns(
  row: Record<string, unknown>,
  lineage: "host" | "parasite",
  counters: MechanismCounters,
): void {
  for (const [key, value] of Object.entries(counters)) {
    row[`interval_${lineage}_${key}`] = value;
  }
}

function addLineageDiagnosticColumns(
  row: Record<string, unknown>,
  sample: RecordedSample,
): void {
  for (const lineage of ["host", "parasite"] as const) {
    for (const operation of Object.values(EcologicalOperation)) {
      for (const result of Object.values(EcologicalResultCode)) {
        row[`interval_${lineage}_${operation}_${result}`] =
          sample.lineage_operation_results[lineage][operation][result];
      }
    }
    for (const cause of Object.values(DeathCause)) {
      row[`interval_${lineage}_deaths_${cause}`] =
        sample.lineage_death_causes[lineage][cause];
    }
  }
}

function interval(current: number, previous: number, label: string): number {
  const difference = current - previous;
  if (!Number.isSafeInteger(difference) || difference < 0) {
    throw new Error(`Cumulative counter ${label} moved backwards or overflowed.`);
  }
  return difference;
}

function sampleRow(sample: RecordedSample): Record<string, unknown> {
  const measurement = sample.measurement;
  const current = measurement.cumulative_counters;
  const previous = sample.previous_counters;
  const resources = measurement.resources;
  const previousResources = sample.previous_resource_counters;
  const row: Record<string, unknown> = {
    run_id: measurement.run_id,
    condition_id: measurement.condition_id,
    replicate_id: measurement.replicate_id,
    tick: measurement.tick,
    sample_kind: measurement.sample_kind,
    state_hash: measurement.state_hash,
    population_total: measurement.state.population_total,
    host_population: measurement.state.host_population,
    parasite_population: measurement.state.parasite_population,
    mean_energy: measurement.state.mean_energy,
    total_energy: measurement.state.total_energy,
    mean_genome_length: measurement.state.mean_genome_length,
    minimum_genome_length: measurement.state.minimum_genome_length,
    maximum_genome_length: measurement.state.maximum_genome_length,
    minimum_genome_bound_count: measurement.state.minimum_genome_bound_count,
    maximum_genome_bound_count: measurement.state.maximum_genome_bound_count,
    maximum_generation: measurement.state.maximum_generation,
    mean_age_ticks: measurement.state.mean_age_ticks,
    spatial_occupied_occupied_edges:
      measurement.spatial_structure.occupied_occupied_edges,
    spatial_same_lineage_edges: measurement.spatial_structure.same_lineage_edges,
    spatial_host_host_edges: measurement.spatial_structure.host_host_edges,
    spatial_parasite_parasite_edges:
      measurement.spatial_structure.parasite_parasite_edges,
    spatial_host_parasite_contact_edges:
      measurement.spatial_structure.host_parasite_contact_edges,
    spatial_occupied_empty_boundary_edges:
      measurement.spatial_structure.occupied_empty_boundary_edges,
    spatial_same_lineage_edge_proportion:
      measurement.spatial_structure.same_lineage_edge_proportion,
    host_patch_count: measurement.spatial_structure.host.patch_count,
    host_largest_patch_size: measurement.spatial_structure.host.largest_patch_size,
    host_largest_patch_proportion:
      measurement.spatial_structure.host.largest_patch_proportion,
    host_mean_patch_size: measurement.spatial_structure.host.mean_patch_size,
    host_singleton_patch_count: measurement.spatial_structure.host.singleton_patch_count,
    parasite_patch_count: measurement.spatial_structure.parasite.patch_count,
    parasite_largest_patch_size:
      measurement.spatial_structure.parasite.largest_patch_size,
    parasite_largest_patch_proportion:
      measurement.spatial_structure.parasite.largest_patch_proportion,
    parasite_mean_patch_size: measurement.spatial_structure.parasite.mean_patch_size,
    parasite_singleton_patch_count:
      measurement.spatial_structure.parasite.singleton_patch_count,
    resource_total_capacity: resources?.total_capacity ?? null,
    resource_total_stock: resources?.total_stock ?? null,
    resource_stock_proportion: resources?.stock_proportion ?? null,
    resource_mean_stock: resources?.mean_stock ?? null,
    resource_depleted_cells: resources?.depleted_cells ?? null,
    resource_saturated_cells: resources?.saturated_cells ?? null,
    resource_occupied_total_stock: resources?.occupied_total_stock ?? null,
    resource_occupied_mean_stock: resources?.occupied_mean_stock ?? null,
    resource_empty_total_stock: resources?.empty_total_stock ?? null,
    resource_empty_mean_stock: resources?.empty_mean_stock ?? null,
    cumulative_resource_regenerated: resources?.cumulative_regenerated ?? null,
    cumulative_resource_harvested: resources?.cumulative_harvested ?? null,
    cumulative_resource_harvest_requested:
      resources?.cumulative_harvest_requested ?? null,
    cumulative_resource_harvest_shortfall:
      resources?.cumulative_harvest_shortfall ?? null,
    cumulative_resource_harvest_opportunities:
      resources?.cumulative_harvest_opportunities ?? null,
    cumulative_resource_zero_harvests: resources?.cumulative_zero_harvests ?? null,
    cumulative_resource_partial_harvests: resources?.cumulative_partial_harvests ?? null,
    interval_resource_regenerated:
      resources === null || previousResources === null
        ? null
        : interval(
            resources.cumulative_regenerated,
            previousResources.regenerated_total,
            "resource regenerated",
          ),
    interval_resource_harvested:
      resources === null || previousResources === null
        ? null
        : interval(
            resources.cumulative_harvested,
            previousResources.harvested_total,
            "resource harvested",
          ),
    interval_resource_harvest_requested:
      resources === null || previousResources === null
        ? null
        : interval(
            resources.cumulative_harvest_requested,
            previousResources.harvest_requested_total,
            "resource harvest requested",
          ),
    interval_resource_harvest_opportunities:
      resources === null || previousResources === null
        ? null
        : interval(
            resources.cumulative_harvest_opportunities,
            previousResources.harvest_opportunities,
            "resource harvest opportunities",
          ),
    cumulative_births: current.births,
    cumulative_deaths: totalDeaths(current),
    cumulative_autonomous_attempts: current.autonomous_attempts,
    cumulative_autonomous_successes: current.autonomous_successes,
    cumulative_exploitative_attempts: current.exploitative_attempts,
    cumulative_exploitative_successes: current.exploitative_successes,
    cumulative_hgt_attempts: current.hgt_attempts,
    cumulative_hgt_successes: current.hgt_successes,
    interval_births: interval(current.births, previous.births, "births"),
    interval_deaths: interval(totalDeaths(current), totalDeaths(previous), "deaths"),
    interval_autonomous_attempts: interval(
      current.autonomous_attempts,
      previous.autonomous_attempts,
      "autonomous attempts",
    ),
    interval_autonomous_successes: interval(
      current.autonomous_successes,
      previous.autonomous_successes,
      "autonomous successes",
    ),
    interval_exploitative_attempts: interval(
      current.exploitative_attempts,
      previous.exploitative_attempts,
      "exploitative attempts",
    ),
    interval_exploitative_successes: interval(
      current.exploitative_successes,
      previous.exploitative_successes,
      "exploitative successes",
    ),
    interval_hgt_attempts: interval(current.hgt_attempts, previous.hgt_attempts, "HGT attempts"),
    interval_hgt_successes: interval(
      current.hgt_successes,
      previous.hgt_successes,
      "HGT successes",
    ),
    interval_mutation_point_accepted: interval(
      current.mutation_accepted.point,
      previous.mutation_accepted.point,
      "accepted point mutations",
    ),
    interval_mutation_insertion_accepted: interval(
      current.mutation_accepted.insertion,
      previous.mutation_accepted.insertion,
      "accepted insertions",
    ),
    interval_mutation_deletion_accepted: interval(
      current.mutation_accepted.deletion,
      previous.mutation_accepted.deletion,
      "accepted deletions",
    ),
    interval_computation_rewards: interval(
      current.computation_rewards,
      previous.computation_rewards,
      "computation rewards",
    ),
    interval_energy_created: interval(
      current.energy_created,
      previous.energy_created,
      "energy created",
    ),
    interval_energy_transferred: interval(
      current.energy_transferred,
      previous.energy_transferred,
      "energy transferred",
    ),
    interval_energy_dissipated: interval(
      current.energy_dissipated,
      previous.energy_dissipated,
      "energy dissipated",
    ),
    interval_energy_discarded: interval(
      current.energy_discarded,
      previous.energy_discarded,
      "energy discarded",
    ),
  };
  addDivergenceColumns(row, sample);
  addClassColumns(row, sample);
  row.theil_u_function_given_lineage =
    measurement.lineage_information?.theil_u_function_given_lineage ?? null;
  row.lineage_function_decoupling = measurement.lineage_information?.decoupling_score ?? null;
  row.lineage_information_defined = measurement.lineage_information?.defined ?? null;
  row.lineage_information_undefined_reason =
    measurement.lineage_information?.undefined_reason ?? null;
  addLineageIntervalColumns(row, "host", sample.lineage_interval.host);
  addLineageIntervalColumns(row, "parasite", sample.lineage_interval.parasite);
  addLineageDiagnosticColumns(row, sample);
  return row;
}

function lineageRows(run: CompletedRun): Record<string, unknown>[] {
  return run.lineage_records.map((record) => ({ ...record }));
}

async function sha256File(path: string): Promise<string> {
  return new Promise((resolveHash, rejectHash) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", rejectHash);
    stream.on("end", () => resolveHash(hash.digest("hex")));
  });
}

async function walkFiles(root: string, directory = root): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      paths.push(...(await walkFiles(root, path)));
    } else if (entry.isFile()) {
      paths.push(relative(root, path).split(sep).join("/"));
    }
  }
  return paths.sort();
}

async function describeFiles(
  root: string,
  excluded: ReadonlySet<string>,
): Promise<PayloadDescription[]> {
  const paths = (await walkFiles(root)).filter((path) => !excluded.has(path));
  return Promise.all(
    paths.map(async (path) => ({
      path,
      sha256: await sha256File(join(root, path)),
      bytes: (await stat(join(root, path))).size,
    })),
  );
}

function gitValue(workspaceRoot: string, arguments_: readonly string[]): string | null {
  try {
    return execFileSync("git", arguments_, {
      cwd: workspaceRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function finalSummary(run: CompletedRun): unknown {
  const finalSample = run.samples.at(-1)?.measurement ?? null;
  const finalFormalSample = [...run.samples]
    .reverse()
    .find((sample) => sample.measurement.divergence !== null)?.measurement ?? null;
  const dead = run.lineage_records.filter((record) => record.death_tick !== null).length;
  const maximumGeneration =
    run.lineage_records.length === 0
      ? null
      : run.lineage_records.reduce((max, record) => Math.max(max, record.generation), 0);
  const lineageMechanisms = aggregateLineageMechanisms(run.samples);
  const lineageDiagnostics = aggregateLineageDiagnostics(run.samples);
  const diagnosticResiduals = lineageDiagnosticIdentityResiduals(
    lineageDiagnostics,
    lineageMechanisms,
    run.final_counters,
  );
  assertLineageDiagnosticIdentities(diagnosticResiduals);
  return {
    output_schema_version: "0.6.0",
    configuration_id: run.configuration_id,
    terminal_reason: run.terminal_reason,
    completed_ticks: run.completed_ticks,
    final_state_hash: run.final_state_hash,
    final_population: finalSample?.state ?? null,
    final_boundary_divergence: finalFormalSample?.divergence ?? null,
    final_boundary_lineage_information: finalFormalSample?.lineage_information ?? null,
    final_resources: finalSample?.resources ?? null,
    cumulative_counters: run.final_counters,
    pedigree: {
      organisms_ever_born: run.lineage_records.length,
      organisms_dead: dead,
      organisms_living: run.lineage_records.length - dead,
      maximum_generation: maximumGeneration,
    },
    lineage_diagnostics: {
      mechanisms: lineageMechanisms,
      ...lineageDiagnostics,
      identity_residuals: diagnosticResiduals,
    },
  };
}

async function writeRunPayload(tempDirectory: string, run: CompletedRun): Promise<void> {
  await mkdir(join(tempDirectory, "checkpoints"));
  await mkdir(join(tempDirectory, "events"));
  await writeFile(
    join(tempDirectory, "resolved-config.json"),
    `${canonicalJson(run.configuration)}\n`,
    "utf8",
  );
  await writeFile(
    join(tempDirectory, "ancestor-fixture.json"),
    `${canonicalJson(run.fixture)}\n`,
    "utf8",
  );
  await writeCsvStream(
    join(tempDirectory, "timeseries.csv"),
    run.samples.map(sampleRow),
  );
  await writeFile(
    join(tempDirectory, "measurements.json"),
    prettyJson(run.samples),
    "utf8",
  );
  await writeCsvStream(
    join(tempDirectory, "state-hashes.csv"),
    run.samples.map((sample) => ({
      tick: sample.measurement.tick,
      state_hash: sample.measurement.state_hash,
    })),
  );
  await writeCsvStream(
    join(tempDirectory, "lineage.csv"),
    lineageRows(run),
  );
  await writeFile(
    join(tempDirectory, "final-summary.json"),
    prettyJson(finalSummary(run)),
    "utf8",
  );
  for (const retained of run.checkpoints) {
    const name = `tick-${String(retained.tick).padStart(12, "0")}.json`;
    await writeFile(
      join(tempDirectory, "checkpoints", name),
      `${canonicalJson(retained.checkpoint)}\n`,
      "utf8",
    );
  }
  if (run.events.length > 0) {
    await writeNdjsonStream(
      join(tempDirectory, "events", "events.ndjson"),
      run.events,
    );
  }
}

export async function exportCompletedRun(
  run: CompletedRun,
  options: ExportOptions,
): Promise<string> {
  const configuration = parseEngineConfig(run.configuration);
  const outputRoot = resolve(options.output_root);
  const finalDirectory = join(outputRoot, configuration.identity.run_id);
  await mkdir(outputRoot, { recursive: true });
  if (await pathExists(finalDirectory)) {
    throw new Error(`Run directory already exists and will not be overwritten: ${finalDirectory}`);
  }
  const tempDirectory = await mkdtemp(
    join(dirname(finalDirectory), `.${basename(finalDirectory)}.tmp-`),
  );

  try {
    await writeRunPayload(tempDirectory, run);
    const payloadFiles = await describeFiles(
      tempDirectory,
      new Set(["manifest.json", "checksums.sha256"]),
    );
    const gitCommit = gitValue(options.workspace_root, ["rev-parse", "HEAD"]);
    const gitStatus = gitValue(options.workspace_root, ["status", "--porcelain"]);
    const packageLockPath = join(options.workspace_root, "package-lock.json");
    const packageLockDigest = (await pathExists(packageLockPath))
      ? await sha256File(packageLockPath)
      : null;
    const manifest = {
      output_schema_version: "0.6.0",
      runner_version: "0.1.0",
      engine_version: "0.1.0",
      run_id: configuration.identity.run_id,
      condition_id: configuration.identity.condition_id,
      replicate_id: configuration.identity.replicate_id,
      purpose: configuration.identity.purpose,
      configuration_id: run.configuration_id,
      ancestor_fixture_path: configuration.initial_population.fixture_path,
      ancestor_fixture_sha256: run.fixture_sha256,
      seed: configuration.identity.seed,
      requested_ticks: configuration.duration.completed_ticks,
      completed_ticks: run.completed_ticks,
      terminal_reason: run.terminal_reason,
      final_prng_state: run.final_prng_state,
      final_state_hash: run.final_state_hash,
      state_hash_algorithm: run.state_hash_algorithm,
      state_hash_implementation: NODE_SHA256_IMPLEMENTATION,
      source_git_commit: gitCommit,
      dirty_worktree: gitStatus === null ? null : gitStatus.length > 0,
      package_lock_sha256: packageLockDigest,
      node_version: process.version,
      platform: process.platform,
      architecture: process.arch,
      started_at: run.started_at,
      finished_at: run.finished_at,
      cumulative_counters: run.final_counters,
      retained_payloads: payloadFiles,
    };
    await writeFile(join(tempDirectory, "manifest.json"), prettyJson(manifest), "utf8");
    const checksumFiles = await describeFiles(
      tempDirectory,
      new Set(["checksums.sha256"]),
    );
    await writeFile(
      join(tempDirectory, "checksums.sha256"),
      `${checksumFiles.map((file) => `${file.sha256}  ${file.path}`).join("\n")}\n`,
      "utf8",
    );
    await rename(tempDirectory, finalDirectory);
    return finalDirectory;
  } catch (error) {
    await rm(tempDirectory, { recursive: true, force: true });
    throw error;
  }
}
