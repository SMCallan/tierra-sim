import { deepFreeze, type DeepReadonly } from "../config/deep-freeze.js";
import type { BehaviourBucket, OrganismState } from "../domain/organism.js";
import type { RunCounters } from "../domain/events.js";

function cloneBucket(bucket: BehaviourBucket): BehaviourBucket {
  return { ...bucket, result_counts: { ...bucket.result_counts } };
}

export function cloneOrganismState(organism: Readonly<OrganismState>): OrganismState {
  return {
    ...organism,
    coordinate: { ...organism.coordinate },
    genome: [...organism.genome],
    vm: {
      ...organism.vm,
      task: { ...organism.vm.task },
      provenance_a:
        organism.vm.provenance_a === null ? null : { ...organism.vm.provenance_a },
      provenance_b:
        organism.vm.provenance_b === null ? null : { ...organism.vm.provenance_b },
      last_computation:
        organism.vm.last_computation === null ? null : { ...organism.vm.last_computation },
    },
    behaviour_buckets: organism.behaviour_buckets.map(cloneBucket),
  };
}

export function organismSnapshot(organism: OrganismState): DeepReadonly<OrganismState> {
  return deepFreeze(cloneOrganismState(organism));
}

export function countersSnapshot(counters: RunCounters): DeepReadonly<RunCounters> {
  return deepFreeze(cloneRunCounters(counters));
}

export function cloneRunCounters(counters: Readonly<RunCounters>): RunCounters {
  return {
    ...counters,
    mutation_attempted: { ...counters.mutation_attempted },
    mutation_accepted: { ...counters.mutation_accepted },
    mutation_rejected: { ...counters.mutation_rejected },
  };
}
