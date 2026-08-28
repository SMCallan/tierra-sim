import type { EngineConfig } from "../../src/config/schema.js";
import type { Lineage } from "../../src/domain/organism.js";
import type { AncestorFixture } from "../../src/seed/fixture.js";
import type { Coordinate } from "../../src/world/coordinates.js";
import { validEngineConfig } from "./config-fixture.js";

export function lifecycleConfig(): EngineConfig {
  const configuration = validEngineConfig();
  configuration.identity.configuration_name = "lifecycle-validation";
  configuration.identity.condition_id = "lifecycle";
  configuration.duration = {
    completed_ticks: 20,
    sample_every_ticks: 1,
    checkpoint_every_ticks: null,
    state_hash_every_ticks: 1,
  };
  configuration.world = {
    width: 5,
    height: 5,
    topology: "toroidal_von_neumann",
    cell_capacity: 1,
    activation_order: "seeded_random_sequential",
    exogenous_death_probability: { numerator: 0, denominator: 1 },
  };
  configuration.energy = {
    fixed_point_scale: 1,
    environmental_income: 0,
    maximum_organism_energy: 10_000,
    base_instruction_cost: 0,
    genome_maintenance: { rule: "linear_floor", numerator: 0, denominator: 1 },
    autonomous_reproduction_cost: 10,
    offspring_endowment: 20,
    exec_nbr_attempt_cost: 5,
    exploit_levy: 10,
    splice_attempt_cost: 2,
    splice_success_cost: 3,
    computation_rewards: { and: 11, xor: 12, equ: 13, add: 14 },
  };
  configuration.reproduction = {
    cooldown_ticks: 2,
    min_genome_length: 1,
    max_genome_length: 16,
    mutation_probability: { numerator: 0, denominator: 1 },
    mutation_weights: { point: 1, insertion: 0, deletion: 0 },
  };
  configuration.hgt = {
    success_probability: { numerator: 1, denominator: 1 },
    min_chunk_length: 1,
    max_chunk_length: 1,
  };
  configuration.measurement = {
    bucket_count: 3,
    bucket_length_ticks: 1,
    informative_action_threshold: 1,
    sensitivity_thresholds: [2],
    functional_class_boundaries: {
      autonomous_max: { numerator: 1, denominator: 10 },
      exploitative_min: { numerator: 9, denominator: 10 },
    },
    detailed_event_logging: true,
  };
  configuration.initial_population.placement_algorithm = "fixed";
  return configuration;
}

export interface FixtureEntry {
  readonly lineage: Lineage;
  readonly genome: readonly number[];
  readonly initial_energy: number;
  readonly coordinates: readonly Coordinate[];
}

export function fixedFixture(entries: readonly FixtureEntry[]): AncestorFixture {
  return {
    schema_version: "0.1.0",
    fixture_id: "lifecycle-fixture",
    ancestors: entries.map((entry) => ({
      lineage: entry.lineage,
      genome: [...entry.genome],
      count: entry.coordinates.length,
      initial_energy: entry.initial_energy,
      coordinates: entry.coordinates.map((coordinate) => ({ ...coordinate })),
    })),
  };
}
