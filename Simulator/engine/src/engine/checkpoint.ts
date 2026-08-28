import { z } from "zod";

import { canonicalJson } from "../config/canonical-json.js";
import type { ImmutableEngineConfig } from "../config/schema.js";
import {
  DeathCause,
  EcologicalResultCode,
  type RunCounters,
} from "../domain/events.js";
import { Lineage, type OrganismState } from "../domain/organism.js";
import { sha256, type Sha256Function } from "../hash/sha256.js";
import type { LineageRecord } from "../measurement/lineage.js";
import type { PrngState } from "../random/prng.js";
import { ComputationOperation } from "../vm/machine.js";
import type { LocalResourceStateSnapshot } from "../world/resource-field.js";
import type { TerminalReason } from "./types.js";

export const LEGACY_CHECKPOINT_FORMAT_VERSION = "0.2.0" as const;
export const CHECKPOINT_FORMAT_VERSION = "0.3.0" as const;
export const LEGACY_ENGINE_STATE_VERSION = "0.2.0" as const;
export const ENGINE_STATE_VERSION = "0.3.0" as const;
export const LEGACY_STATE_HASH_VERSION = "sha256/canonical-scientific-state-v2" as const;
export const PEDIGREE_DIGEST_STATE_HASH_VERSION =
  "sha256/canonical-scientific-state-v4" as const;
export const STATE_HASH_VERSION = "sha256/canonical-scientific-state-v3" as const;

export type CheckpointFormatVersion =
  | typeof LEGACY_CHECKPOINT_FORMAT_VERSION
  | typeof CHECKPOINT_FORMAT_VERSION;
export type EngineStateVersion =
  | typeof LEGACY_ENGINE_STATE_VERSION
  | typeof ENGINE_STATE_VERSION;
export type StateHashVersion =
  | typeof LEGACY_STATE_HASH_VERSION
  | typeof STATE_HASH_VERSION
  | typeof PEDIGREE_DIGEST_STATE_HASH_VERSION;

const nonNegativeInteger = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const nullableNonNegativeInteger = nonNegativeInteger.nullable();
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const lineageSchema = z.enum([Lineage.Host, Lineage.Parasite]);
const deathCauseSchema = z.enum([
  DeathCause.Exogenous,
  DeathCause.Energy,
  DeathCause.Exploitation,
]);
const resultCodeSchema = z.enum([
  EcologicalResultCode.Success,
  EcologicalResultCode.NoNeighbour,
  EcologicalResultCode.NoEmptyCell,
  EcologicalResultCode.Cooldown,
  EcologicalResultCode.InsufficientCallerEnergy,
  EcologicalResultCode.InsufficientDonorEnergy,
  EcologicalResultCode.DonorLocusNotCopy,
  EcologicalResultCode.DonorCopyAbsent,
  EcologicalResultCode.HgtTrialFailed,
  EcologicalResultCode.GenomeCapacity,
  EcologicalResultCode.GenomeMinimum,
  EcologicalResultCode.ConfigurationInvariant,
]);
const mutationCountersSchema = z.strictObject({
  point: nonNegativeInteger,
  insertion: nonNegativeInteger,
  deletion: nonNegativeInteger,
});
const runCountersSchema = z.strictObject({
  initial_energy: nonNegativeInteger,
  activations: nonNegativeInteger,
  autonomous_attempts: nonNegativeInteger,
  autonomous_successes: nonNegativeInteger,
  exploitative_attempts: nonNegativeInteger,
  exploitative_successes: nonNegativeInteger,
  hgt_attempts: nonNegativeInteger,
  hgt_successes: nonNegativeInteger,
  computation_rewards: nonNegativeInteger,
  births: nonNegativeInteger,
  deaths_exogenous: nonNegativeInteger,
  deaths_energy: nonNegativeInteger,
  deaths_exploitation: nonNegativeInteger,
  mutation_attempted: mutationCountersSchema,
  mutation_accepted: mutationCountersSchema,
  mutation_rejected: mutationCountersSchema,
  energy_created: nonNegativeInteger,
  energy_transferred: nonNegativeInteger,
  energy_dissipated: nonNegativeInteger,
  energy_discarded: nonNegativeInteger,
});
const coordinateSchema = z.strictObject({ x: nonNegativeInteger, y: nonNegativeInteger });
const provenanceSchema = z.strictObject({
  kind: z.enum(["task_input_a", "task_input_b", "computed"]),
  task_id: nonNegativeInteger,
});
const taskSchema = z.strictObject({
  id: nonNegativeInteger,
  input_a: z.number().int().min(0).max(0xff),
  input_b: z.number().int().min(0).max(0xff),
});
const lastComputationSchema = z.strictObject({
  operation: z.enum([
    ComputationOperation.And,
    ComputationOperation.Xor,
    ComputationOperation.Equ,
    ComputationOperation.Add,
  ]),
  task_id: nonNegativeInteger,
  result: z.number().int().min(0).max(0xff),
  used_current_task_inputs: z.boolean(),
});
const vmSchema = z.strictObject({
  instruction_pointer: nonNegativeInteger,
  register_a: z.number().int().min(0).max(0xff),
  register_b: z.number().int().min(0).max(0xff),
  comparison_flag: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
  provenance_a: provenanceSchema.nullable(),
  provenance_b: provenanceSchema.nullable(),
  last_computation: lastComputationSchema.nullable(),
  rewarded_task_mask: nonNegativeInteger,
  task: taskSchema,
});
const behaviourBucketSchema = z.strictObject({
  bucket_number: nullableNonNegativeInteger,
  autonomous_attempts: nonNegativeInteger,
  autonomous_successes: nonNegativeInteger,
  exploitative_attempts: nonNegativeInteger,
  exploitative_successes: nonNegativeInteger,
  hgt_attempts: nonNegativeInteger,
  hgt_successes: nonNegativeInteger,
  rewarded_and: nonNegativeInteger,
  rewarded_xor: nonNegativeInteger,
  rewarded_equ: nonNegativeInteger,
  rewarded_add: nonNegativeInteger,
  energy_created: nonNegativeInteger,
  energy_transferred: nonNegativeInteger,
  energy_dissipated: nonNegativeInteger,
  energy_discarded: nonNegativeInteger,
  exploit_energy_obtained: nonNegativeInteger,
  exploit_energy_lost: nonNegativeInteger,
  mutation_point_accepted: nonNegativeInteger,
  mutation_point_rejected: nonNegativeInteger,
  mutation_insertion_accepted: nonNegativeInteger,
  mutation_insertion_rejected: nonNegativeInteger,
  mutation_deletion_accepted: nonNegativeInteger,
  mutation_deletion_rejected: nonNegativeInteger,
  result_counts: z.record(resultCodeSchema, nonNegativeInteger),
});
const organismSchema = z.strictObject({
  id: nonNegativeInteger,
  parent_id: nullableNonNegativeInteger,
  lineage: lineageSchema,
  generation: nonNegativeInteger,
  coordinate: coordinateSchema,
  genome: z.array(z.number().int().min(0).max(0xf)).min(1),
  vm: vmSchema,
  energy: nonNegativeInteger,
  age_ticks: nonNegativeInteger,
  reproduction_cooldown: nonNegativeInteger,
  behaviour_buckets: z.array(behaviourBucketSchema),
});
const lineageRecordSchema = z.strictObject({
  organism_id: nonNegativeInteger,
  parent_id: nullableNonNegativeInteger,
  lineage: lineageSchema,
  generation: nonNegativeInteger,
  birth_tick: nonNegativeInteger,
  death_tick: nullableNonNegativeInteger,
  death_cause: deathCauseSchema.nullable(),
});
const localResourceCountersSchema = z.strictObject({
  initial_total: nonNegativeInteger,
  regenerated_total: nonNegativeInteger,
  harvested_total: nonNegativeInteger,
  harvest_requested_total: nonNegativeInteger,
  harvest_opportunities: nonNegativeInteger,
  zero_harvests: nonNegativeInteger,
  partial_harvests: nonNegativeInteger,
});
const localResourceStateSchema = z.strictObject({
  cell_capacity: nonNegativeInteger,
  stocks: z.array(nonNegativeInteger),
  counters: localResourceCountersSchema,
});
const scientificStateSchema = z.strictObject({
  completed_tick: nonNegativeInteger,
  terminal_reason: z.enum(["completed", "extinction"]).nullable(),
  next_organism_id: nonNegativeInteger,
  next_task_id: nonNegativeInteger,
  prng_state: z.tuple([
    z.number().int().min(0).max(0xffff_ffff),
    z.number().int().min(0).max(0xffff_ffff),
    z.number().int().min(0).max(0xffff_ffff),
    z.number().int().min(0).max(0xffff_ffff),
  ]),
  world_occupancy: z.array(nullableNonNegativeInteger),
  organisms: z.array(organismSchema),
  counters: runCountersSchema,
  lineage_records: z.array(lineageRecordSchema),
  local_resources: localResourceStateSchema.optional(),
});

export interface ScientificStateSnapshot {
  readonly completed_tick: number;
  readonly terminal_reason: TerminalReason | null;
  readonly next_organism_id: number;
  readonly next_task_id: number;
  readonly prng_state: PrngState;
  readonly world_occupancy: readonly (number | null)[];
  readonly organisms: readonly OrganismState[];
  readonly counters: RunCounters;
  readonly lineage_records: readonly LineageRecord[];
  readonly local_resources?: LocalResourceStateSnapshot;
}

export interface EngineCheckpoint {
  readonly checkpoint_format: CheckpointFormatVersion;
  readonly engine_state_version: EngineStateVersion;
  readonly configuration_id: string;
  readonly state_hash_algorithm: StateHashVersion;
  readonly state_hash: string;
  readonly state: ScientificStateSnapshot;
  readonly payload_sha256: string;
}

const checkpointPayloadSchema = z.strictObject({
  checkpoint_format: z.enum([LEGACY_CHECKPOINT_FORMAT_VERSION, CHECKPOINT_FORMAT_VERSION]),
  engine_state_version: z.enum([LEGACY_ENGINE_STATE_VERSION, ENGINE_STATE_VERSION]),
  configuration_id: sha256Schema,
  state_hash_algorithm: z.enum([
    LEGACY_STATE_HASH_VERSION,
    STATE_HASH_VERSION,
    PEDIGREE_DIGEST_STATE_HASH_VERSION,
  ]),
  state_hash: sha256Schema,
  state: scientificStateSchema,
});
const checkpointSchema = checkpointPayloadSchema.extend({ payload_sha256: sha256Schema });

export function configurationDigest(
  configuration: ImmutableEngineConfig,
  digest: Sha256Function = sha256,
): string {
  return digest(canonicalJson(configuration));
}

/**
 * Decision 0018: the hashed state carries per-record pedigree digests instead of the whole
 * pedigree. `lineage_records` is replaced by `lineage_pedigree_digest` and `lineage_death_digest`,
 * which are folded one record at a time as history is created, so the hash stays a pure function
 * of history rather than of how often it was taken.
 */
export interface PedigreeDigests {
  readonly lineage_pedigree_digest: string;
  readonly lineage_death_digest: string;
}

export function hashScientificState(
  configurationId: string,
  state: ScientificStateSnapshot,
  digest: Sha256Function = sha256,
  pedigree?: PedigreeDigests,
): string {
  if (pedigree !== undefined) {
    const { lineage_records: _omitted, ...withoutPedigree } = state;
    return digest(
      canonicalJson({
        state_hash_algorithm: PEDIGREE_DIGEST_STATE_HASH_VERSION,
        configuration_id: configurationId,
        scientific_state: { ...withoutPedigree, ...pedigree },
      }),
    );
  }
  const stateHashAlgorithm =
    state.local_resources === undefined ? LEGACY_STATE_HASH_VERSION : STATE_HASH_VERSION;
  return digest(
    canonicalJson({
      state_hash_algorithm: stateHashAlgorithm,
      configuration_id: configurationId,
      scientific_state: state,
    }),
  );
}

/**
 * Recomputes the Decision 0018 digests from a checkpoint's own records, so a v4 checkpoint stays
 * self-verifying without storing derived values. The pedigree fold is ascending by identifier and
 * the death combination is order-independent, so both are exact.
 */
export function derivePedigreeDigests(
  records: readonly LineageRecord[],
  digest: Sha256Function = sha256,
): PedigreeDigests {
  let pedigree = "";
  const deaths = new Uint8Array(32);
  const ordered = [...records].sort((left, right) => left.organism_id - right.organism_id);
  for (const record of ordered) {
    pedigree = digest(
      `${pedigree}|${record.organism_id},${record.parent_id ?? "r"},${record.lineage},${record.generation},${record.birth_tick}`,
    );
    if (record.death_tick !== null && record.death_cause !== null) {
      const hex = digest(`${record.organism_id},${record.death_tick},${record.death_cause}`);
      for (let index = 0; index < 32; index += 1) {
        deaths[index] = (deaths[index] ?? 0) ^ Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
      }
    }
  }
  return {
    lineage_pedigree_digest: pedigree,
    lineage_death_digest: [...deaths].map((b) => b.toString(16).padStart(2, "0")).join(""),
  };
}

export function createCheckpoint(
  configurationId: string,
  state: ScientificStateSnapshot,
  digest: Sha256Function = sha256,
  pedigree?: PedigreeDigests,
): EngineCheckpoint {
  const usesResources = state.local_resources !== undefined;
  const payload = {
    checkpoint_format: usesResources
      ? CHECKPOINT_FORMAT_VERSION
      : LEGACY_CHECKPOINT_FORMAT_VERSION,
    engine_state_version: usesResources ? ENGINE_STATE_VERSION : LEGACY_ENGINE_STATE_VERSION,
    configuration_id: configurationId,
    // Decision 0018: the algorithm follows how the hash was computed, not what the state
    // contains. Supplying digests means v4; the checkpoint records that so restore can verify it
    // the same way.
    state_hash_algorithm:
      pedigree !== undefined
        ? PEDIGREE_DIGEST_STATE_HASH_VERSION
        : usesResources
          ? STATE_HASH_VERSION
          : LEGACY_STATE_HASH_VERSION,
    state_hash: hashScientificState(configurationId, state, digest, pedigree),
    state,
  } as const;
  return { ...payload, payload_sha256: digest(canonicalJson(payload)) };
}

export function parseCheckpoint(
  input: unknown,
  digest: Sha256Function = sha256,
): EngineCheckpoint {
  const checkpoint = checkpointSchema.parse(input) as EngineCheckpoint;
  const usesResources = checkpoint.state.local_resources !== undefined;
  const expectedFormat = usesResources
    ? CHECKPOINT_FORMAT_VERSION
    : LEGACY_CHECKPOINT_FORMAT_VERSION;
  const expectedEngineState = usesResources
    ? ENGINE_STATE_VERSION
    : LEGACY_ENGINE_STATE_VERSION;
  // A v4 checkpoint is valid whatever the state contains, because v4 describes the hashing
  // method rather than the state shape.
  const expectedHashAlgorithm = usesResources
    ? STATE_HASH_VERSION
    : LEGACY_STATE_HASH_VERSION;
  const hashAlgorithmAccepted =
    checkpoint.state_hash_algorithm === expectedHashAlgorithm ||
    checkpoint.state_hash_algorithm === PEDIGREE_DIGEST_STATE_HASH_VERSION;
  if (
    checkpoint.checkpoint_format !== expectedFormat ||
    checkpoint.engine_state_version !== expectedEngineState ||
    !hashAlgorithmAccepted
  ) {
    throw new Error("Checkpoint versions do not match the contained scientific state.");
  }
  const { payload_sha256: suppliedDigest, ...payload } = checkpoint;
  const actualDigest = digest(canonicalJson(payload));
  if (actualDigest !== suppliedDigest) {
    throw new Error("Checkpoint payload digest does not match its contents.");
  }
  const actualStateHash = hashScientificState(
    checkpoint.configuration_id,
    checkpoint.state,
    digest,
    checkpoint.state_hash_algorithm === PEDIGREE_DIGEST_STATE_HASH_VERSION
      ? derivePedigreeDigests(checkpoint.state.lineage_records, digest)
      : undefined,
  );
  if (actualStateHash !== checkpoint.state_hash) {
    throw new Error("Checkpoint state hash does not match its scientific state.");
  }
  return checkpoint;
}
