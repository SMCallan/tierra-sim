import type {
  DeathCause,
  EcologicalOperation,
  EcologicalResultCode,
  EngineCheckpoint,
  EngineEvent,
  Lineage,
  PopulationMeasurement,
  PrngState,
  RunCounters,
  StateHashVersion,
  TerminalReason,
  LocalResourceCounters,
} from "@tierra-sim/engine";

export interface MechanismCounters {
  autonomous_attempts: number;
  autonomous_successes: number;
  exploitative_attempts: number;
  exploitative_successes: number;
  hgt_attempts: number;
  hgt_successes: number;
  mutation_point_accepted: number;
  mutation_insertion_accepted: number;
  mutation_deletion_accepted: number;
  computation_rewards: number;
  births: number;
  deaths: number;
}

export type LineageMechanismCounters = Record<Lineage, MechanismCounters>;

export type OperationResultCounters = Record<EcologicalResultCode, number>;

export type LineageOperationResultCounters = Record<
  Lineage,
  Record<EcologicalOperation, OperationResultCounters>
>;

export type LineageDeathCauseCounters = Record<
  Lineage,
  Record<DeathCause, number>
>;

export interface LineageDiagnostics {
  readonly operation_results: LineageOperationResultCounters;
  readonly death_causes: LineageDeathCauseCounters;
}

export interface LineageDiagnosticIdentityResiduals {
  readonly lineage_operation_attempts: Record<Lineage, Record<EcologicalOperation, number>>;
  readonly lineage_operation_successes: Record<Lineage, Record<EcologicalOperation, number>>;
  readonly lineage_deaths: Record<Lineage, number>;
  readonly global_operation_attempts: Record<EcologicalOperation, number>;
  readonly global_operation_successes: Record<EcologicalOperation, number>;
  readonly global_death_causes: Record<DeathCause, number>;
}

export type RetainedEngineEvent = EngineEvent & {
  readonly run_id: string;
  readonly lineage: Lineage | null;
};

export interface RecordedSample {
  readonly measurement: PopulationMeasurement;
  readonly previous_counters: RunCounters;
  readonly previous_resource_counters: LocalResourceCounters | null;
  readonly lineage_interval: LineageMechanismCounters;
  readonly lineage_operation_results: LineageOperationResultCounters;
  readonly lineage_death_causes: LineageDeathCauseCounters;
}

export interface RetainedCheckpoint {
  readonly tick: number;
  readonly checkpoint: EngineCheckpoint;
}

export interface CompletedRun {
  readonly configuration: unknown;
  readonly fixture: unknown;
  readonly configuration_id: string;
  readonly fixture_sha256: string;
  readonly samples: readonly RecordedSample[];
  readonly checkpoints: readonly RetainedCheckpoint[];
  readonly events: readonly RetainedEngineEvent[];
  readonly lineage_records: readonly {
    readonly organism_id: number;
    readonly parent_id: number | null;
    readonly lineage: Lineage;
    readonly generation: number;
    readonly birth_tick: number;
    readonly death_tick: number | null;
    readonly death_cause: string | null;
  }[];
  readonly final_counters: RunCounters;
  readonly final_state_hash: string;
  readonly state_hash_algorithm: StateHashVersion;
  readonly final_prng_state: PrngState;
  readonly completed_ticks: number;
  readonly terminal_reason: TerminalReason;
  readonly started_at: string;
  readonly finished_at: string;
}
