import type { EngineConfig } from "../../src/config/schema.js";

export function validEngineConfig(): EngineConfig {
  return {
    identity: {
      schema_version: "0.1.0",
      engine_specification: "0.1",
      configuration_name: "validation-fixture",
      purpose: "validation",
      run_id: "validation-0001",
      condition_id: "vm-foundation",
      replicate_id: 0,
      seed: 1,
    },
    duration: {
      completed_ticks: 1_000,
      sample_every_ticks: 200,
      checkpoint_every_ticks: 400,
      state_hash_every_ticks: 200,
    },
    world: {
      width: 64,
      height: 64,
      topology: "toroidal_von_neumann",
      cell_capacity: 1,
      activation_order: "seeded_random_sequential",
      exogenous_death_probability: { numerator: 1, denominator: 5_000 },
    },
    energy: {
      fixed_point_scale: 1_000,
      environmental_income: 10,
      maximum_organism_energy: 10_000,
      base_instruction_cost: 1,
      genome_maintenance: {
        rule: "linear_floor",
        numerator: 1,
        denominator: 64,
      },
      autonomous_reproduction_cost: 100,
      offspring_endowment: 500,
      exec_nbr_attempt_cost: 5,
      exploit_levy: 100,
      splice_attempt_cost: 2,
      splice_success_cost: 20,
      computation_rewards: {
        and: 10,
        xor: 20,
        equ: 30,
        add: 40,
      },
    },
    reproduction: {
      cooldown_ticks: 100,
      min_genome_length: 4,
      max_genome_length: 64,
      mutation_probability: { numerator: 1, denominator: 50 },
      mutation_weights: {
        point: 6,
        insertion: 2,
        deletion: 2,
      },
    },
    hgt: {
      success_probability: { numerator: 1, denominator: 2 },
      min_chunk_length: 1,
      max_chunk_length: 4,
    },
    measurement: {
      bucket_count: 25,
      bucket_length_ticks: 200,
      informative_action_threshold: 5,
      sensitivity_thresholds: [1, 10],
      functional_class_boundaries: {
        autonomous_max: { numerator: 1, denominator: 10 },
        exploitative_min: { numerator: 9, denominator: 10 },
      },
      detailed_event_logging: false,
    },
    initial_population: {
      fixture_path: "fixtures/ancestors-v1.json",
      fixture_sha256: "a".repeat(64),
      placement_algorithm: "shuffled_cells",
    },
  };
}
