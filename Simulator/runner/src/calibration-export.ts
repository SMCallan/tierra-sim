import { createHash } from "node:crypto";
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
  DeathCause,
  EcologicalOperation,
  EcologicalResultCode,
} from "@tierra-sim/engine";

import { exportBenchmarkBundle } from "./benchmark-export.js";
import {
  executeCalibrationSweep,
  type CalibrationCandidateSummary,
  type CalibrationSweepExecutionOptions,
  type CalibrationSweepReport,
  type LoadedCalibrationSweep,
} from "./calibration-sweep.js";
import type { LineageDiagnostics } from "./types.js";

export interface CalibrationExportOptions extends CalibrationSweepExecutionOptions {
  readonly output_root: string;
  readonly workspace_root: string;
}

interface FileDescription {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function sortedJsonValue(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Calibration output cannot contain NaN or Infinity.");
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
  throw new TypeError(`Unsupported calibration JSON value: ${typeof value}.`);
}

function prettyJson(value: unknown): string {
  return `${JSON.stringify(sortedJsonValue(value), null, 2)}\n`;
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new TypeError("Calibration CSV cannot contain NaN or Infinity.");
  }
  const text = String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function addLineageDiagnosticsColumns(
  row: Record<string, unknown>,
  scope: "whole_run" | "late_window",
  diagnostics: Readonly<LineageDiagnostics>,
): void {
  for (const lineage of ["host", "parasite"] as const) {
    for (const operation of Object.values(EcologicalOperation)) {
      for (const result of Object.values(EcologicalResultCode)) {
        row[`${scope}_${lineage}_${operation}_${result}`] =
          diagnostics.operation_results[lineage][operation][result];
      }
    }
    for (const cause of Object.values(DeathCause)) {
      row[`${scope}_${lineage}_deaths_${cause}`] =
        diagnostics.death_causes[lineage][cause];
    }
  }
}

function flattenCandidate(candidate: CalibrationCandidateSummary): Record<string, unknown> {
  const row: Record<string, unknown> = {
    rank: candidate.rank,
    execution_index: candidate.execution_index,
    candidate_id: candidate.candidate_id,
    condition_id: candidate.condition_id,
    seed: candidate.seed,
    replicate_id: candidate.replicate_id,
    environmental_income: candidate.environmental_income,
    autonomous_reproduction_cost: candidate.autonomous_reproduction_cost,
    reproduction_cooldown_ticks: candidate.reproduction_cooldown_ticks,
    exec_nbr_attempt_cost: candidate.exec_nbr_attempt_cost,
    exec_nbr_donor_copy_rule: candidate.exec_nbr_donor_copy_rule,
    resource_regeneration_per_tick: candidate.resource_regeneration_per_tick,
    resource_harvest_per_activation: candidate.resource_harvest_per_activation,
    death_label: candidate.exogenous_death_probability.label,
    death_numerator: candidate.exogenous_death_probability.numerator,
    death_denominator: candidate.exogenous_death_probability.denominator,
    requested_ticks: candidate.requested_ticks,
    completed_ticks: candidate.completed_ticks,
    terminal_reason: candidate.terminal_reason,
    configuration_id: candidate.configuration_id,
    final_state_hash: candidate.final_state_hash,
    late_target_start_tick: candidate.late_window.target_start_tick,
    late_baseline_tick: candidate.late_window.baseline_tick,
    late_first_observed_tick: candidate.late_window.first_observed_tick,
    late_observed_sample_count: candidate.late_window.observed_sample_count,
    late_mean_occupancy: candidate.occupancy.late_mean_proportion,
    late_maximum_occupancy: candidate.occupancy.late_maximum_proportion,
    final_host_proportion: candidate.lineage_survival.final_host_proportion,
    final_parasite_proportion: candidate.lineage_survival.final_parasite_proportion,
    minimum_final_lineage_proportion:
      candidate.lineage_survival.minimum_final_lineage_proportion,
    both_present_at_every_late_sample:
      candidate.lineage_survival.both_present_at_every_late_sample,
    last_sample_tick_with_both_lineages:
      candidate.interaction_exposure.last_sample_tick_with_both_lineages,
    last_sample_tick_with_cross_lineage_contact:
      candidate.interaction_exposure.last_sample_tick_with_cross_lineage_contact,
    whole_run_exploitative_successes:
      candidate.interaction_exposure.whole_run_exploitative_successes,
    late_autonomous_successes: candidate.late_mechanism_opportunity.autonomous_successes,
    late_exploitative_successes: candidate.late_mechanism_opportunity.exploitative_successes,
    late_hgt_donor_opportunities:
      candidate.late_mechanism_opportunity.hgt_donor_opportunities,
    late_hgt_successes: candidate.late_mechanism_opportunity.hgt_successes,
    late_mean_eligible_proportion:
      candidate.measurement_eligibility.late_mean_eligible_proportion,
    computation_energy_credited: candidate.computation.energy_credited,
    computation_share_of_created_energy: candidate.computation.share_of_created_energy,
    sampled_maximum_any_genome_bound_proportion:
      candidate.genome_length.sampled_maximum_any_bound_proportion,
    late_mean_host_parasite_contact_edges:
      candidate.spatial_structure.late_mean_host_parasite_contact_edges,
    late_minimum_host_parasite_contact_edges:
      candidate.spatial_structure.late_minimum_host_parasite_contact_edges,
    late_mean_same_lineage_edge_proportion:
      candidate.spatial_structure.late_mean_same_lineage_edge_proportion,
    late_mean_host_largest_patch_proportion:
      candidate.spatial_structure.late_mean_host_largest_patch_proportion,
    late_mean_parasite_largest_patch_proportion:
      candidate.spatial_structure.late_mean_parasite_largest_patch_proportion,
    energy_ledger_residual: candidate.energy_balance.ledger_residual,
    energy_source_event_residual: candidate.energy_balance.source_event_residual,
    late_mean_resource_stock_proportion:
      candidate.local_resources.late_mean_stock_proportion,
    late_minimum_resource_stock_proportion:
      candidate.local_resources.late_minimum_stock_proportion,
    late_maximum_resource_stock_proportion:
      candidate.local_resources.late_maximum_stock_proportion,
    late_mean_resource_depleted_cell_proportion:
      candidate.local_resources.late_mean_depleted_cell_proportion,
    cumulative_resource_regenerated:
      candidate.local_resources.cumulative_regenerated,
    cumulative_resource_harvested: candidate.local_resources.cumulative_harvested,
    cumulative_resource_harvest_shortfall:
      candidate.local_resources.cumulative_harvest_shortfall,
    ticks_per_second: candidate.resources.ticks_per_second,
    activations_per_second: candidate.resources.activations_per_second,
    projected_single_run_minutes: candidate.resources.projected_single_run_minutes,
    peak_rss_bytes: candidate.resources.peak_rss_bytes,
    mandatory_gate_failures: candidate.mandatory_gate_failures,
    ecological_gate_passes: candidate.ecological_gate_passes,
    screening_passed: candidate.screening_passed,
  };
  for (const [name, passed] of Object.entries(candidate.gates)) {
    row[`gate_${name}`] = passed;
  }
  addLineageDiagnosticsColumns(
    row,
    "whole_run",
    candidate.lineage_diagnostics.whole_run,
  );
  addLineageDiagnosticsColumns(
    row,
    "late_window",
    candidate.lineage_diagnostics.late_window,
  );
  return row;
}

function candidatesCsv(candidates: readonly CalibrationCandidateSummary[]): string {
  const rows = candidates.map(flattenCandidate);
  if (rows.length === 0) {
    return "";
  }
  const columns = Object.keys(rows[0] as Record<string, unknown>);
  return `${[
    columns.map(csvCell).join(","),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")),
  ].join("\n")}\n`;
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

async function describeFiles(root: string): Promise<FileDescription[]> {
  return Promise.all(
    (await walkFiles(root)).map(async (path) => {
      const absolute = join(root, path);
      return {
        path,
        bytes: (await stat(absolute)).size,
        sha256: createHash("sha256").update(await readFile(absolute)).digest("hex"),
      };
    }),
  );
}

export async function executeAndExportCalibrationSweep(
  loaded: LoadedCalibrationSweep,
  options: CalibrationExportOptions,
): Promise<{ readonly path: string; readonly report: CalibrationSweepReport }> {
  const outputRoot = resolve(options.output_root);
  const overrideSuffix = [
    options.ticks_override === undefined ? null : `ticks-${options.ticks_override}`,
    options.candidate_limit === undefined ? null : `limit-${options.candidate_limit}`,
  ].filter((value): value is string => value !== null).join("__");
  const bundleId =
    overrideSuffix.length === 0
      ? loaded.specification.sweep_id
      : `${loaded.specification.sweep_id}__development__${overrideSuffix}`;
  const finalDirectory = join(outputRoot, bundleId);
  await mkdir(outputRoot, { recursive: true });
  if (await pathExists(finalDirectory)) {
    throw new Error(
      `Calibration sweep directory already exists and will not be overwritten: ${finalDirectory}`,
    );
  }
  const tempDirectory = await mkdtemp(
    join(dirname(finalDirectory), `.${basename(finalDirectory)}.tmp-`),
  );

  try {
    await writeFile(
      join(tempDirectory, "sweep-specification.json"),
      prettyJson(loaded.specification),
      "utf8",
    );
    await writeFile(
      join(tempDirectory, "base-configuration.json"),
      prettyJson(loaded.base_configuration),
      "utf8",
    );
    await writeFile(
      join(tempDirectory, "ancestor-fixture.json"),
      prettyJson(loaded.fixture),
      "utf8",
    );
    const candidateRoot = join(tempDirectory, "candidates");
    await mkdir(candidateRoot, { recursive: true });
    const report = await executeCalibrationSweep(loaded, {
      ...(options.ticks_override === undefined
        ? {}
        : { ticks_override: options.ticks_override }),
      ...(options.candidate_limit === undefined
        ? {}
        : { candidate_limit: options.candidate_limit }),
      ...(options.projection_target_ticks === undefined
        ? {}
        : { projection_target_ticks: options.projection_target_ticks }),
      ...(options.projection_run_count === undefined
        ? {}
        : { projection_run_count: options.projection_run_count }),
      ...(options.onCandidateStarted === undefined
        ? {}
        : { onCandidateStarted: options.onCandidateStarted }),
      ...(options.onCandidateProgress === undefined
        ? {}
        : { onCandidateProgress: options.onCandidateProgress }),
      onCandidateCompleted: async (completed, summary): Promise<void> => {
        await exportBenchmarkBundle(completed.run, completed.report, {
          output_root: candidateRoot,
          workspace_root: options.workspace_root,
        });
        await options.onCandidateCompleted?.(completed, summary);
      },
    });
    await writeFile(join(tempDirectory, "sweep-report.json"), prettyJson(report), "utf8");
    await writeFile(
      join(tempDirectory, "candidates.csv"),
      candidatesCsv(report.candidates),
      "utf8",
    );
    const described = await describeFiles(tempDirectory);
    await writeFile(
      join(tempDirectory, "checksums.sha256"),
      `${described.map((file) => `${file.sha256}  ${file.path}`).join("\n")}\n`,
      "utf8",
    );
    await rename(tempDirectory, finalDirectory);
    return { path: finalDirectory, report };
  } catch (error) {
    await rm(tempDirectory, { recursive: true, force: true });
    throw error;
  }
}
