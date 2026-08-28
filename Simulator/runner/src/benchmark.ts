import { arch, cpus, platform, release, totalmem } from "node:os";
import { performance } from "node:perf_hooks";

import {
  EcologicalOperation,
  EcologicalResultCode,
  EnergyEventKind,
  parseAncestorFixture,
  parseEngineConfig,
  type EcologicalResultCode as EcologicalResult,
  type EnergyEventKind as EnergyKind,
  type EngineEvent,
  type PopulationMeasurement,
  type RunCounters,
  type SpatialStructureMeasurement,
  type TickReport,
} from "@tierra-sim/engine";

import { executeRun } from "./run.js";
import type {
  CompletedRun,
  LineageDiagnosticIdentityResiduals,
  LineageDiagnostics,
  LineageMechanismCounters,
  RecordedSample,
} from "./types.js";
import {
  aggregateLineageDiagnostics,
  aggregateLineageMechanisms,
  assertLineageDiagnosticIdentities,
  lineageDiagnosticIdentityResiduals,
} from "./diagnostics.js";
import { NODE_SHA256_IMPLEMENTATION } from "./node-sha256.js";

export interface BenchmarkMemorySnapshot {
  readonly rss_bytes: number;
  readonly heap_total_bytes: number;
  readonly heap_used_bytes: number;
  readonly external_bytes: number;
  readonly array_buffers_bytes: number;
}

export interface BenchmarkProgress {
  readonly tick: number;
  readonly elapsed_ms: number;
  readonly interval_ms: number;
  readonly cumulative_ticks_per_second: number;
  readonly interval_ticks_per_second: number;
  readonly cumulative_activations_per_second: number;
  readonly population: number;
  readonly capacity: number;
  readonly occupancy_proportion: number;
  readonly organisms_ever_born: number;
  readonly total_energy: number | null;
  readonly resource_total_stock: number | null;
  readonly resource_stock_proportion: number | null;
  readonly resource_depleted_cell_proportion: number | null;
  readonly hgt_attempts: number;
  readonly hgt_donor_opportunities: number;
  readonly hgt_successes: number;
  readonly mutation_attempts: number;
  readonly divergence_sample_tick: number | null;
  readonly divergence_eligible_count: number | null;
  readonly divergence_eligible_proportion: number | null;
  readonly divergence_inactive_proportion: number | null;
  readonly memory: BenchmarkMemorySnapshot;
}

export interface BenchmarkStorage {
  readonly retained_run_directory: string;
  readonly retained_run_files: number;
  readonly retained_run_bytes: number;
  readonly bytes_per_completed_tick: number;
}

export interface BenchmarkReport {
  readonly report_schema_version: "0.8.0";
  readonly benchmark_id: string;
  readonly run_id: string;
  readonly condition_id: string;
  readonly configuration_id: string;
  readonly requested_ticks: number;
  readonly completed_ticks: number;
  readonly terminal_reason: CompletedRun["terminal_reason"];
  readonly final_state_hash: string;
  readonly started_at: string;
  readonly finished_at: string;
  readonly machine: {
    readonly node_version: string;
    readonly platform: string;
    readonly release: string;
    readonly architecture: string;
    readonly logical_cpu_count: number;
    readonly total_memory_bytes: number;
  };
  readonly performance: {
    readonly execution_wall_ms: number;
    readonly tick_loop_wall_ms: number;
    readonly post_terminal_finalization_wall_ms: number;
    readonly evidence_export_wall_ms: number | null;
    readonly ticks_per_second: number;
    readonly activations_per_second: number;
    readonly peak_rss_bytes: number;
    readonly peak_sampled_heap_used_bytes: number;
    readonly retained_samples: number;
    readonly retained_checkpoints: number;
    readonly retained_events: number;
    readonly state_hash_implementation: typeof NODE_SHA256_IMPLEMENTATION;
  };
  readonly ecology: {
    readonly pedigree: {
      readonly ancestors: number;
      readonly organisms_ever_born: number;
      readonly organisms_living: number;
      readonly organisms_dead: number;
    };
    readonly occupancy: {
      readonly capacity: number;
      readonly initial_proportion: number;
      readonly sampled_minimum_proportion: number | null;
      readonly sampled_mean_proportion: number | null;
      readonly sampled_maximum_proportion: number | null;
      readonly final_proportion: number;
    };
    readonly extinction: {
      readonly occurred: boolean;
      readonly tick: number | null;
    };
    readonly genome_length: {
      readonly final_mean: number | null;
      readonly final_minimum: number | null;
      readonly final_maximum: number | null;
      readonly final_minimum_bound_proportion: number | null;
      readonly final_maximum_bound_proportion: number | null;
      readonly sampled_mean_any_bound_proportion: number | null;
      readonly sampled_maximum_any_bound_proportion: number | null;
    };
    readonly spatial_structure: {
      readonly final: SpatialStructureMeasurement | null;
      readonly sampled_mean_host_parasite_contact_edges: number | null;
      readonly sampled_minimum_host_parasite_contact_edges: number | null;
      readonly sampled_mean_same_lineage_edge_proportion: number | null;
      readonly sampled_mean_host_largest_patch_proportion: number | null;
      readonly sampled_mean_parasite_largest_patch_proportion: number | null;
    };
    readonly lineage_diagnostics: LineageDiagnostics & {
      readonly mechanisms: LineageMechanismCounters;
      readonly identity_residuals: LineageDiagnosticIdentityResiduals;
    };
    readonly energy_balance: {
      readonly initial_energy: number;
      readonly initial_resource_energy: number;
      readonly environmental_energy_credited: number;
      readonly computation_energy_credited: number;
      readonly resource_energy_regenerated: number;
      readonly energy_created_counter: number;
      readonly living_energy: number;
      readonly current_resource_energy: number;
      readonly energy_dissipated: number;
      readonly energy_discarded: number;
      readonly energy_transferred: number;
      readonly supplied_energy: number;
      readonly accounted_energy: number;
      readonly ledger_residual: number;
      readonly source_event_residual: number;
      readonly transfer_event_residual: number;
      readonly computation_share_of_created_energy: number | null;
      readonly computation_share_of_organism_energy_creation: number | null;
      readonly event_energy_by_kind: Readonly<Record<EnergyKind, number>>;
    };
    readonly local_resources: {
      readonly enabled: boolean;
      readonly final_total_stock: number | null;
      readonly final_stock_proportion: number | null;
      readonly sampled_minimum_stock_proportion: number | null;
      readonly sampled_mean_stock_proportion: number | null;
      readonly sampled_maximum_stock_proportion: number | null;
      readonly sampled_mean_depleted_cell_proportion: number | null;
      readonly cumulative_regenerated: number | null;
      readonly cumulative_harvested: number | null;
      readonly cumulative_harvest_requested: number | null;
      readonly cumulative_harvest_shortfall: number | null;
      readonly cumulative_harvest_opportunities: number | null;
      readonly cumulative_zero_harvests: number | null;
      readonly cumulative_partial_harvests: number | null;
      readonly regeneration_event_residual: number | null;
      readonly harvest_transfer_event_residual: number | null;
    };
    readonly reproduction: {
      readonly autonomous_attempts: number;
      readonly autonomous_successes: number;
      readonly exploitative_attempts: number;
      readonly exploitative_successes: number;
      readonly births: number;
      readonly deaths: number;
    };
    readonly hgt_opportunity: {
      readonly splice_instruction_attempts: number;
      readonly donor_opportunities: number;
      readonly no_neighbour_attempts: number;
      readonly donor_opportunity_proportion: number | null;
      readonly successes: number;
      readonly success_given_donor_opportunity: number | null;
      readonly result_counts: Readonly<Record<EcologicalResult, number>>;
    };
    readonly mutation_exposure: {
      readonly attempted_total: number;
      readonly accepted_total: number;
      readonly rejected_total: number;
      readonly attempts_per_birth: number | null;
      readonly accepted_per_birth: number | null;
      readonly attempted_by_class: RunCounters["mutation_attempted"];
      readonly accepted_by_class: RunCounters["mutation_accepted"];
      readonly rejected_by_class: RunCounters["mutation_rejected"];
    };
    readonly divergence_eligibility: {
      readonly scheduled_samples: number;
      readonly samples_with_defined_divergence: number;
      readonly samples_at_or_above_twenty_five_percent_eligible: number;
      readonly mean_eligible_proportion: number | null;
      readonly final_boundary_tick: number | null;
      readonly final_boundary_eligible_count: number | null;
      readonly final_boundary_eligible_proportion: number | null;
      readonly final_boundary_inactive_proportion: number | null;
      readonly final_boundary_mean_divergence: number | null;
    };
  };
  readonly scaling_projection: {
    readonly target_ticks: number;
    readonly run_count: number;
    readonly naive_single_run_wall_ms: number | null;
    readonly naive_sequential_batch_wall_ms: number | null;
    readonly naive_single_run_storage_bytes: number | null;
    readonly naive_batch_storage_bytes: number | null;
    readonly warning: string;
  };
  readonly storage: BenchmarkStorage | null;
  readonly progress: readonly BenchmarkProgress[];
  readonly interpretation_notes: readonly string[];
}

export interface BenchmarkOptions {
  readonly benchmark_id: string;
  readonly configuration: unknown;
  readonly fixture: unknown;
  readonly report_every_ticks: number;
  readonly projection_target_ticks?: number;
  readonly projection_run_count?: number;
  readonly onProgress?: (progress: BenchmarkProgress) => void;
}

export interface CompletedBenchmark {
  readonly run: CompletedRun;
  readonly report: BenchmarkReport;
}

function memorySnapshot(): BenchmarkMemorySnapshot {
  const memory = process.memoryUsage();
  return {
    rss_bytes: memory.rss,
    heap_total_bytes: memory.heapTotal,
    heap_used_bytes: memory.heapUsed,
    external_bytes: memory.external,
    array_buffers_bytes: memory.arrayBuffers,
  };
}

function safeRatio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function mean(values: readonly number[]): number | null {
  return values.length === 0
    ? null
    : values.reduce((total, value) => total + value, 0) / values.length;
}

function mutationTotal(counters: Readonly<RunCounters["mutation_attempted"]>): number {
  return counters.point + counters.insertion + counters.deletion;
}

function totalDeaths(counters: Readonly<RunCounters>): number {
  return counters.deaths_exogenous + counters.deaths_energy + counters.deaths_exploitation;
}

function emptyEnergyByKind(): Record<EnergyKind, number> {
  return Object.fromEntries(
    Object.values(EnergyEventKind).map((kind) => [kind, 0]),
  ) as Record<EnergyKind, number>;
}

function emptyEcologicalResults(): Record<EcologicalResult, number> {
  return Object.fromEntries(
    Object.values(EcologicalResultCode).map((result) => [result, 0]),
  ) as Record<EcologicalResult, number>;
}

function benchmarkProgress(
  report: TickReport,
  latestMeasurement: PopulationMeasurement | null,
  elapsedMs: number,
  intervalMs: number,
  previousTick: number,
  configurationCapacity: number,
  initialPopulation: number,
  hgtDonorOpportunities: number,
): BenchmarkProgress {
  const counters = latestMeasurement?.cumulative_counters;
  const population = report.population_size;
  const divergence = latestMeasurement?.divergence?.total ?? null;
  const currentMemory = memorySnapshot();
  return {
    tick: report.tick,
    elapsed_ms: elapsedMs,
    interval_ms: intervalMs,
    cumulative_ticks_per_second: elapsedMs === 0 ? 0 : report.tick / (elapsedMs / 1_000),
    interval_ticks_per_second:
      intervalMs === 0 ? 0 : (report.tick - previousTick) / (intervalMs / 1_000),
    cumulative_activations_per_second:
      elapsedMs === 0 ? 0 : (counters?.activations ?? 0) / (elapsedMs / 1_000),
    population,
    capacity: configurationCapacity,
    occupancy_proportion: population / configurationCapacity,
    organisms_ever_born: initialPopulation + (counters?.births ?? 0),
    total_energy: latestMeasurement?.state.total_energy ?? null,
    resource_total_stock: latestMeasurement?.resources?.total_stock ?? null,
    resource_stock_proportion: latestMeasurement?.resources?.stock_proportion ?? null,
    resource_depleted_cell_proportion:
      latestMeasurement?.resources === null || latestMeasurement?.resources === undefined
        ? null
        : latestMeasurement.resources.depleted_cells /
          (latestMeasurement.resources.empty_cells +
            latestMeasurement.resources.occupied_cells),
    hgt_attempts: counters?.hgt_attempts ?? 0,
    hgt_donor_opportunities: hgtDonorOpportunities,
    hgt_successes: counters?.hgt_successes ?? 0,
    mutation_attempts: counters === undefined ? 0 : mutationTotal(counters.mutation_attempted),
    divergence_sample_tick: divergence === null ? null : latestMeasurement?.tick ?? null,
    divergence_eligible_count: divergence?.eligible_count ?? null,
    divergence_eligible_proportion: divergence?.eligible_proportion ?? null,
    divergence_inactive_proportion: divergence?.inactive_proportion ?? null,
    memory: currentMemory,
  };
}

function withStorageProjection(
  report: BenchmarkReport,
  storage: BenchmarkStorage,
  evidenceExportWallMs: number,
): BenchmarkReport {
  const scale =
    report.completed_ticks === 0
      ? null
      : report.scaling_projection.target_ticks / report.completed_ticks;
  const projectedSingle = scale === null ? null : storage.retained_run_bytes * scale;
  return {
    ...report,
    performance: {
      ...report.performance,
      evidence_export_wall_ms: evidenceExportWallMs,
    },
    storage,
    scaling_projection: {
      ...report.scaling_projection,
      naive_single_run_storage_bytes: projectedSingle,
      naive_batch_storage_bytes:
        projectedSingle === null ? null : projectedSingle * report.scaling_projection.run_count,
    },
  };
}

export function attachBenchmarkStorage(
  report: BenchmarkReport,
  storage: BenchmarkStorage,
  evidenceExportWallMs: number,
): BenchmarkReport {
  return withStorageProjection(report, storage, evidenceExportWallMs);
}

export function executeBenchmark(options: BenchmarkOptions): CompletedBenchmark {
  const configuration = parseEngineConfig(options.configuration);
  if (!Number.isSafeInteger(options.report_every_ticks) || options.report_every_ticks <= 0) {
    throw new RangeError("Benchmark report interval must be a positive safe integer.");
  }
  if (options.report_every_ticks % configuration.duration.sample_every_ticks !== 0) {
    throw new Error(
      "Benchmark report interval must be a multiple of the scientific sample interval.",
    );
  }

  const projectionTargetTicks = options.projection_target_ticks ?? 500_000;
  const projectionRunCount = options.projection_run_count ?? 60;
  if (!Number.isSafeInteger(projectionTargetTicks) || projectionTargetTicks <= 0) {
    throw new RangeError("Projection target ticks must be a positive safe integer.");
  }
  if (!Number.isSafeInteger(projectionRunCount) || projectionRunCount <= 0) {
    throw new RangeError("Projection run count must be a positive safe integer.");
  }

  const capacity = configuration.world.width * configuration.world.height;
  const energyByKind = emptyEnergyByKind();
  const hgtResults = emptyEcologicalResults();
  const progress: BenchmarkProgress[] = [];
  const scheduledMeasurements: PopulationMeasurement[] = [];
  let latestMeasurement: PopulationMeasurement | null = null;
  let hgtDonorOpportunities = 0;
  let resourceRegenerationFromEvents = 0;
  let previousProgressTick = 0;
  let previousProgressAt = 0;
  let peakSampledHeapUsed = 0;
  const startedAtIso = new Date().toISOString();
  const startedAt = performance.now();
  previousProgressAt = startedAt;

  const observeEvent = (event: EngineEvent): void => {
    if (event.type === "energy") {
      energyByKind[event.kind] += event.amount;
    } else if (event.type === "resource_regeneration") {
      resourceRegenerationFromEvents += event.amount;
    } else if (
      event.type === "ecological_attempt" &&
      event.operation === EcologicalOperation.Splice
    ) {
      hgtResults[event.result] += 1;
      if (event.donor_id !== undefined) {
        hgtDonorOpportunities += 1;
      }
    }
  };

  const observeSample = (sample: RecordedSample): void => {
    latestMeasurement = sample.measurement;
    if (sample.measurement.sample_kind === "scheduled") {
      scheduledMeasurements.push(sample.measurement);
    }
  };

  const fixture = parseAncestorFixture(options.fixture, configuration);
  const initialPopulation = fixture.ancestors.reduce(
    (total, ancestor) => total + ancestor.count,
    0,
  );

  const observeTick = (tickReport: TickReport): void => {
    const shouldReport =
      tickReport.tick % options.report_every_ticks === 0 || tickReport.terminal_reason !== null;
    if (!shouldReport) {
      return;
    }
    const now = performance.now();
    const item = benchmarkProgress(
      tickReport,
      latestMeasurement,
      now - startedAt,
      now - previousProgressAt,
      previousProgressTick,
      capacity,
      initialPopulation,
      hgtDonorOpportunities,
    );
    progress.push(item);
    peakSampledHeapUsed = Math.max(peakSampledHeapUsed, item.memory.heap_used_bytes);
    previousProgressTick = tickReport.tick;
    previousProgressAt = now;
    options.onProgress?.(item);
  };

  const run = executeRun({
    configuration,
    fixture: options.fixture,
    onEvent: observeEvent,
    onSample: observeSample,
    onTick: observeTick,
  });
  const executionWallMs = performance.now() - startedAt;
  const tickLoopWallMs = progress.at(-1)?.elapsed_ms ?? executionWallMs;
  const finishedAtIso = new Date().toISOString();
  const counters = run.final_counters;
  const finalMeasurement = run.samples.at(-1)?.measurement ?? null;
  const finalBoundary = [...scheduledMeasurements].reverse().find(
    (measurement) => measurement.divergence !== null,
  ) ?? null;
  const eligibility = scheduledMeasurements
    .map((measurement) => measurement.divergence?.total.eligible_proportion ?? null)
    .filter((value): value is number => value !== null);
  const definedDivergence = scheduledMeasurements.filter(
    (measurement) => (measurement.divergence?.total.mean_divergence ?? null) !== null,
  ).length;
  const occupancies = run.samples.map(
    (sample) => sample.measurement.state.population_total / capacity,
  );
  const genomeBoundaryProportions = run.samples
    .map((sample) => {
      const state = sample.measurement.state;
      if (state.population_total === 0) {
        return null;
      }
      const boundaryCount =
        configuration.reproduction.min_genome_length ===
        configuration.reproduction.max_genome_length
          ? state.minimum_genome_bound_count
          : state.minimum_genome_bound_count + state.maximum_genome_bound_count;
      return boundaryCount / state.population_total;
    })
    .filter((value): value is number => value !== null);
  const spatialMeasurements = run.samples.map(
    (sample) => sample.measurement.spatial_structure,
  );
  const crossLineageContacts = spatialMeasurements.map(
    (measurement) => measurement.host_parasite_contact_edges,
  );
  const sameLineageEdgeProportions = spatialMeasurements
    .map((measurement) => measurement.same_lineage_edge_proportion)
    .filter((value): value is number => value !== null);
  const hostLargestPatchProportions = spatialMeasurements
    .map((measurement) => measurement.host.largest_patch_proportion)
    .filter((value): value is number => value !== null);
  const parasiteLargestPatchProportions = spatialMeasurements
    .map((measurement) => measurement.parasite.largest_patch_proportion)
    .filter((value): value is number => value !== null);
  const attemptedMutations = mutationTotal(counters.mutation_attempted);
  const acceptedMutations = mutationTotal(counters.mutation_accepted);
  const rejectedMutations = mutationTotal(counters.mutation_rejected);
  const environmentalEnergy = energyByKind[EnergyEventKind.EnvironmentalIncome];
  const computationEnergy = energyByKind[EnergyEventKind.ComputationReward];
  const livingEnergy = finalMeasurement?.state.total_energy ?? 0;
  const finalResources = finalMeasurement?.resources ?? null;
  const initialResourceEnergy =
    configuration.resources === undefined
      ? 0
      : capacity * configuration.resources.initial_stock;
  const currentResourceEnergy = finalResources?.total_stock ?? 0;
  const resourceEnergyRegenerated = finalResources?.cumulative_regenerated ?? 0;
  const resourceEnergyHarvested = finalResources?.cumulative_harvested ?? 0;
  const suppliedEnergy =
    counters.initial_energy + initialResourceEnergy + counters.energy_created;
  const accountedEnergy =
    livingEnergy +
    currentResourceEnergy +
    counters.energy_dissipated +
    counters.energy_discarded;
  const resourceStockProportions = run.samples
    .map((sample) => sample.measurement.resources?.stock_proportion ?? null)
    .filter((value): value is number => value !== null);
  const resourceDepletedProportions = run.samples
    .map((sample) => {
      const resources = sample.measurement.resources;
      return resources === null
        ? null
        : resources.depleted_cells / (resources.occupied_cells + resources.empty_cells);
    })
    .filter((value): value is number => value !== null);
  const maxRssBytes = process.resourceUsage().maxRSS * 1_024;
  const ticksPerSecond = run.completed_ticks / (executionWallMs / 1_000);
  const activationsPerSecond = counters.activations / (executionWallMs / 1_000);
  const projectedSingleWall =
    run.completed_ticks === 0
      ? null
      : executionWallMs * (projectionTargetTicks / run.completed_ticks);
  const lineageMechanisms = aggregateLineageMechanisms(run.samples);
  const lineageDiagnostics = aggregateLineageDiagnostics(run.samples);
  const diagnosticResiduals = lineageDiagnosticIdentityResiduals(
    lineageDiagnostics,
    lineageMechanisms,
    counters,
  );
  assertLineageDiagnosticIdentities(diagnosticResiduals);

  const report: BenchmarkReport = {
    report_schema_version: "0.8.0",
    benchmark_id: options.benchmark_id,
    run_id: configuration.identity.run_id,
    condition_id: configuration.identity.condition_id,
    configuration_id: run.configuration_id,
    requested_ticks: configuration.duration.completed_ticks,
    completed_ticks: run.completed_ticks,
    terminal_reason: run.terminal_reason,
    final_state_hash: run.final_state_hash,
    started_at: startedAtIso,
    finished_at: finishedAtIso,
    machine: {
      node_version: process.version,
      platform: platform(),
      release: release(),
      architecture: arch(),
      logical_cpu_count: cpus().length,
      total_memory_bytes: totalmem(),
    },
    performance: {
      execution_wall_ms: executionWallMs,
      tick_loop_wall_ms: tickLoopWallMs,
      post_terminal_finalization_wall_ms: Math.max(0, executionWallMs - tickLoopWallMs),
      evidence_export_wall_ms: null,
      ticks_per_second: ticksPerSecond,
      activations_per_second: activationsPerSecond,
      peak_rss_bytes: maxRssBytes,
      peak_sampled_heap_used_bytes: peakSampledHeapUsed,
      retained_samples: run.samples.length,
      retained_checkpoints: run.checkpoints.length,
      retained_events: run.events.length,
      state_hash_implementation: NODE_SHA256_IMPLEMENTATION,
    },
    ecology: {
      pedigree: {
        ancestors: initialPopulation,
        organisms_ever_born: run.lineage_records.length,
        organisms_living: finalMeasurement?.state.population_total ?? 0,
        organisms_dead: totalDeaths(counters),
      },
      occupancy: {
        capacity,
        initial_proportion: initialPopulation / capacity,
        sampled_minimum_proportion: occupancies.length === 0 ? null : Math.min(...occupancies),
        sampled_mean_proportion: mean(occupancies),
        sampled_maximum_proportion: occupancies.length === 0 ? null : Math.max(...occupancies),
        final_proportion: (finalMeasurement?.state.population_total ?? 0) / capacity,
      },
      extinction: {
        occurred: run.terminal_reason === "extinction",
        tick: run.terminal_reason === "extinction" ? run.completed_ticks : null,
      },
      genome_length: {
        final_mean: finalMeasurement?.state.mean_genome_length ?? null,
        final_minimum: finalMeasurement?.state.minimum_genome_length ?? null,
        final_maximum: finalMeasurement?.state.maximum_genome_length ?? null,
        final_minimum_bound_proportion:
          finalMeasurement === null || finalMeasurement.state.population_total === 0
            ? null
            : finalMeasurement.state.minimum_genome_bound_count /
              finalMeasurement.state.population_total,
        final_maximum_bound_proportion:
          finalMeasurement === null || finalMeasurement.state.population_total === 0
            ? null
            : finalMeasurement.state.maximum_genome_bound_count /
              finalMeasurement.state.population_total,
        sampled_mean_any_bound_proportion: mean(genomeBoundaryProportions),
        sampled_maximum_any_bound_proportion:
          genomeBoundaryProportions.length === 0
            ? null
            : Math.max(...genomeBoundaryProportions),
      },
      spatial_structure: {
        final: finalMeasurement?.spatial_structure ?? null,
        sampled_mean_host_parasite_contact_edges: mean(crossLineageContacts),
        sampled_minimum_host_parasite_contact_edges:
          crossLineageContacts.length === 0 ? null : Math.min(...crossLineageContacts),
        sampled_mean_same_lineage_edge_proportion: mean(sameLineageEdgeProportions),
        sampled_mean_host_largest_patch_proportion: mean(hostLargestPatchProportions),
        sampled_mean_parasite_largest_patch_proportion:
          mean(parasiteLargestPatchProportions),
      },
      lineage_diagnostics: {
        mechanisms: lineageMechanisms,
        ...lineageDiagnostics,
        identity_residuals: diagnosticResiduals,
      },
      energy_balance: {
        initial_energy: counters.initial_energy,
        initial_resource_energy: initialResourceEnergy,
        environmental_energy_credited: environmentalEnergy,
        computation_energy_credited: computationEnergy,
        resource_energy_regenerated: resourceEnergyRegenerated,
        energy_created_counter: counters.energy_created,
        living_energy: livingEnergy,
        current_resource_energy: currentResourceEnergy,
        energy_dissipated: counters.energy_dissipated,
        energy_discarded: counters.energy_discarded,
        energy_transferred: counters.energy_transferred,
        supplied_energy: suppliedEnergy,
        accounted_energy: accountedEnergy,
        ledger_residual: suppliedEnergy - accountedEnergy,
        source_event_residual:
          counters.energy_created -
          environmentalEnergy -
          computationEnergy -
          resourceRegenerationFromEvents,
        transfer_event_residual:
          counters.energy_transferred -
          energyByKind[EnergyEventKind.OffspringEndowmentTransfer] -
          energyByKind[EnergyEventKind.ResourceHarvest],
        computation_share_of_created_energy: safeRatio(
          computationEnergy,
          counters.energy_created,
        ),
        computation_share_of_organism_energy_creation: safeRatio(
          computationEnergy,
          environmentalEnergy + computationEnergy,
        ),
        event_energy_by_kind: energyByKind,
      },
      local_resources: {
        enabled: finalResources !== null,
        final_total_stock: finalResources?.total_stock ?? null,
        final_stock_proportion: finalResources?.stock_proportion ?? null,
        sampled_minimum_stock_proportion:
          resourceStockProportions.length === 0
            ? null
            : Math.min(...resourceStockProportions),
        sampled_mean_stock_proportion: mean(resourceStockProportions),
        sampled_maximum_stock_proportion:
          resourceStockProportions.length === 0
            ? null
            : Math.max(...resourceStockProportions),
        sampled_mean_depleted_cell_proportion: mean(resourceDepletedProportions),
        cumulative_regenerated: finalResources?.cumulative_regenerated ?? null,
        cumulative_harvested: finalResources?.cumulative_harvested ?? null,
        cumulative_harvest_requested:
          finalResources?.cumulative_harvest_requested ?? null,
        cumulative_harvest_shortfall:
          finalResources?.cumulative_harvest_shortfall ?? null,
        cumulative_harvest_opportunities:
          finalResources?.cumulative_harvest_opportunities ?? null,
        cumulative_zero_harvests: finalResources?.cumulative_zero_harvests ?? null,
        cumulative_partial_harvests: finalResources?.cumulative_partial_harvests ?? null,
        regeneration_event_residual:
          finalResources === null
            ? null
            : finalResources.cumulative_regenerated - resourceRegenerationFromEvents,
        harvest_transfer_event_residual:
          finalResources === null
            ? null
            : resourceEnergyHarvested - energyByKind[EnergyEventKind.ResourceHarvest],
      },
      reproduction: {
        autonomous_attempts: counters.autonomous_attempts,
        autonomous_successes: counters.autonomous_successes,
        exploitative_attempts: counters.exploitative_attempts,
        exploitative_successes: counters.exploitative_successes,
        births: counters.births,
        deaths: totalDeaths(counters),
      },
      hgt_opportunity: {
        splice_instruction_attempts: counters.hgt_attempts,
        donor_opportunities: hgtDonorOpportunities,
        no_neighbour_attempts: hgtResults[EcologicalResultCode.NoNeighbour],
        donor_opportunity_proportion: safeRatio(
          hgtDonorOpportunities,
          counters.hgt_attempts,
        ),
        successes: counters.hgt_successes,
        success_given_donor_opportunity: safeRatio(
          counters.hgt_successes,
          hgtDonorOpportunities,
        ),
        result_counts: hgtResults,
      },
      mutation_exposure: {
        attempted_total: attemptedMutations,
        accepted_total: acceptedMutations,
        rejected_total: rejectedMutations,
        attempts_per_birth: safeRatio(attemptedMutations, counters.births),
        accepted_per_birth: safeRatio(acceptedMutations, counters.births),
        attempted_by_class: { ...counters.mutation_attempted },
        accepted_by_class: { ...counters.mutation_accepted },
        rejected_by_class: { ...counters.mutation_rejected },
      },
      divergence_eligibility: {
        scheduled_samples: scheduledMeasurements.length,
        samples_with_defined_divergence: definedDivergence,
        samples_at_or_above_twenty_five_percent_eligible: eligibility.filter(
          (proportion) => proportion >= 0.25,
        ).length,
        mean_eligible_proportion: mean(eligibility),
        final_boundary_tick: finalBoundary?.tick ?? null,
        final_boundary_eligible_count: finalBoundary?.divergence?.total.eligible_count ?? null,
        final_boundary_eligible_proportion:
          finalBoundary?.divergence?.total.eligible_proportion ?? null,
        final_boundary_inactive_proportion:
          finalBoundary?.divergence?.total.inactive_proportion ?? null,
        final_boundary_mean_divergence:
          finalBoundary?.divergence?.total.mean_divergence ?? null,
      },
    },
    scaling_projection: {
      target_ticks: projectionTargetTicks,
      run_count: projectionRunCount,
      naive_single_run_wall_ms: projectedSingleWall,
      naive_sequential_batch_wall_ms:
        projectedSingleWall === null ? null : projectedSingleWall * projectionRunCount,
      naive_single_run_storage_bytes: null,
      naive_batch_storage_bytes: null,
      warning:
        "Linear projections are planning diagnostics, not qualification evidence; population, pedigree, event volume, thermal throttling, and concurrent runs may scale non-linearly.",
    },
    storage: null,
    progress,
    interpretation_notes: [
      "One tick activates each organism that was alive at the start of that tick at most once; ticks are therefore not comparable across different population sizes without activation throughput.",
      "HGT donor opportunity counts SPLICE attempts whose chosen neighbour existed; configured success probability is not counted as exposure.",
      "Peak RSS is process-wide maxRSS. Heap is sampled at progress boundaries and may miss a short-lived intermediate peak.",
      "No calibration candidate passes or fails until acceptance ranges and the candidate-selection rule are frozen independently of divergence outcomes.",
      "Resource regeneration is external creation; harvesting is an internal reservoir-to-organism transfer and therefore cancels from the reservoir-inclusive ledger.",
    ],
  };
  return { run, report };
}
