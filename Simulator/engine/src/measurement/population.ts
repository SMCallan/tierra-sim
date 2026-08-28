import type { ImmutableEngineConfig } from "../config/schema.js";
import type { RunCounters } from "../domain/events.js";
import { Lineage, type OrganismState } from "../domain/organism.js";
import {
  calculateLineageInformation,
  countFunctionalClasses,
  measureOrganismBehaviour,
  summariseDivergence,
  type DivergenceSummary,
  type FunctionalClassCounts,
  type LineageInformation,
  type OrganismBehaviourMeasurement,
} from "./divergence.js";
import {
  measureSpatialStructure,
  type SpatialStructureMeasurement,
} from "./spatial.js";
import {
  measureLocalResources,
  type LocalResourceMeasurement,
} from "./resources.js";
import type { LocalResourceStateSnapshot } from "../world/resource-field.js";

export type SampleKind = "scheduled" | "terminal";

export interface PopulationStateSummary {
  readonly population_total: number;
  readonly host_population: number;
  readonly parasite_population: number;
  readonly total_energy: number;
  readonly mean_energy: number | null;
  readonly mean_genome_length: number | null;
  readonly minimum_genome_length: number | null;
  readonly maximum_genome_length: number | null;
  readonly minimum_genome_bound_count: number;
  readonly maximum_genome_bound_count: number;
  readonly maximum_generation: number | null;
  readonly mean_age_ticks: number | null;
}

export interface StratifiedDivergence {
  readonly total: DivergenceSummary;
  readonly host: DivergenceSummary;
  readonly parasite: DivergenceSummary;
}

export interface StratifiedFunctionalClasses {
  readonly total: FunctionalClassCounts;
  readonly host: FunctionalClassCounts;
  readonly parasite: FunctionalClassCounts;
}

export interface SensitivityMeasurement {
  readonly informative_action_threshold: number;
  readonly divergence: StratifiedDivergence;
  readonly functional_classes: StratifiedFunctionalClasses;
  readonly lineage_information: LineageInformation;
}

export interface PopulationMeasurement {
  readonly run_id: string;
  readonly condition_id: string;
  readonly replicate_id: number;
  readonly tick: number;
  readonly sample_kind: SampleKind;
  readonly state_hash: string;
  readonly state: PopulationStateSummary;
  readonly divergence: StratifiedDivergence | null;
  readonly functional_classes: StratifiedFunctionalClasses | null;
  readonly lineage_information: LineageInformation | null;
  readonly sensitivity: readonly SensitivityMeasurement[];
  readonly spatial_structure: SpatialStructureMeasurement;
  readonly resources: LocalResourceMeasurement | null;
  readonly cumulative_counters: RunCounters;
}

function safeIntegerSum(values: readonly number[], label: string): number {
  let total = 0;
  for (const value of values) {
    const next = total + value;
    if (!Number.isSafeInteger(next)) {
      throw new RangeError(`${label} exceeds the safe-integer range.`);
    }
    total = next;
  }
  return total;
}

function measurementsAtThreshold(
  organisms: readonly Readonly<OrganismState>[],
  configuration: ImmutableEngineConfig,
  threshold: number,
): readonly OrganismBehaviourMeasurement[] {
  return organisms.map((organism) =>
    measureOrganismBehaviour(
      organism,
      threshold,
      configuration.measurement.functional_class_boundaries,
    ),
  );
}

function stratifyDivergence(
  measurements: readonly OrganismBehaviourMeasurement[],
): StratifiedDivergence {
  return {
    total: summariseDivergence(measurements),
    host: summariseDivergence(
      measurements.filter((measurement) => measurement.lineage === Lineage.Host),
    ),
    parasite: summariseDivergence(
      measurements.filter((measurement) => measurement.lineage === Lineage.Parasite),
    ),
  };
}

function stratifyFunctionalClasses(
  measurements: readonly OrganismBehaviourMeasurement[],
): StratifiedFunctionalClasses {
  return {
    total: countFunctionalClasses(measurements),
    host: countFunctionalClasses(
      measurements.filter((measurement) => measurement.lineage === Lineage.Host),
    ),
    parasite: countFunctionalClasses(
      measurements.filter((measurement) => measurement.lineage === Lineage.Parasite),
    ),
  };
}

function populationState(
  organisms: readonly Readonly<OrganismState>[],
  configuration: ImmutableEngineConfig,
): PopulationStateSummary {
  const populationTotal = organisms.length;
  const totalEnergy = safeIntegerSum(
    organisms.map((organism) => organism.energy),
    "population energy",
  );
  const mean = (values: readonly number[]): number | null =>
    values.length === 0 ? null : values.reduce((total, value) => total + value, 0) / values.length;
  const genomeLengths = organisms.map((organism) => organism.genome.length);
  return {
    population_total: populationTotal,
    host_population: organisms.filter((organism) => organism.lineage === Lineage.Host).length,
    parasite_population: organisms.filter((organism) => organism.lineage === Lineage.Parasite)
      .length,
    total_energy: totalEnergy,
    mean_energy: populationTotal === 0 ? null : totalEnergy / populationTotal,
    mean_genome_length: mean(genomeLengths),
    minimum_genome_length:
      populationTotal === 0 ? null : Math.min(...genomeLengths),
    maximum_genome_length:
      populationTotal === 0 ? null : Math.max(...genomeLengths),
    minimum_genome_bound_count: genomeLengths.filter(
      (length) => length === configuration.reproduction.min_genome_length,
    ).length,
    maximum_genome_bound_count: genomeLengths.filter(
      (length) => length === configuration.reproduction.max_genome_length,
    ).length,
    maximum_generation:
      populationTotal === 0 ? null : Math.max(...organisms.map((organism) => organism.generation)),
    mean_age_ticks: mean(organisms.map((organism) => organism.age_ticks)),
  };
}

export interface PopulationMeasurementInput {
  readonly configuration: ImmutableEngineConfig;
  readonly organisms: readonly Readonly<OrganismState>[];
  readonly counters: RunCounters;
  readonly tick: number;
  readonly sample_kind: SampleKind;
  readonly state_hash: string;
  readonly include_formal_divergence: boolean;
  readonly world_occupancy: readonly (number | null)[];
  readonly local_resources: Readonly<LocalResourceStateSnapshot> | null;
}

export function measurePopulation(input: PopulationMeasurementInput): PopulationMeasurement {
  const primaryMeasurements = measurementsAtThreshold(
    input.organisms,
    input.configuration,
    input.configuration.measurement.informative_action_threshold,
  );
  const primaryDivergence = input.include_formal_divergence
    ? stratifyDivergence(primaryMeasurements)
    : null;
  const primaryClasses = input.include_formal_divergence
    ? stratifyFunctionalClasses(primaryMeasurements)
    : null;
  const primaryInformation = input.include_formal_divergence
    ? calculateLineageInformation(primaryMeasurements)
    : null;
  const sensitivity = input.include_formal_divergence
    ? input.configuration.measurement.sensitivity_thresholds.map((threshold) => {
        const measurements = measurementsAtThreshold(
          input.organisms,
          input.configuration,
          threshold,
        );
        return {
          informative_action_threshold: threshold,
          divergence: stratifyDivergence(measurements),
          functional_classes: stratifyFunctionalClasses(measurements),
          lineage_information: calculateLineageInformation(measurements),
        };
      })
    : [];

  return {
    run_id: input.configuration.identity.run_id,
    condition_id: input.configuration.identity.condition_id,
    replicate_id: input.configuration.identity.replicate_id,
    tick: input.tick,
    sample_kind: input.sample_kind,
    state_hash: input.state_hash,
    state: populationState(input.organisms, input.configuration),
    divergence: primaryDivergence,
    functional_classes: primaryClasses,
    lineage_information: primaryInformation,
    sensitivity,
    spatial_structure: measureSpatialStructure(
      input.organisms,
      input.configuration.world.width,
      input.configuration.world.height,
    ),
    resources:
      input.local_resources === null
        ? null
        : measureLocalResources(input.local_resources, input.world_occupancy),
    cumulative_counters: input.counters,
  };
}
