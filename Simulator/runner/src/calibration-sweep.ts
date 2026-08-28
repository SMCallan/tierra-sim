import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  canonicalJson,
  parseEngineConfig,
  sha256,
  type DonorCopyRule,
  type EngineConfig,
  type PopulationMeasurement,
  type RationalProbability,
  type RunCounters,
} from "@tierra-sim/engine";
import { z } from "zod";

import {
  executeBenchmark,
  type BenchmarkProgress,
  type CompletedBenchmark,
} from "./benchmark.js";
import { aggregateLineageDiagnostics } from "./diagnostics.js";
import type { LineageDiagnostics } from "./types.js";

const nonNegativeInteger = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const positiveInteger = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const proportion = z.number().min(0).max(1);
const safeIdentifier = z.string().regex(/^[A-Za-z0-9._-]+$/u);

const rationalProbabilitySchema = z
  .strictObject({
    numerator: nonNegativeInteger,
    denominator: positiveInteger,
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

const deathFactorSchema = z.strictObject({
  label: safeIdentifier,
  numerator: nonNegativeInteger,
  denominator: positiveInteger,
}).superRefine((factor, context) => {
  if (factor.numerator > factor.denominator) {
    context.addIssue({
      code: "custom",
      message: "Death-probability numerator must not exceed denominator.",
      path: ["numerator"],
    });
  }
});

const rankingOrderSchema = z.tuple([
  z.literal("mandatory_gate_failures_ascending"),
  z.literal("ecological_gate_passes_descending"),
  z.literal("distance_from_0.50_late_occupancy_ascending"),
  z.literal("minimum_final_lineage_proportion_descending"),
  z.literal("late_eligibility_proportion_descending"),
  z.literal("projected_single_run_minutes_ascending"),
]);

const resourceRankingOrderSchema = z.tuple([
  z.literal("mandatory_gate_failures_ascending"),
  z.literal("ecological_gate_passes_descending"),
  z.literal("distance_from_0.50_late_occupancy_ascending"),
  z.literal("distance_from_0.50_late_resource_stock_ascending"),
  z.literal("interaction_exposure_through_tick_descending"),
  z.literal("late_eligibility_proportion_descending"),
  z.literal("projected_single_run_minutes_ascending"),
]);

const prohibitedInputsSchema = z.tuple([
  z.literal("mean_divergence"),
  z.literal("maximum_divergence"),
  z.literal("divergence_onset"),
  z.literal("visual_preference"),
]);

const resourceProhibitedInputsSchema = z.tuple([
  z.literal("mean_divergence"),
  z.literal("maximum_divergence"),
  z.literal("divergence_onset"),
  z.literal("final_lineage_abundance"),
  z.literal("visual_preference"),
]);

export const calibrationSweepSpecSchema = z
  .strictObject({
    schema_version: z.enum(["0.1.0", "0.2.0", "0.3.0", "0.4.0"]),
    sweep_id: safeIdentifier,
    stage: z.enum(["coarse_screen", "mechanism_control", "resource_screen"]),
    base_configuration_path: z.string().trim().min(1),
    fixture_path: z.string().trim().min(1),
    replicate_seeds: z.array(z.number().int().min(0).max(0xffff_ffff)).min(1),
    report_every_ticks: positiveInteger,
    late_window_fraction: rationalProbabilitySchema,
    factors: z.strictObject({
      environmental_income: z.array(nonNegativeInteger).min(1),
      exogenous_death_probability: z.array(deathFactorSchema).min(1),
      autonomous_reproduction_cost: z.array(nonNegativeInteger).min(1).optional(),
      reproduction_cooldown_ticks: z.array(nonNegativeInteger).min(1).optional(),
      exec_nbr_attempt_cost: z.array(positiveInteger).min(1).optional(),
      exec_nbr_donor_copy_rule: z
        .array(z.enum(["addressed_locus", "cyclic_copy_search"]))
        .min(1)
        .optional(),
      resource_regeneration_per_tick: z.array(nonNegativeInteger).min(1).optional(),
      resource_harvest_per_activation: z.array(positiveInteger).min(1).optional(),
    }),
    screening_acceptance: z.strictObject({
      late_mean_occupancy_min: proportion,
      late_mean_occupancy_max: proportion,
      late_maximum_occupancy: proportion,
      minimum_final_lineage_proportion: proportion,
      minimum_late_autonomous_successes: nonNegativeInteger,
      minimum_late_exploitative_successes: nonNegativeInteger,
      minimum_late_hgt_donor_opportunities: nonNegativeInteger,
      minimum_late_hgt_successes: nonNegativeInteger,
      minimum_late_eligibility_proportion: proportion,
      computation_created_energy_share_min: proportion,
      computation_created_energy_share_max: proportion,
      maximum_sampled_genome_bound_proportion: proportion,
      maximum_projected_single_run_minutes: z.number().positive().finite(),
      maximum_peak_rss_bytes: positiveInteger,
      minimum_late_mean_host_parasite_contact_edges: nonNegativeInteger.optional(),
      minimum_both_lineages_observed_through_tick: positiveInteger.optional(),
      minimum_whole_run_exploitative_successes: nonNegativeInteger.optional(),
      late_mean_resource_stock_proportion_min: proportion.optional(),
      late_mean_resource_stock_proportion_max: proportion.optional(),
      maximum_late_mean_depleted_cell_proportion: proportion.optional(),
    }),
    confirmation_requirements: z.strictObject({
      minimum_ticks: positiveInteger,
      minimum_independent_seeds: positiveInteger,
      minimum_late_eligibility_proportion: proportion,
      requires_full_5000_tick_behaviour_window: z.boolean(),
    }),
    ranking_order: z.union([rankingOrderSchema, resourceRankingOrderSchema]),
    prohibited_selection_inputs: z.union([
      prohibitedInputsSchema,
      resourceProhibitedInputsSchema,
    ]),
  })
  .superRefine((specification, context) => {
    const acceptance = specification.screening_acceptance;
    if (acceptance.late_mean_occupancy_min > acceptance.late_mean_occupancy_max) {
      context.addIssue({
        code: "custom",
        message: "Minimum late occupancy must not exceed maximum late occupancy.",
        path: ["screening_acceptance", "late_mean_occupancy_min"],
      });
    }
    if (
      acceptance.computation_created_energy_share_min >
      acceptance.computation_created_energy_share_max
    ) {
      context.addIssue({
        code: "custom",
        message: "Minimum computation share must not exceed maximum computation share.",
        path: ["screening_acceptance", "computation_created_energy_share_min"],
      });
    }
    const unique = (values: readonly (string | number)[]): boolean =>
      new Set(values).size === values.length;
    if (!unique(specification.replicate_seeds)) {
      context.addIssue({
        code: "custom",
        message: "Replicate seeds must be unique.",
        path: ["replicate_seeds"],
      });
    }
    if (!unique(specification.factors.environmental_income)) {
      context.addIssue({
        code: "custom",
        message: "Environmental-income levels must be unique.",
        path: ["factors", "environmental_income"],
      });
    }
    if (!unique(specification.factors.exogenous_death_probability.map((item) => item.label))) {
      context.addIssue({
        code: "custom",
        message: "Death-factor labels must be unique.",
        path: ["factors", "exogenous_death_probability"],
      });
    }
    for (const [name, values] of [
      ["autonomous_reproduction_cost", specification.factors.autonomous_reproduction_cost],
      ["reproduction_cooldown_ticks", specification.factors.reproduction_cooldown_ticks],
      ["exec_nbr_attempt_cost", specification.factors.exec_nbr_attempt_cost],
    ] as const) {
      if (values !== undefined && !unique(values)) {
        context.addIssue({
          code: "custom",
          message: `${name} levels must be unique.`,
          path: ["factors", name],
        });
      }
    }
    if (
      specification.factors.exec_nbr_donor_copy_rule !== undefined &&
      !unique(specification.factors.exec_nbr_donor_copy_rule)
    ) {
      context.addIssue({
        code: "custom",
        message: "EXEC_NBR donor-COPY rule levels must be unique.",
        path: ["factors", "exec_nbr_donor_copy_rule"],
      });
    }
    if (specification.schema_version !== "0.1.0") {
      for (const [name, values] of [
        ["autonomous_reproduction_cost", specification.factors.autonomous_reproduction_cost],
        ["reproduction_cooldown_ticks", specification.factors.reproduction_cooldown_ticks],
        ["exec_nbr_attempt_cost", specification.factors.exec_nbr_attempt_cost],
      ] as const) {
        if (values === undefined) {
          context.addIssue({
            code: "custom",
            message: `Calibration schema 0.2.0 requires ${name}.`,
            path: ["factors", name],
          });
        }
      }
      if (
        specification.screening_acceptance
          .minimum_late_mean_host_parasite_contact_edges === undefined
      ) {
        context.addIssue({
          code: "custom",
          message: "Calibration schema 0.2.0 requires the cross-lineage contact gate.",
          path: [
            "screening_acceptance",
            "minimum_late_mean_host_parasite_contact_edges",
          ],
        });
      }
    }
    if (
      specification.schema_version === "0.3.0" &&
      specification.factors.exec_nbr_donor_copy_rule === undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "Calibration schema 0.3.0 requires the EXEC_NBR donor-COPY rule factor.",
        path: ["factors", "exec_nbr_donor_copy_rule"],
      });
    }
    if (
      specification.stage === "mechanism_control" &&
      specification.schema_version !== "0.3.0"
    ) {
      context.addIssue({
        code: "custom",
        message: "Mechanism controls require calibration schema 0.3.0.",
        path: ["schema_version"],
      });
    }
    if (specification.schema_version === "0.4.0") {
      for (const [name, values] of [
        [
          "resource_regeneration_per_tick",
          specification.factors.resource_regeneration_per_tick,
        ],
        [
          "resource_harvest_per_activation",
          specification.factors.resource_harvest_per_activation,
        ],
      ] as const) {
        if (values === undefined) {
          context.addIssue({
            code: "custom",
            message: `Calibration schema 0.4.0 requires ${name}.`,
            path: ["factors", name],
          });
        } else if (!unique(values)) {
          context.addIssue({
            code: "custom",
            message: `${name} levels must be unique.`,
            path: ["factors", name],
          });
        }
      }
      for (const name of [
        "minimum_both_lineages_observed_through_tick",
        "minimum_whole_run_exploitative_successes",
        "late_mean_resource_stock_proportion_min",
        "late_mean_resource_stock_proportion_max",
        "maximum_late_mean_depleted_cell_proportion",
      ] as const) {
        if (specification.screening_acceptance[name] === undefined) {
          context.addIssue({
            code: "custom",
            message: `Calibration schema 0.4.0 requires ${name}.`,
            path: ["screening_acceptance", name],
          });
        }
      }
      if (specification.stage !== "resource_screen") {
        context.addIssue({
          code: "custom",
          message: "Calibration schema 0.4.0 requires the resource_screen stage.",
          path: ["stage"],
        });
      }
      if (specification.ranking_order.length !== 7) {
        context.addIssue({
          code: "custom",
          message: "Resource screens require the resource-aware ranking order.",
          path: ["ranking_order"],
        });
      }
      if (specification.prohibited_selection_inputs.length !== 5) {
        context.addIssue({
          code: "custom",
          message: "Resource screens must prohibit final-lineage-abundance selection.",
          path: ["prohibited_selection_inputs"],
        });
      }
      const minimum = specification.screening_acceptance.late_mean_resource_stock_proportion_min;
      const maximum = specification.screening_acceptance.late_mean_resource_stock_proportion_max;
      if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
        context.addIssue({
          code: "custom",
          message: "Minimum resource stock proportion must not exceed maximum.",
          path: ["screening_acceptance", "late_mean_resource_stock_proportion_min"],
        });
      }
    }
  });

export type CalibrationSweepSpec = z.infer<typeof calibrationSweepSpecSchema>;

export interface LoadedCalibrationSweep {
  readonly specification: CalibrationSweepSpec;
  readonly base_configuration: EngineConfig;
  readonly fixture: unknown;
  readonly sweep_specification_sha256: string;
  readonly base_configuration_sha256: string;
  readonly fixture_sha256: string;
  readonly source_paths: {
    readonly sweep_specification: string;
    readonly base_configuration: string;
    readonly fixture: string;
  };
}

export interface CalibrationCandidateIdentity {
  readonly execution_index: number;
  readonly candidate_id: string;
  readonly condition_id: string;
  readonly seed: number;
  readonly replicate_id: number;
  readonly environmental_income: number;
  readonly exogenous_death_probability: RationalProbability & { readonly label: string };
  readonly autonomous_reproduction_cost: number | null;
  readonly reproduction_cooldown_ticks: number | null;
  readonly exec_nbr_attempt_cost: number | null;
  readonly exec_nbr_donor_copy_rule: DonorCopyRule | null;
  readonly resource_regeneration_per_tick: number | null;
  readonly resource_harvest_per_activation: number | null;
}

export interface CalibrationGates {
  readonly completed_without_extinction: boolean;
  readonly energy_ledger_exact: boolean;
  readonly energy_source_events_exact: boolean;
  readonly energy_transfer_events_exact: boolean;
  readonly resource_events_exact: boolean;
  readonly late_occupancy_range: boolean;
  readonly late_occupancy_ceiling: boolean;
  readonly both_lineages_final: boolean;
  readonly both_lineages_throughout_late_window: boolean;
  readonly late_autonomous_success: boolean;
  readonly late_exploitative_success: boolean;
  readonly late_hgt_donor_opportunity: boolean;
  readonly late_hgt_success: boolean;
  readonly late_eligibility_screen: boolean;
  readonly computation_energy_present_non_dominant: boolean;
  readonly genome_bound_contact: boolean;
  readonly late_cross_lineage_contact: boolean;
  readonly minimum_interaction_exposure: boolean;
  readonly whole_run_exploitative_exposure: boolean;
  readonly late_resource_stock_range: boolean;
  readonly late_resource_depletion: boolean;
  readonly runtime: boolean;
  readonly memory: boolean;
}

export interface CalibrationCandidateSummary extends CalibrationCandidateIdentity {
  readonly rank: number;
  readonly requested_ticks: number;
  readonly completed_ticks: number;
  readonly terminal_reason: string;
  readonly configuration_id: string;
  readonly final_state_hash: string;
  readonly late_window: {
    readonly target_start_tick: number;
    readonly baseline_tick: number;
    readonly first_observed_tick: number | null;
    readonly observed_sample_count: number;
  };
  readonly occupancy: {
    readonly late_mean_proportion: number | null;
    readonly late_maximum_proportion: number | null;
  };
  readonly lineage_survival: {
    readonly final_host_proportion: number;
    readonly final_parasite_proportion: number;
    readonly minimum_final_lineage_proportion: number;
    readonly both_present_at_every_late_sample: boolean;
  };
  readonly interaction_exposure: {
    readonly last_sample_tick_with_both_lineages: number | null;
    readonly last_sample_tick_with_cross_lineage_contact: number | null;
    readonly whole_run_exploitative_successes: number;
  };
  readonly late_mechanism_opportunity: {
    readonly autonomous_successes: number;
    readonly exploitative_successes: number;
    readonly hgt_donor_opportunities: number;
    readonly hgt_successes: number;
  };
  readonly measurement_eligibility: {
    readonly late_mean_eligible_proportion: number | null;
  };
  readonly computation: {
    readonly energy_credited: number;
    readonly share_of_created_energy: number | null;
  };
  readonly genome_length: {
    readonly sampled_maximum_any_bound_proportion: number | null;
  };
  readonly spatial_structure: {
    readonly late_mean_host_parasite_contact_edges: number | null;
    readonly late_minimum_host_parasite_contact_edges: number | null;
    readonly late_mean_same_lineage_edge_proportion: number | null;
    readonly late_mean_host_largest_patch_proportion: number | null;
    readonly late_mean_parasite_largest_patch_proportion: number | null;
  };
  readonly lineage_diagnostics: {
    readonly whole_run: LineageDiagnostics;
    readonly late_window: LineageDiagnostics;
  };
  readonly energy_balance: {
    readonly ledger_residual: number;
    readonly source_event_residual: number;
  };
  readonly local_resources: {
    readonly late_mean_stock_proportion: number | null;
    readonly late_minimum_stock_proportion: number | null;
    readonly late_maximum_stock_proportion: number | null;
    readonly late_mean_depleted_cell_proportion: number | null;
    readonly cumulative_regenerated: number | null;
    readonly cumulative_harvested: number | null;
    readonly cumulative_harvest_shortfall: number | null;
  };
  readonly resources: {
    readonly ticks_per_second: number;
    readonly activations_per_second: number;
    readonly projected_single_run_minutes: number | null;
    readonly peak_rss_bytes: number;
  };
  readonly gates: CalibrationGates;
  readonly mandatory_gate_failures: number;
  readonly ecological_gate_passes: number;
  readonly screening_passed: boolean;
}

export interface ConfirmationCandidateObservation {
  readonly seed: number;
  readonly completed_ticks: number;
  readonly late_eligibility_proportion: number | null;
  readonly screening_passed: boolean;
}

export interface ConfirmationRequirementResult<Declared, Observed> {
  readonly declared: Declared;
  readonly observed: Observed;
  readonly passed: boolean;
}

export interface ConfirmationRequirementEvaluation {
  readonly minimum_ticks: ConfirmationRequirementResult<
    number,
    { readonly minimum_completed_ticks: number | null }
  >;
  readonly minimum_independent_seeds: ConfirmationRequirementResult<
    number,
    { readonly distinct_seed_count: number }
  >;
  readonly minimum_late_eligibility_proportion: ConfirmationRequirementResult<
    number,
    {
      readonly minimum_late_eligibility_proportion: number | null;
      readonly maximum_late_eligibility_proportion: number | null;
    }
  >;
  readonly requires_full_5000_tick_behaviour_window: ConfirmationRequirementResult<
    boolean,
    {
      readonly required_window_ticks: 5000;
      readonly sample_every_ticks: number;
      readonly required_sample_count: number | null;
      readonly minimum_completed_ticks: number | null;
      readonly every_candidate_has_full_window: boolean;
    }
  >;
}

export interface ConfirmationAssessment {
  readonly requirements: ConfirmationRequirementEvaluation;
  readonly all_candidates_screening_passed: boolean;
  readonly development_override_absent: boolean;
  readonly confirmation_evidence: boolean;
}

export interface CalibrationSweepReport {
  readonly report_schema_version: "0.6.0";
  readonly sweep_id: string;
  readonly stage: CalibrationSweepSpec["stage"];
  readonly development_override: {
    readonly ticks: number | null;
    readonly candidate_limit: number | null;
    readonly confirmation_evidence: boolean;
  };
  readonly confirmation_requirements: ConfirmationRequirementEvaluation;
  readonly sweep_specification_sha256: string;
  readonly base_configuration_sha256: string;
  readonly fixture_sha256: string;
  readonly started_at: string;
  readonly finished_at: string;
  readonly generated_candidate_count: number;
  readonly executed_candidate_count: number;
  readonly screening_pass_count: number;
  readonly confirmation_candidate_ids: readonly string[];
  readonly ranking_order: CalibrationSweepSpec["ranking_order"];
  readonly prohibited_selection_inputs: CalibrationSweepSpec["prohibited_selection_inputs"];
  readonly candidates: readonly CalibrationCandidateSummary[];
  readonly interpretation_notes: readonly string[];
}

export interface CalibrationSweepExecutionOptions {
  readonly ticks_override?: number;
  readonly candidate_limit?: number;
  readonly projection_target_ticks?: number;
  readonly projection_run_count?: number;
  readonly onCandidateStarted?: (candidate: CalibrationCandidateIdentity) => void;
  readonly onCandidateProgress?: (
    candidate: CalibrationCandidateIdentity,
    progress: BenchmarkProgress,
  ) => void;
  readonly onCandidateCompleted?: (
    completed: CompletedBenchmark,
    summary: CalibrationCandidateSummary,
  ) => void | Promise<void>;
}

function mean(values: readonly number[]): number | null {
  return values.length === 0
    ? null
    : values.reduce((total, value) => total + value, 0) / values.length;
}

function counterDifference(current: number, previous: number, label: string): number {
  const difference = current - previous;
  if (!Number.isSafeInteger(difference) || difference < 0) {
    throw new Error(`Calibration counter ${label} moved backwards or overflowed.`);
  }
  return difference;
}

function zeroCounters(): RunCounters {
  const mutation = { point: 0, insertion: 0, deletion: 0 };
  return {
    initial_energy: 0,
    activations: 0,
    autonomous_attempts: 0,
    autonomous_successes: 0,
    exploitative_attempts: 0,
    exploitative_successes: 0,
    hgt_attempts: 0,
    hgt_successes: 0,
    computation_rewards: 0,
    births: 0,
    deaths_exogenous: 0,
    deaths_energy: 0,
    deaths_exploitation: 0,
    mutation_attempted: { ...mutation },
    mutation_accepted: { ...mutation },
    mutation_rejected: { ...mutation },
    energy_created: 0,
    energy_transferred: 0,
    energy_dissipated: 0,
    energy_discarded: 0,
  };
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

function canonicalGovernanceJson(value: unknown): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Governance JSON accepts finite numbers only.");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalGovernanceJson).join(",")}]`;
  }
  if (typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalGovernanceJson(item)}`)
      .join(",")}}`;
  }
  throw new TypeError(`Unsupported governance JSON value: ${typeof value}.`);
}

export async function loadCalibrationSweep(
  sweepSpecificationPath: string,
  workspaceRoot: string,
): Promise<LoadedCalibrationSweep> {
  const specificationPath = resolve(sweepSpecificationPath);
  const rawSpecification = await readJson(specificationPath);
  const specification = calibrationSweepSpecSchema.parse(rawSpecification);
  const baseConfigurationPath = resolve(workspaceRoot, specification.base_configuration_path);
  const fixturePath = resolve(workspaceRoot, specification.fixture_path);
  const rawBaseConfiguration = await readJson(baseConfigurationPath);
  const baseConfiguration = structuredClone(parseEngineConfig(rawBaseConfiguration)) as EngineConfig;
  const fixture = await readJson(fixturePath);
  const fixtureDigest = sha256(canonicalJson(fixture));

  if (baseConfiguration.world.width !== 64 || baseConfiguration.world.height !== 64) {
    throw new Error("Calibration sweep v1 requires an explicit 64×64 world.");
  }
  if (baseConfiguration.identity.purpose !== "calibration") {
    throw new Error("Calibration sweep base configuration must use purpose 'calibration'.");
  }
  if (baseConfiguration.measurement.detailed_event_logging) {
    throw new Error("Calibration sweeps must disable detailed event retention.");
  }
  if (baseConfiguration.duration.checkpoint_every_ticks !== null) {
    throw new Error("Calibration sweeps must disable checkpoints during screening.");
  }
  if (
    specification.report_every_ticks % baseConfiguration.duration.sample_every_ticks !==
    0
  ) {
    throw new Error("Sweep reporting interval must be a multiple of the sample interval.");
  }
  if (baseConfiguration.initial_population.fixture_path !== specification.fixture_path) {
    throw new Error("Sweep and base configuration must govern the same fixture path.");
  }
  if (baseConfiguration.initial_population.fixture_sha256 !== fixtureDigest) {
    throw new Error(
      `Calibration fixture digest mismatch: expected ${baseConfiguration.initial_population.fixture_sha256}, received ${fixtureDigest}.`,
    );
  }

  return {
    specification,
    base_configuration: baseConfiguration,
    fixture,
    sweep_specification_sha256: sha256(canonicalGovernanceJson(rawSpecification)),
    base_configuration_sha256: sha256(canonicalJson(rawBaseConfiguration)),
    fixture_sha256: fixtureDigest,
    source_paths: {
      sweep_specification: specificationPath,
      base_configuration: baseConfigurationPath,
      fixture: fixturePath,
    },
  };
}

function candidateIdentities(specification: CalibrationSweepSpec): CalibrationCandidateIdentity[] {
  const candidates: CalibrationCandidateIdentity[] = [];
  const autonomousCosts = specification.factors.autonomous_reproduction_cost ?? [null];
  const cooldowns = specification.factors.reproduction_cooldown_ticks ?? [null];
  const execCosts = specification.factors.exec_nbr_attempt_cost ?? [null];
  const donorCopyRules = specification.factors.exec_nbr_donor_copy_rule ?? [null];
  const resourceRegenerationLevels =
    specification.factors.resource_regeneration_per_tick ?? [null];
  const resourceHarvestLevels =
    specification.factors.resource_harvest_per_activation ?? [null];
  for (const environmentalIncome of specification.factors.environmental_income) {
    for (const execCost of execCosts) {
      for (const donorCopyRule of donorCopyRules) {
        for (const autonomousCost of autonomousCosts) {
          for (const cooldown of cooldowns) {
            for (const resourceRegeneration of resourceRegenerationLevels) {
              for (const resourceHarvest of resourceHarvestLevels) {
                for (const deathProbability of specification.factors.exogenous_death_probability) {
                  for (const [replicateId, seed] of specification.replicate_seeds.entries()) {
                const factorSuffix = [
                  `income-${environmentalIncome}`,
                  execCost === null ? null : `exec-${execCost}`,
                  donorCopyRule === null ? null : `donor-rule-${donorCopyRule}`,
                  autonomousCost === null ? null : `autocost-${autonomousCost}`,
                  cooldown === null ? null : `cooldown-${cooldown}`,
                  resourceRegeneration === null ? null : `regen-${resourceRegeneration}`,
                  resourceHarvest === null ? null : `harvest-${resourceHarvest}`,
                  `death-${deathProbability.label}`,
                ].filter((value): value is string => value !== null).join("__");
                const conditionId = `${specification.sweep_id}__${factorSuffix}`;
                candidates.push({
                  execution_index: candidates.length + 1,
                  candidate_id: `${conditionId}__seed-${seed}`,
                  condition_id: conditionId,
                  seed,
                  replicate_id: replicateId,
                  environmental_income: environmentalIncome,
                  exogenous_death_probability: { ...deathProbability },
                  autonomous_reproduction_cost: autonomousCost,
                  reproduction_cooldown_ticks: cooldown,
                  exec_nbr_attempt_cost: execCost,
                  exec_nbr_donor_copy_rule: donorCopyRule,
                  resource_regeneration_per_tick: resourceRegeneration,
                  resource_harvest_per_activation: resourceHarvest,
                });
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  return candidates;
}

function candidateConfiguration(
  base: EngineConfig,
  candidate: CalibrationCandidateIdentity,
  ticksOverride: number | undefined,
): EngineConfig {
  const configuration = structuredClone(base);
  configuration.identity.run_id = candidate.candidate_id;
  configuration.identity.condition_id = candidate.condition_id;
  configuration.identity.replicate_id = candidate.replicate_id;
  configuration.identity.seed = candidate.seed;
  configuration.energy.environmental_income = candidate.environmental_income;
  if (candidate.autonomous_reproduction_cost !== null) {
    configuration.energy.autonomous_reproduction_cost =
      candidate.autonomous_reproduction_cost;
  }
  if (candidate.reproduction_cooldown_ticks !== null) {
    configuration.reproduction.cooldown_ticks = candidate.reproduction_cooldown_ticks;
  }
  if (candidate.exec_nbr_attempt_cost !== null) {
    configuration.energy.exec_nbr_attempt_cost = candidate.exec_nbr_attempt_cost;
  }
  if (candidate.exec_nbr_donor_copy_rule !== null) {
    if (configuration.identity.schema_version !== "0.4.0") {
      configuration.identity.schema_version = "0.3.0";
    }
    configuration.exploitation = {
      donor_copy_rule: candidate.exec_nbr_donor_copy_rule,
    };
  }
  if (candidate.resource_regeneration_per_tick !== null) {
    if (configuration.resources === undefined) {
      throw new Error("Resource sweep candidate requires a resource-enabled base configuration.");
    }
    configuration.resources.regeneration_per_tick =
      candidate.resource_regeneration_per_tick;
  }
  if (candidate.resource_harvest_per_activation !== null) {
    if (configuration.resources === undefined) {
      throw new Error("Resource sweep candidate requires a resource-enabled base configuration.");
    }
    configuration.resources.harvest_per_activation =
      candidate.resource_harvest_per_activation;
  }
  configuration.world.exogenous_death_probability = {
    numerator: candidate.exogenous_death_probability.numerator,
    denominator: candidate.exogenous_death_probability.denominator,
  };
  if (ticksOverride !== undefined) {
    configuration.duration.completed_ticks = ticksOverride;
  }
  return structuredClone(parseEngineConfig(configuration)) as EngineConfig;
}

function measurementCounters(measurement: PopulationMeasurement | undefined): RunCounters {
  return measurement?.cumulative_counters ?? zeroCounters();
}

const mandatoryGateNames = [
  "completed_without_extinction",
  "energy_ledger_exact",
  "energy_source_events_exact",
  "energy_transfer_events_exact",
  "resource_events_exact",
  "runtime",
  "memory",
] as const satisfies readonly (keyof CalibrationGates)[];

const legacyEcologicalGateNames = [
  "late_occupancy_range",
  "late_occupancy_ceiling",
  "both_lineages_final",
  "both_lineages_throughout_late_window",
  "late_autonomous_success",
  "late_exploitative_success",
  "late_hgt_donor_opportunity",
  "late_hgt_success",
  "late_eligibility_screen",
  "computation_energy_present_non_dominant",
  "genome_bound_contact",
  "late_cross_lineage_contact",
] as const satisfies readonly (keyof CalibrationGates)[];

const resourceEcologicalGateNames = [
  "late_occupancy_range",
  "late_occupancy_ceiling",
  "late_autonomous_success",
  "late_exploitative_success",
  "late_hgt_donor_opportunity",
  "late_hgt_success",
  "late_eligibility_screen",
  "computation_energy_present_non_dominant",
  "genome_bound_contact",
  "late_cross_lineage_contact",
  "minimum_interaction_exposure",
  "whole_run_exploitative_exposure",
  "late_resource_stock_range",
  "late_resource_depletion",
] as const satisfies readonly (keyof CalibrationGates)[];

function summariseCandidate(
  identity: CalibrationCandidateIdentity,
  completed: CompletedBenchmark,
  specification: CalibrationSweepSpec,
): CalibrationCandidateSummary {
  const report = completed.report;
  const capacity = report.ecology.occupancy.capacity;
  const lateFraction =
    specification.late_window_fraction.numerator /
    specification.late_window_fraction.denominator;
  const targetStartTick = Math.floor(report.completed_ticks * (1 - lateFraction));
  const baselineSample = [...completed.run.samples]
    .reverse()
    .find((sample) => sample.measurement.tick <= targetStartTick);
  const baselineTick = baselineSample?.measurement.tick ?? 0;
  const lateSamples = completed.run.samples.filter(
    (sample) => sample.measurement.tick > baselineTick,
  );
  const finalMeasurement = completed.run.samples.at(-1)?.measurement;
  const baselineCounters = measurementCounters(baselineSample?.measurement);
  const finalCounters = completed.run.final_counters;
  const lateOccupancies = lateSamples.map(
    (sample) => sample.measurement.state.population_total / capacity,
  );
  const lateEligibility = lateSamples
    .map((sample) => sample.measurement.divergence?.total.eligible_proportion ?? null)
    .filter((value): value is number => value !== null);
  const lateResourceStockProportions = lateSamples
    .map((sample) => sample.measurement.resources?.stock_proportion ?? null)
    .filter((value): value is number => value !== null);
  const lateResourceDepletedProportions = lateSamples
    .map((sample) => {
      const resources = sample.measurement.resources;
      return resources === null
        ? null
        : resources.depleted_cells / (resources.occupied_cells + resources.empty_cells);
    })
    .filter((value): value is number => value !== null);
  const finalPopulation = finalMeasurement?.state.population_total ?? 0;
  const finalHostProportion =
    finalPopulation === 0 ? 0 : (finalMeasurement?.state.host_population ?? 0) / finalPopulation;
  const finalParasiteProportion =
    finalPopulation === 0
      ? 0
      : (finalMeasurement?.state.parasite_population ?? 0) / finalPopulation;
  const bothPresentAtEveryLateSample =
    lateSamples.length > 0 &&
    lateSamples.every(
      (sample) =>
        sample.measurement.state.host_population > 0 &&
        sample.measurement.state.parasite_population > 0,
    );
  const lastSampleWithBothLineages = [...completed.run.samples]
    .reverse()
    .find(
      (sample) =>
        sample.measurement.state.host_population > 0 &&
        sample.measurement.state.parasite_population > 0,
    )?.measurement.tick ?? null;
  const lastSampleWithCrossLineageContact = [...completed.run.samples]
    .reverse()
    .find(
      (sample) =>
        sample.measurement.spatial_structure.host_parasite_contact_edges > 0,
    )?.measurement.tick ?? null;
  const baselineProgress = [...report.progress]
    .reverse()
    .find((progress) => progress.tick <= baselineTick);
  const finalProgress = report.progress.at(-1);
  const lateHgtDonorOpportunities = counterDifference(
    finalProgress?.hgt_donor_opportunities ?? 0,
    baselineProgress?.hgt_donor_opportunities ?? 0,
    "late HGT donor opportunities",
  );
  const lateMeanOccupancy = mean(lateOccupancies);
  const lateMaximumOccupancy =
    lateOccupancies.length === 0 ? null : Math.max(...lateOccupancies);
  const lateMeanEligibility = mean(lateEligibility);
  const lateContactEdges = lateSamples.map(
    (sample) => sample.measurement.spatial_structure.host_parasite_contact_edges,
  );
  const lateSameLineageEdgeProportions = lateSamples
    .map((sample) => sample.measurement.spatial_structure.same_lineage_edge_proportion)
    .filter((value): value is number => value !== null);
  const lateHostLargestPatchProportions = lateSamples
    .map((sample) => sample.measurement.spatial_structure.host.largest_patch_proportion)
    .filter((value): value is number => value !== null);
  const lateParasiteLargestPatchProportions = lateSamples
    .map((sample) => sample.measurement.spatial_structure.parasite.largest_patch_proportion)
    .filter((value): value is number => value !== null);
  const lateMeanContactEdges = mean(lateContactEdges);
  const wholeRunLineageDiagnostics = aggregateLineageDiagnostics(completed.run.samples);
  const lateWindowLineageDiagnostics = aggregateLineageDiagnostics(lateSamples);
  const lateAutonomousSuccesses = counterDifference(
    finalCounters.autonomous_successes,
    baselineCounters.autonomous_successes,
    "late autonomous successes",
  );
  const lateExploitativeSuccesses = counterDifference(
    finalCounters.exploitative_successes,
    baselineCounters.exploitative_successes,
    "late exploitative successes",
  );
  const lateHgtSuccesses = counterDifference(
    finalCounters.hgt_successes,
    baselineCounters.hgt_successes,
    "late HGT successes",
  );
  const computationShare = report.ecology.energy_balance.computation_share_of_created_energy;
  const genomeBoundProportion =
    report.ecology.genome_length.sampled_maximum_any_bound_proportion;
  const projectedMinutes =
    report.scaling_projection.naive_single_run_wall_ms === null
      ? null
      : report.scaling_projection.naive_single_run_wall_ms / 60_000;
  const acceptance = specification.screening_acceptance;
  const lateMeanResourceStock = mean(lateResourceStockProportions);
  const lateMeanResourceDepletion = mean(lateResourceDepletedProportions);
  const resourceDiagnostics = report.ecology.local_resources;
  const gates: CalibrationGates = {
    completed_without_extinction:
      report.terminal_reason === "completed" &&
      report.completed_ticks === report.requested_ticks,
    energy_ledger_exact: report.ecology.energy_balance.ledger_residual === 0,
    energy_source_events_exact: report.ecology.energy_balance.source_event_residual === 0,
    energy_transfer_events_exact:
      report.ecology.energy_balance.transfer_event_residual === 0,
    resource_events_exact:
      !resourceDiagnostics.enabled ||
      (resourceDiagnostics.regeneration_event_residual === 0 &&
        resourceDiagnostics.harvest_transfer_event_residual === 0),
    late_occupancy_range:
      lateMeanOccupancy !== null &&
      lateMeanOccupancy >= acceptance.late_mean_occupancy_min &&
      lateMeanOccupancy <= acceptance.late_mean_occupancy_max,
    late_occupancy_ceiling:
      lateMaximumOccupancy !== null &&
      lateMaximumOccupancy <= acceptance.late_maximum_occupancy,
    both_lineages_final:
      finalHostProportion >= acceptance.minimum_final_lineage_proportion &&
      finalParasiteProportion >= acceptance.minimum_final_lineage_proportion,
    both_lineages_throughout_late_window: bothPresentAtEveryLateSample,
    late_autonomous_success:
      lateAutonomousSuccesses >= acceptance.minimum_late_autonomous_successes,
    late_exploitative_success:
      lateExploitativeSuccesses >= acceptance.minimum_late_exploitative_successes,
    late_hgt_donor_opportunity:
      lateHgtDonorOpportunities >= acceptance.minimum_late_hgt_donor_opportunities,
    late_hgt_success: lateHgtSuccesses >= acceptance.minimum_late_hgt_successes,
    late_eligibility_screen:
      lateMeanEligibility !== null &&
      lateMeanEligibility >= acceptance.minimum_late_eligibility_proportion,
    computation_energy_present_non_dominant:
      computationShare !== null &&
      computationShare >= acceptance.computation_created_energy_share_min &&
      computationShare <= acceptance.computation_created_energy_share_max,
    genome_bound_contact:
      genomeBoundProportion !== null &&
      genomeBoundProportion <= acceptance.maximum_sampled_genome_bound_proportion,
    late_cross_lineage_contact:
      acceptance.minimum_late_mean_host_parasite_contact_edges === undefined ||
      (lateMeanContactEdges !== null &&
        lateMeanContactEdges >=
          acceptance.minimum_late_mean_host_parasite_contact_edges),
    minimum_interaction_exposure:
      acceptance.minimum_both_lineages_observed_through_tick === undefined ||
      (lastSampleWithBothLineages !== null &&
        lastSampleWithCrossLineageContact !== null &&
        lastSampleWithBothLineages >=
          acceptance.minimum_both_lineages_observed_through_tick &&
        lastSampleWithCrossLineageContact >=
          acceptance.minimum_both_lineages_observed_through_tick),
    whole_run_exploitative_exposure:
      acceptance.minimum_whole_run_exploitative_successes === undefined ||
      finalCounters.exploitative_successes >=
        acceptance.minimum_whole_run_exploitative_successes,
    late_resource_stock_range:
      acceptance.late_mean_resource_stock_proportion_min === undefined ||
      acceptance.late_mean_resource_stock_proportion_max === undefined ||
      (lateMeanResourceStock !== null &&
        lateMeanResourceStock >=
          acceptance.late_mean_resource_stock_proportion_min &&
        lateMeanResourceStock <=
          acceptance.late_mean_resource_stock_proportion_max),
    late_resource_depletion:
      acceptance.maximum_late_mean_depleted_cell_proportion === undefined ||
      (lateMeanResourceDepletion !== null &&
        lateMeanResourceDepletion <=
          acceptance.maximum_late_mean_depleted_cell_proportion),
    runtime:
      projectedMinutes !== null &&
      projectedMinutes <= acceptance.maximum_projected_single_run_minutes,
    memory: report.performance.peak_rss_bytes <= acceptance.maximum_peak_rss_bytes,
  };
  const ecologicalGateNames =
    specification.stage === "resource_screen"
      ? resourceEcologicalGateNames
      : legacyEcologicalGateNames;
  const mandatoryGateFailures = mandatoryGateNames.filter((name) => !gates[name]).length;
  const ecologicalGatePasses = ecologicalGateNames.filter((name) => gates[name]).length;

  return {
    ...identity,
    rank: 0,
    requested_ticks: report.requested_ticks,
    completed_ticks: report.completed_ticks,
    terminal_reason: report.terminal_reason,
    configuration_id: report.configuration_id,
    final_state_hash: report.final_state_hash,
    late_window: {
      target_start_tick: targetStartTick,
      baseline_tick: baselineTick,
      first_observed_tick: lateSamples[0]?.measurement.tick ?? null,
      observed_sample_count: lateSamples.length,
    },
    occupancy: {
      late_mean_proportion: lateMeanOccupancy,
      late_maximum_proportion: lateMaximumOccupancy,
    },
    lineage_survival: {
      final_host_proportion: finalHostProportion,
      final_parasite_proportion: finalParasiteProportion,
      minimum_final_lineage_proportion: Math.min(
        finalHostProportion,
        finalParasiteProportion,
      ),
      both_present_at_every_late_sample: bothPresentAtEveryLateSample,
    },
    interaction_exposure: {
      last_sample_tick_with_both_lineages: lastSampleWithBothLineages,
      last_sample_tick_with_cross_lineage_contact:
        lastSampleWithCrossLineageContact,
      whole_run_exploitative_successes: finalCounters.exploitative_successes,
    },
    late_mechanism_opportunity: {
      autonomous_successes: lateAutonomousSuccesses,
      exploitative_successes: lateExploitativeSuccesses,
      hgt_donor_opportunities: lateHgtDonorOpportunities,
      hgt_successes: lateHgtSuccesses,
    },
    measurement_eligibility: {
      late_mean_eligible_proportion: lateMeanEligibility,
    },
    computation: {
      energy_credited: report.ecology.energy_balance.computation_energy_credited,
      share_of_created_energy: computationShare,
    },
    genome_length: {
      sampled_maximum_any_bound_proportion: genomeBoundProportion,
    },
    spatial_structure: {
      late_mean_host_parasite_contact_edges: lateMeanContactEdges,
      late_minimum_host_parasite_contact_edges:
        lateContactEdges.length === 0 ? null : Math.min(...lateContactEdges),
      late_mean_same_lineage_edge_proportion: mean(lateSameLineageEdgeProportions),
      late_mean_host_largest_patch_proportion: mean(lateHostLargestPatchProportions),
      late_mean_parasite_largest_patch_proportion:
        mean(lateParasiteLargestPatchProportions),
    },
    lineage_diagnostics: {
      whole_run: wholeRunLineageDiagnostics,
      late_window: lateWindowLineageDiagnostics,
    },
    energy_balance: {
      ledger_residual: report.ecology.energy_balance.ledger_residual,
      source_event_residual: report.ecology.energy_balance.source_event_residual,
    },
    local_resources: {
      late_mean_stock_proportion: lateMeanResourceStock,
      late_minimum_stock_proportion:
        lateResourceStockProportions.length === 0
          ? null
          : Math.min(...lateResourceStockProportions),
      late_maximum_stock_proportion:
        lateResourceStockProportions.length === 0
          ? null
          : Math.max(...lateResourceStockProportions),
      late_mean_depleted_cell_proportion: lateMeanResourceDepletion,
      cumulative_regenerated: resourceDiagnostics.cumulative_regenerated,
      cumulative_harvested: resourceDiagnostics.cumulative_harvested,
      cumulative_harvest_shortfall:
        resourceDiagnostics.cumulative_harvest_shortfall,
    },
    resources: {
      ticks_per_second: report.performance.ticks_per_second,
      activations_per_second: report.performance.activations_per_second,
      projected_single_run_minutes: projectedMinutes,
      peak_rss_bytes: report.performance.peak_rss_bytes,
    },
    gates,
    mandatory_gate_failures: mandatoryGateFailures,
    ecological_gate_passes: ecologicalGatePasses,
    screening_passed:
      mandatoryGateNames.every((name) => gates[name]) &&
      ecologicalGateNames.every((name) => gates[name]),
  };
}

function nullableAscending(left: number | null, right: number | null): number {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  return left - right;
}

function nullableDescending(left: number | null, right: number | null): number {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  return right - left;
}

function rankCandidates(
  candidates: readonly CalibrationCandidateSummary[],
  specification: CalibrationSweepSpec,
): CalibrationCandidateSummary[] {
  return [...candidates]
    .sort((left, right) => {
      const commonComparisons = [
        left.mandatory_gate_failures - right.mandatory_gate_failures,
        right.ecological_gate_passes - left.ecological_gate_passes,
        nullableAscending(
          left.occupancy.late_mean_proportion === null
            ? null
            : Math.abs(left.occupancy.late_mean_proportion - 0.5),
          right.occupancy.late_mean_proportion === null
            ? null
            : Math.abs(right.occupancy.late_mean_proportion - 0.5),
        ),
      ];
      const resourceComparisons = [
        nullableAscending(
          left.local_resources.late_mean_stock_proportion === null
            ? null
            : Math.abs(left.local_resources.late_mean_stock_proportion - 0.5),
          right.local_resources.late_mean_stock_proportion === null
            ? null
            : Math.abs(right.local_resources.late_mean_stock_proportion - 0.5),
        ),
        Math.min(
          right.interaction_exposure.last_sample_tick_with_both_lineages ?? -1,
          right.interaction_exposure.last_sample_tick_with_cross_lineage_contact ?? -1,
        ) -
          Math.min(
            left.interaction_exposure.last_sample_tick_with_both_lineages ?? -1,
            left.interaction_exposure.last_sample_tick_with_cross_lineage_contact ?? -1,
          ),
        nullableDescending(
          left.measurement_eligibility.late_mean_eligible_proportion,
          right.measurement_eligibility.late_mean_eligible_proportion,
        ),
        nullableAscending(
          left.resources.projected_single_run_minutes,
          right.resources.projected_single_run_minutes,
        ),
      ];
      const legacyComparisons = [
        right.lineage_survival.minimum_final_lineage_proportion -
          left.lineage_survival.minimum_final_lineage_proportion,
        nullableDescending(
          left.measurement_eligibility.late_mean_eligible_proportion,
          right.measurement_eligibility.late_mean_eligible_proportion,
        ),
        nullableAscending(
          left.resources.projected_single_run_minutes,
          right.resources.projected_single_run_minutes,
        ),
      ];
      const comparisons = [
        ...commonComparisons,
        ...(specification.stage === "resource_screen"
          ? resourceComparisons
          : legacyComparisons),
      ];
      return comparisons.find((value) => value !== 0) ??
        left.candidate_id.localeCompare(right.candidate_id);
    })
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}

function positiveOverride(value: number | undefined, label: string): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || value <= 0)) {
    throw new RangeError(`${label} must be a positive safe integer.`);
  }
}

export function evaluateConfirmationAssessment(
  requirements: CalibrationSweepSpec["confirmation_requirements"],
  candidates: readonly ConfirmationCandidateObservation[],
  sampleEveryTicks: number,
  developmentOverride: boolean,
): ConfirmationAssessment {
  if (!Number.isSafeInteger(sampleEveryTicks) || sampleEveryTicks <= 0) {
    throw new RangeError("Confirmation sampling interval must be a positive safe integer.");
  }

  const minimumCompletedTicks =
    candidates.length === 0
      ? null
      : Math.min(...candidates.map((candidate) => candidate.completed_ticks));
  const eligibilities = candidates.map(
    (candidate) => candidate.late_eligibility_proportion,
  );
  const completeEligibilities = eligibilities.filter(
    (value): value is number => value !== null,
  );
  const minimumEligibility =
    completeEligibilities.length === 0 ? null : Math.min(...completeEligibilities);
  const maximumEligibility =
    completeEligibilities.length === 0 ? null : Math.max(...completeEligibilities);
  const requiredWindowTicks = 5000 as const;
  const windowAlignsWithSampling = requiredWindowTicks % sampleEveryTicks === 0;
  const everyCandidateHasFullWindow =
    candidates.length > 0 &&
    windowAlignsWithSampling &&
    candidates.every((candidate) => candidate.completed_ticks >= requiredWindowTicks);

  const evaluated: ConfirmationRequirementEvaluation = {
    minimum_ticks: {
      declared: requirements.minimum_ticks,
      observed: { minimum_completed_ticks: minimumCompletedTicks },
      passed:
        candidates.length > 0 &&
        candidates.every(
          (candidate) => candidate.completed_ticks >= requirements.minimum_ticks,
        ),
    },
    minimum_independent_seeds: {
      declared: requirements.minimum_independent_seeds,
      observed: { distinct_seed_count: new Set(candidates.map((candidate) => candidate.seed)).size },
      passed:
        new Set(candidates.map((candidate) => candidate.seed)).size >=
        requirements.minimum_independent_seeds,
    },
    minimum_late_eligibility_proportion: {
      declared: requirements.minimum_late_eligibility_proportion,
      observed: {
        minimum_late_eligibility_proportion: minimumEligibility,
        maximum_late_eligibility_proportion: maximumEligibility,
      },
      passed:
        candidates.length > 0 &&
        completeEligibilities.length === candidates.length &&
        completeEligibilities.every(
          (value) => value >= requirements.minimum_late_eligibility_proportion,
        ),
    },
    requires_full_5000_tick_behaviour_window: {
      declared: requirements.requires_full_5000_tick_behaviour_window,
      observed: {
        required_window_ticks: requiredWindowTicks,
        sample_every_ticks: sampleEveryTicks,
        required_sample_count: windowAlignsWithSampling
          ? requiredWindowTicks / sampleEveryTicks
          : null,
        minimum_completed_ticks: minimumCompletedTicks,
        every_candidate_has_full_window: everyCandidateHasFullWindow,
      },
      passed:
        !requirements.requires_full_5000_tick_behaviour_window ||
        everyCandidateHasFullWindow,
    },
  };
  const allRequirementsPassed = Object.values(evaluated).every(
    (requirement) => requirement.passed,
  );
  const allCandidatesScreeningPassed =
    candidates.length > 0 && candidates.every((candidate) => candidate.screening_passed);
  const developmentOverrideAbsent = !developmentOverride;

  return {
    requirements: evaluated,
    all_candidates_screening_passed: allCandidatesScreeningPassed,
    development_override_absent: developmentOverrideAbsent,
    confirmation_evidence:
      allRequirementsPassed &&
      allCandidatesScreeningPassed &&
      developmentOverrideAbsent,
  };
}

export function calibrationEvidenceInterpretation(
  stage: CalibrationSweepSpec["stage"],
  confirmationEvidence: boolean,
  executedCandidateCount: number,
): string {
  if (confirmationEvidence) {
    return "All declared confirmation requirements and all candidate screening gates passed without a development override; this bundle may support qualification, but it is not formal hypothesis-test evidence.";
  }
  if (stage === "mechanism_control") {
    return "This is a calibration mechanism control, not candidate-selection, confirmation, or hypothesis-test evidence.";
  }
  if (stage === "resource_screen") {
    const cardinality = executedCandidateCount === 1 ? "one-seed " : "";
    return `This is a ${cardinality}resource calibration screen; confirmation_evidence is false, so it cannot qualify confirmation or formal evidence.`;
  }
  return "This is a coarse calibration screen, not confirmation or hypothesis-test evidence.";
}

export async function executeCalibrationSweep(
  loaded: LoadedCalibrationSweep,
  options: CalibrationSweepExecutionOptions = {},
): Promise<CalibrationSweepReport> {
  positiveOverride(options.ticks_override, "Calibration tick override");
  positiveOverride(options.candidate_limit, "Calibration candidate limit");
  const generated = candidateIdentities(loaded.specification);
  const selected = generated.slice(0, options.candidate_limit ?? generated.length);
  const startedAt = new Date().toISOString();
  const summaries: CalibrationCandidateSummary[] = [];

  for (const candidate of selected) {
    options.onCandidateStarted?.(candidate);
    const configuration = candidateConfiguration(
      loaded.base_configuration,
      candidate,
      options.ticks_override,
    );
    const completed = executeBenchmark({
      benchmark_id: candidate.candidate_id,
      configuration,
      fixture: loaded.fixture,
      report_every_ticks: loaded.specification.report_every_ticks,
      ...(options.projection_target_ticks === undefined
        ? {}
        : { projection_target_ticks: options.projection_target_ticks }),
      ...(options.projection_run_count === undefined
        ? {}
        : { projection_run_count: options.projection_run_count }),
      ...(options.onCandidateProgress === undefined
        ? {}
        : {
            onProgress: (progress: BenchmarkProgress): void => {
              options.onCandidateProgress?.(candidate, progress);
            },
          }),
    });
    const summary = summariseCandidate(candidate, completed, loaded.specification);
    summaries.push(summary);
    await options.onCandidateCompleted?.(completed, summary);
  }

  const ranked = rankCandidates(summaries, loaded.specification);
  const passes = ranked.filter((candidate) => candidate.screening_passed);
  const developmentOverride =
    options.ticks_override !== undefined || options.candidate_limit !== undefined;
  const confirmation = evaluateConfirmationAssessment(
    loaded.specification.confirmation_requirements,
    ranked.map((candidate) => ({
      seed: candidate.seed,
      completed_ticks: candidate.completed_ticks,
      late_eligibility_proportion:
        candidate.measurement_eligibility.late_mean_eligible_proportion,
      screening_passed: candidate.screening_passed,
    })),
    loaded.base_configuration.duration.sample_every_ticks,
    developmentOverride,
  );
  return {
    report_schema_version: "0.6.0",
    sweep_id: loaded.specification.sweep_id,
    stage: loaded.specification.stage,
    development_override: {
      ticks: options.ticks_override ?? null,
      candidate_limit: options.candidate_limit ?? null,
      confirmation_evidence: confirmation.confirmation_evidence,
    },
    confirmation_requirements: confirmation.requirements,
    sweep_specification_sha256: loaded.sweep_specification_sha256,
    base_configuration_sha256: loaded.base_configuration_sha256,
    fixture_sha256: loaded.fixture_sha256,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    generated_candidate_count: generated.length,
    executed_candidate_count: ranked.length,
    screening_pass_count: passes.length,
    confirmation_candidate_ids:
      developmentOverride ||
      loaded.specification.stage === "mechanism_control" ||
      loaded.specification.stage === "resource_screen"
        ? []
        : passes.map((candidate) => candidate.candidate_id),
    ranking_order: loaded.specification.ranking_order,
    prohibited_selection_inputs: loaded.specification.prohibited_selection_inputs,
    candidates: ranked,
    interpretation_notes: [
      calibrationEvidenceInterpretation(
        loaded.specification.stage,
        confirmation.confirmation_evidence,
        ranked.length,
      ),
      "Candidate ordering is lexicographic and was frozen before outcomes were inspected.",
      "Divergence magnitude and onset are deliberately absent from candidate selection; only measurement eligibility is screened.",
      "A tick or candidate-limit override marks the entire bundle as development-only evidence.",
      "Confirmation evidence requires every declared confirmation requirement and every candidate screening gate to pass, with no development override.",
      "Runtime projection is linear and memory is the process-wide high-water mark, so both are planning diagnostics.",
      "Spatial patch summaries describe connected lineage structure and contact; they are not evidence of cooperation or group cognition.",
      "Lineage-stratified operation outcomes and death causes are observational attribution; they do not change engine state or candidate ranking.",
      "Resource-screen ranking excludes final lineage abundance; lineage loss remains an outcome while minimum interaction exposure is screened.",
      ...(loaded.specification.stage === "mechanism_control"
        ? ["Mechanism-control conditions are never promoted automatically to confirmation candidates."]
        : []),
    ],
  };
}
