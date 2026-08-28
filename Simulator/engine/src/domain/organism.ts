import type { Coordinate } from "../world/coordinates.js";
import type { VmState } from "../vm/machine.js";
import {
  EcologicalResultCode,
  type EcologicalResultCode as EcologicalResultCodeValue,
} from "./events.js";

export const Lineage = {
  Host: "host",
  Parasite: "parasite",
} as const;

export type Lineage = (typeof Lineage)[keyof typeof Lineage];

export interface BehaviourBucket {
  bucket_number: number | null;
  autonomous_attempts: number;
  autonomous_successes: number;
  exploitative_attempts: number;
  exploitative_successes: number;
  hgt_attempts: number;
  hgt_successes: number;
  rewarded_and: number;
  rewarded_xor: number;
  rewarded_equ: number;
  rewarded_add: number;
  energy_created: number;
  energy_transferred: number;
  energy_dissipated: number;
  energy_discarded: number;
  exploit_energy_obtained: number;
  exploit_energy_lost: number;
  mutation_point_accepted: number;
  mutation_point_rejected: number;
  mutation_insertion_accepted: number;
  mutation_insertion_rejected: number;
  mutation_deletion_accepted: number;
  mutation_deletion_rejected: number;
  result_counts: Record<EcologicalResultCodeValue, number>;
}

export interface OrganismState {
  readonly id: number;
  readonly parent_id: number | null;
  readonly lineage: Lineage;
  readonly generation: number;
  coordinate: Coordinate;
  genome: number[];
  vm: VmState;
  energy: number;
  age_ticks: number;
  reproduction_cooldown: number;
  behaviour_buckets: BehaviourBucket[];
}

export function createEmptyBehaviourBucket(bucketNumber: number | null): BehaviourBucket {
  if (bucketNumber !== null && (!Number.isSafeInteger(bucketNumber) || bucketNumber < 0)) {
    throw new RangeError("Behaviour bucket number must be a non-negative safe integer.");
  }
  return {
    bucket_number: bucketNumber,
    autonomous_attempts: 0,
    autonomous_successes: 0,
    exploitative_attempts: 0,
    exploitative_successes: 0,
    hgt_attempts: 0,
    hgt_successes: 0,
    rewarded_and: 0,
    rewarded_xor: 0,
    rewarded_equ: 0,
    rewarded_add: 0,
    energy_created: 0,
    energy_transferred: 0,
    energy_dissipated: 0,
    energy_discarded: 0,
    exploit_energy_obtained: 0,
    exploit_energy_lost: 0,
    mutation_point_accepted: 0,
    mutation_point_rejected: 0,
    mutation_insertion_accepted: 0,
    mutation_insertion_rejected: 0,
    mutation_deletion_accepted: 0,
    mutation_deletion_rejected: 0,
    result_counts: {
      [EcologicalResultCode.Success]: 0,
      [EcologicalResultCode.NoNeighbour]: 0,
      [EcologicalResultCode.NoEmptyCell]: 0,
      [EcologicalResultCode.Cooldown]: 0,
      [EcologicalResultCode.InsufficientCallerEnergy]: 0,
      [EcologicalResultCode.InsufficientDonorEnergy]: 0,
      [EcologicalResultCode.DonorLocusNotCopy]: 0,
      [EcologicalResultCode.DonorCopyAbsent]: 0,
      [EcologicalResultCode.HgtTrialFailed]: 0,
      [EcologicalResultCode.GenomeCapacity]: 0,
      [EcologicalResultCode.GenomeMinimum]: 0,
      [EcologicalResultCode.ConfigurationInvariant]: 0,
    },
  };
}

export function createBehaviourWindow(bucketCount: number): BehaviourBucket[] {
  if (!Number.isSafeInteger(bucketCount) || bucketCount <= 0) {
    throw new RangeError("Behaviour bucket count must be a positive safe integer.");
  }
  return Array.from({ length: bucketCount }, () => createEmptyBehaviourBucket(null));
}
