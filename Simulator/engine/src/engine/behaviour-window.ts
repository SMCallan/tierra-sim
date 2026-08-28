import { createEmptyBehaviourBucket, type BehaviourBucket, type OrganismState } from "../domain/organism.js";
import { EngineInvariantError } from "./errors.js";

export function prepareBehaviourBucket(
  organism: OrganismState,
  bucketNumber: number,
  bucketCount: number,
): void {
  const slotIndex = bucketNumber % bucketCount;
  const slot = organism.behaviour_buckets[slotIndex];
  if (slot === undefined || slot.bucket_number !== bucketNumber) {
    organism.behaviour_buckets[slotIndex] = createEmptyBehaviourBucket(bucketNumber);
  }
}

export function currentBehaviourBucket(
  organism: OrganismState,
  bucketNumber: number | null,
  bucketCount: number,
): BehaviourBucket {
  if (bucketNumber === null) {
    throw new EngineInvariantError("An event occurred outside an active behavioural bucket.");
  }
  const slotIndex = bucketNumber % bucketCount;
  const bucket = organism.behaviour_buckets[slotIndex];
  if (bucket === undefined || bucket.bucket_number !== bucketNumber) {
    throw new EngineInvariantError(`Organism ${organism.id} has no current behavioural bucket.`);
  }
  return bucket;
}
