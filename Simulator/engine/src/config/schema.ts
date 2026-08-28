import { z } from "zod";

import { deepFreeze, type DeepReadonly } from "./deep-freeze.js";

const UINT32_RANGE = 0x1_0000_0000;
const sha256Pattern = /^[a-f0-9]{64}$/u;

const nonNegativeInteger = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const positiveInteger = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const uint32 = z.number().int().min(0).max(0xffff_ffff);

export const rationalProbabilitySchema = z
  .strictObject({
    numerator: z.number().int().min(0).max(UINT32_RANGE),
    denominator: z.number().int().min(1).max(UINT32_RANGE),
  })
  .superRefine((probability, context) => {
    if (probability.numerator > probability.denominator) {
      context.addIssue({
        code: "custom",
        message: "Probability numerator must not exceed denominator.",
        path: ["numerator"],
      });
    }
  });

const identitySchema = z.strictObject({
  schema_version: z.enum(["0.1.0", "0.2.0", "0.3.0", "0.4.0"]),
  engine_specification: z.enum(["0.1", "0.2"]),
  configuration_name: z.string().trim().min(1),
  purpose: z.enum(["calibration", "validation", "formal", "demonstration"]),
  run_id: z.string().trim().min(1),
  condition_id: z.string().trim().min(1),
  replicate_id: nonNegativeInteger,
  seed: uint32,
});

const durationSchema = z
  .strictObject({
    completed_ticks: positiveInteger,
    sample_every_ticks: positiveInteger,
    checkpoint_every_ticks: positiveInteger.nullable(),
    state_hash_every_ticks: positiveInteger,
  })
  .superRefine((duration, context) => {
    if (
      duration.checkpoint_every_ticks !== null &&
      duration.checkpoint_every_ticks % duration.sample_every_ticks !== 0
    ) {
      context.addIssue({
        code: "custom",
        message: "Checkpoint interval must be a multiple of the sample interval.",
        path: ["checkpoint_every_ticks"],
      });
    }
    if (duration.state_hash_every_ticks !== duration.sample_every_ticks) {
      context.addIssue({
        code: "custom",
        message: "State-hash and sample intervals must match in schemas 0.1.0 and 0.2.0.",
        path: ["state_hash_every_ticks"],
      });
    }
  });

const worldSchema = z.strictObject({
  width: positiveInteger,
  height: positiveInteger,
  topology: z.literal("toroidal_von_neumann"),
  cell_capacity: z.literal(1),
  activation_order: z.literal("seeded_random_sequential"),
  exogenous_death_probability: rationalProbabilitySchema,
});

const computationRewardsSchema = z.strictObject({
  and: nonNegativeInteger,
  xor: nonNegativeInteger,
  equ: nonNegativeInteger,
  add: nonNegativeInteger,
});

const energySchema = z.strictObject({
  fixed_point_scale: positiveInteger,
  environmental_income: nonNegativeInteger,
  maximum_organism_energy: positiveInteger,
  base_instruction_cost: nonNegativeInteger,
  genome_maintenance: z.strictObject({
    rule: z.literal("linear_floor"),
    numerator: nonNegativeInteger,
    denominator: positiveInteger,
    min_cost: nonNegativeInteger.optional(),
  }),
  autonomous_reproduction_cost: nonNegativeInteger,
  offspring_endowment: positiveInteger,
  exec_nbr_attempt_cost: nonNegativeInteger,
  exploit_levy: nonNegativeInteger,
  splice_attempt_cost: nonNegativeInteger,
  splice_success_cost: nonNegativeInteger,
  computation_rewards: computationRewardsSchema,
});

const reproductionSchema = z
  .strictObject({
    cooldown_ticks: nonNegativeInteger,
    min_genome_length: positiveInteger,
    max_genome_length: positiveInteger,
    mutation_probability: rationalProbabilitySchema,
    mutation_weights: z.strictObject({
      point: nonNegativeInteger,
      insertion: nonNegativeInteger,
      deletion: nonNegativeInteger,
    }),
  })
  .superRefine((reproduction, context) => {
    if (reproduction.min_genome_length > reproduction.max_genome_length) {
      context.addIssue({
        code: "custom",
        message: "Minimum genome length must not exceed maximum genome length.",
        path: ["min_genome_length"],
      });
    }
    const weights = reproduction.mutation_weights;
    if (weights.point + weights.insertion + weights.deletion === 0) {
      context.addIssue({
        code: "custom",
        message: "At least one mutation-class weight must be positive.",
        path: ["mutation_weights"],
      });
    }
    if (
      !Number.isSafeInteger(weights.point + weights.insertion + weights.deletion) ||
      weights.point + weights.insertion + weights.deletion > UINT32_RANGE
    ) {
      context.addIssue({
        code: "custom",
        message: "Mutation-class weights must sum to at most 2^32.",
        path: ["mutation_weights"],
      });
    }
  });

export const donorCopyRuleSchema = z.enum([
  "addressed_locus",
  "cyclic_copy_search",
]);

const exploitationSchema = z.strictObject({
  donor_copy_rule: donorCopyRuleSchema,
});

const resourcesSchema = z.strictObject({
  mode: z.literal("local_renewable"),
  cell_capacity: positiveInteger,
  initial_stock: nonNegativeInteger,
  regeneration_per_tick: nonNegativeInteger,
  harvest_per_activation: positiveInteger,
  harvest_neighbourhood_radius: nonNegativeInteger.optional(),
  regeneration_timing: z.literal("before_scheduler_snapshot"),
  harvest_timing: z.literal("after_exogenous_before_instruction"),
}).superRefine((resources, context) => {
  for (const field of [
    "initial_stock",
    "regeneration_per_tick",
    "harvest_per_activation",
  ] as const) {
    if (resources[field] > resources.cell_capacity) {
      context.addIssue({
        code: "custom",
        message: `${field} must not exceed cell_capacity.`,
        path: [field],
      });
    }
  }
});

const hgtSchema = z
  .strictObject({
    success_probability: rationalProbabilitySchema,
    min_chunk_length: positiveInteger,
    max_chunk_length: positiveInteger,
  })
  .superRefine((hgt, context) => {
    if (hgt.min_chunk_length > hgt.max_chunk_length) {
      context.addIssue({
        code: "custom",
        message: "Minimum HGT chunk length must not exceed maximum chunk length.",
        path: ["min_chunk_length"],
      });
    }
  });

const measurementSchema = z
  .strictObject({
    bucket_count: positiveInteger,
    bucket_length_ticks: positiveInteger,
    informative_action_threshold: positiveInteger,
    sensitivity_thresholds: z.array(positiveInteger).min(1),
    functional_class_boundaries: z.strictObject({
      autonomous_max: rationalProbabilitySchema,
      exploitative_min: rationalProbabilitySchema,
    }),
    detailed_event_logging: z.boolean(),
  })
  .superRefine((measurement, context) => {
    const autonomous = measurement.functional_class_boundaries.autonomous_max;
    const exploitative = measurement.functional_class_boundaries.exploitative_min;
    if (
      BigInt(autonomous.numerator) * BigInt(exploitative.denominator) >=
      BigInt(exploitative.numerator) * BigInt(autonomous.denominator)
    ) {
      context.addIssue({
        code: "custom",
        message: "Autonomous boundary must be below exploitative boundary.",
        path: ["functional_class_boundaries"],
      });
    }
    if (new Set(measurement.sensitivity_thresholds).size !== measurement.sensitivity_thresholds.length) {
      context.addIssue({
        code: "custom",
        message: "Sensitivity thresholds must be unique.",
        path: ["sensitivity_thresholds"],
      });
    }
  });

const initialPopulationSchema = z.strictObject({
  fixture_path: z.string().trim().min(1),
  fixture_sha256: z.string().regex(sha256Pattern),
  placement_algorithm: z.enum(["fixed", "shuffled_cells", "seeded_focal_region"]),
});

export const engineConfigSchema = z
  .strictObject({
    identity: identitySchema,
    duration: durationSchema,
    world: worldSchema,
    energy: energySchema,
    reproduction: reproductionSchema,
    exploitation: exploitationSchema.optional(),
    resources: resourcesSchema.optional(),
    hgt: hgtSchema,
    measurement: measurementSchema,
    initial_population: initialPopulationSchema,
  })
  .superRefine((configuration, context) => {
    if (configuration.duration.sample_every_ticks !== configuration.measurement.bucket_length_ticks) {
      context.addIssue({
        code: "custom",
        message: "Sample interval must equal behavioural bucket length in schemas 0.1.0 and 0.2.0.",
        path: ["duration", "sample_every_ticks"],
      });
    }
    if (configuration.hgt.max_chunk_length > configuration.reproduction.max_genome_length) {
      context.addIssue({
        code: "custom",
        message: "Maximum HGT chunk length cannot exceed maximum genome length.",
        path: ["hgt", "max_chunk_length"],
      });
    }
    if (configuration.energy.offspring_endowment > configuration.energy.maximum_organism_energy) {
      context.addIssue({
        code: "custom",
        message: "Offspring endowment cannot exceed maximum organism energy.",
        path: ["energy", "offspring_endowment"],
      });
    }
    if (
      configuration.initial_population.placement_algorithm === "seeded_focal_region" &&
      configuration.identity.schema_version === "0.1.0"
    ) {
      context.addIssue({
        code: "custom",
        message: "Seeded focal-region placement requires configuration schema 0.2.0 or later.",
        path: ["identity", "schema_version"],
      });
    }
    if (
      (configuration.identity.schema_version === "0.3.0" ||
        configuration.identity.schema_version === "0.4.0") &&
      configuration.exploitation === undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "Configuration schema 0.3.0 or 0.4.0 requires an explicit exploitation policy.",
        path: ["exploitation"],
      });
    }
    if (
      configuration.identity.schema_version !== "0.3.0" &&
      configuration.identity.schema_version !== "0.4.0" &&
      configuration.exploitation !== undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "Explicit exploitation policy requires configuration schema 0.3.0 or later.",
        path: ["identity", "schema_version"],
      });
    }
    const resourceSchema = configuration.identity.schema_version === "0.4.0";
    if (resourceSchema && configuration.identity.engine_specification !== "0.2") {
      context.addIssue({
        code: "custom",
        message: "Configuration schema 0.4.0 requires engine specification 0.2.",
        path: ["identity", "engine_specification"],
      });
    }
    if (!resourceSchema && configuration.identity.engine_specification !== "0.1") {
      context.addIssue({
        code: "custom",
        message: "Configuration schemas 0.1.0–0.3.0 require engine specification 0.1.",
        path: ["identity", "engine_specification"],
      });
    }
    if (resourceSchema && configuration.resources === undefined) {
      context.addIssue({
        code: "custom",
        message: "Configuration schema 0.4.0 requires local renewable resources.",
        path: ["resources"],
      });
    }
    if (!resourceSchema && configuration.resources !== undefined) {
      context.addIssue({
        code: "custom",
        message: "Local renewable resources require configuration schema 0.4.0.",
        path: ["identity", "schema_version"],
      });
    }
    if (resourceSchema && configuration.energy.environmental_income !== 0) {
      context.addIssue({
        code: "custom",
        message: "Schema 0.4.0 replaces passive environmental income; the value must be zero.",
        path: ["energy", "environmental_income"],
      });
    }
    if (
      configuration.resources !== undefined &&
      !Number.isSafeInteger(
        configuration.world.width *
          configuration.world.height *
          configuration.resources.cell_capacity,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Total resource capacity exceeds the safe-integer accounting range.",
        path: ["resources", "cell_capacity"],
      });
    }
  });

export type RationalProbability = z.infer<typeof rationalProbabilitySchema>;
export type DonorCopyRule = z.infer<typeof donorCopyRuleSchema>;
export type LocalResourceConfig = z.infer<typeof resourcesSchema>;
export type EngineConfig = z.infer<typeof engineConfigSchema>;
export type ImmutableEngineConfig = DeepReadonly<EngineConfig>;

export function parseEngineConfig(input: unknown): ImmutableEngineConfig {
  return deepFreeze(engineConfigSchema.parse(input));
}
