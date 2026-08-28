import type { ComputationOperation } from "../vm/machine.js";
import type { Coordinate } from "../world/coordinates.js";

export const EcologicalResultCode = {
  Success: "success",
  NoNeighbour: "no_neighbour",
  NoEmptyCell: "no_empty_cell",
  Cooldown: "cooldown",
  InsufficientCallerEnergy: "insufficient_caller_energy",
  InsufficientDonorEnergy: "insufficient_donor_energy",
  DonorLocusNotCopy: "donor_locus_not_copy",
  DonorCopyAbsent: "donor_copy_absent",
  HgtTrialFailed: "hgt_trial_failed",
  GenomeCapacity: "genome_capacity",
  GenomeMinimum: "genome_minimum",
  ConfigurationInvariant: "configuration_invariant",
} as const;

export type EcologicalResultCode =
  (typeof EcologicalResultCode)[keyof typeof EcologicalResultCode];

export const EcologicalOperation = {
  Copy: "copy",
  ExecNbr: "exec_nbr",
  Splice: "splice",
} as const;

export type EcologicalOperation =
  (typeof EcologicalOperation)[keyof typeof EcologicalOperation];

export const DeathCause = {
  Exogenous: "exogenous",
  Energy: "energy",
  Exploitation: "exploitation",
} as const;

export type DeathCause = (typeof DeathCause)[keyof typeof DeathCause];

export const MutationClass = {
  Point: "point",
  Insertion: "insertion",
  Deletion: "deletion",
} as const;

export type MutationClass = (typeof MutationClass)[keyof typeof MutationClass];

export const EnergyEventKind = {
  EnvironmentalIncome: "environmental_income",
  ResourceHarvest: "resource_harvest",
  ComputationReward: "computation_reward",
  BaseExecutionCost: "base_execution_cost",
  GenomeMaintenanceCost: "genome_maintenance_cost",
  AutonomousReproductionCost: "autonomous_reproduction_cost",
  ExecNbrAttemptCost: "exec_nbr_attempt_cost",
  ExploitLevy: "exploit_levy",
  SpliceAttemptCost: "splice_attempt_cost",
  SpliceSuccessCost: "splice_success_cost",
  OffspringEndowmentTransfer: "offspring_endowment_transfer",
  DeathDiscard: "death_discard",
} as const;

export type EnergyEventKind = (typeof EnergyEventKind)[keyof typeof EnergyEventKind];

interface TickEventBase {
  readonly tick: number;
}

export interface ActivationEvent extends TickEventBase {
  readonly type: "activation";
  readonly organism_id: number;
  readonly executed_opcode: number;
}

export interface EnergyEvent extends TickEventBase {
  readonly type: "energy";
  readonly kind: EnergyEventKind;
  readonly organism_id: number;
  readonly amount: number;
  readonly counterparty_id?: number;
}

export interface ResourceRegenerationEvent extends TickEventBase {
  readonly type: "resource_regeneration";
  readonly amount: number;
  readonly replenished_cells: number;
  readonly total_stock_after: number;
}

export interface EcologicalAttemptEvent extends TickEventBase {
  readonly type: "ecological_attempt";
  readonly operation: EcologicalOperation;
  readonly organism_id: number;
  readonly result: EcologicalResultCode;
  readonly donor_id?: number;
  readonly child_id?: number;
}

export interface BirthEvent extends TickEventBase {
  readonly type: "birth";
  readonly pathway: "autonomous" | "exploitative";
  readonly caller_id: number;
  readonly donor_id?: number;
  readonly child_id: number;
  readonly destination: Coordinate;
  readonly offspring_endowment: number;
}

export interface MutationEvent extends TickEventBase {
  readonly type: "mutation";
  readonly parent_id: number;
  readonly child_id: number;
  readonly mutation_class: MutationClass;
  readonly original_locus: number;
  readonly accepted: boolean;
  readonly result: EcologicalResultCode;
  readonly previous_opcode?: number;
  readonly new_opcode?: number;
}

export interface HgtTransferEvent extends TickEventBase {
  readonly type: "hgt_transfer";
  readonly organism_id: number;
  readonly donor_id: number;
  readonly donor_start_locus: number;
  readonly insertion_boundary: number;
  readonly chunk: readonly number[];
}

export interface ComputationRewardEvent extends TickEventBase {
  readonly type: "computation_reward";
  readonly organism_id: number;
  readonly operation: ComputationOperation;
  readonly requested_energy: number;
  readonly credited_energy: number;
}

export interface DeathEvent extends TickEventBase {
  readonly type: "death";
  readonly organism_id: number;
  readonly cause: DeathCause;
  readonly energy_discarded: number;
}

export type EngineEvent =
  | ActivationEvent
  | EnergyEvent
  | ResourceRegenerationEvent
  | EcologicalAttemptEvent
  | BirthEvent
  | MutationEvent
  | HgtTransferEvent
  | ComputationRewardEvent
  | DeathEvent;

export interface MutationClassCounters {
  point: number;
  insertion: number;
  deletion: number;
}

export interface RunCounters {
  initial_energy: number;
  activations: number;
  autonomous_attempts: number;
  autonomous_successes: number;
  exploitative_attempts: number;
  exploitative_successes: number;
  hgt_attempts: number;
  hgt_successes: number;
  computation_rewards: number;
  births: number;
  deaths_exogenous: number;
  deaths_energy: number;
  deaths_exploitation: number;
  mutation_attempted: MutationClassCounters;
  mutation_accepted: MutationClassCounters;
  mutation_rejected: MutationClassCounters;
  energy_created: number;
  energy_transferred: number;
  energy_dissipated: number;
  energy_discarded: number;
}

export function createRunCounters(): RunCounters {
  const mutationCounters = (): MutationClassCounters => ({ point: 0, insertion: 0, deletion: 0 });
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
    mutation_attempted: mutationCounters(),
    mutation_accepted: mutationCounters(),
    mutation_rejected: mutationCounters(),
    energy_created: 0,
    energy_transferred: 0,
    energy_dissipated: 0,
    energy_discarded: 0,
  };
}
