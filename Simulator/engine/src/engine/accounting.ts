import type { ImmutableEngineConfig } from "../config/schema.js";
import type { BehaviourBucket, OrganismState } from "../domain/organism.js";
import {
  EnergyEventKind,
  type EnergyEventKind as EnergyEventKindValue,
  type EngineEvent,
  type RunCounters,
} from "../domain/events.js";
import { EngineInvariantError } from "./errors.js";

export function addSafe(current: number, amount: number, label: string): number {
  const result = current + amount;
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new EngineInvariantError(`${label} exceeded safe integer accounting range.`);
  }
  return result;
}

export interface EnergyAccountingContext {
  readonly configuration: ImmutableEngineConfig;
  readonly counters: RunCounters;
  readonly currentBucket: (organism: OrganismState) => BehaviourBucket;
}

export function creditEnergy(
  context: EnergyAccountingContext,
  organism: OrganismState,
  requested: number,
  kind: EnergyEventKindValue,
  tick: number,
  events: EngineEvent[],
): number {
  const room = context.configuration.energy.maximum_organism_energy - organism.energy;
  const actual = Math.min(requested, room);
  organism.energy += actual;
  context.counters.energy_created = addSafe(
    context.counters.energy_created,
    actual,
    "energy created",
  );
  const bucket = context.currentBucket(organism);
  bucket.energy_created = addSafe(bucket.energy_created, actual, "bucket energy created");
  if (actual > 0) {
    events.push({ type: "energy", tick, kind, organism_id: organism.id, amount: actual });
  }
  return actual;
}

export function dissipateEnergy(
  context: EnergyAccountingContext,
  organism: OrganismState,
  requested: number,
  kind: EnergyEventKindValue,
  tick: number,
  events: EngineEvent[],
): number {
  const actual = Math.min(requested, organism.energy);
  organism.energy -= actual;
  context.counters.energy_dissipated = addSafe(
    context.counters.energy_dissipated,
    actual,
    "energy dissipated",
  );
  const bucket = context.currentBucket(organism);
  bucket.energy_dissipated = addSafe(
    bucket.energy_dissipated,
    actual,
    "bucket energy dissipated",
  );
  if (actual > 0) {
    events.push({ type: "energy", tick, kind, organism_id: organism.id, amount: actual });
  }
  return actual;
}

export function transferEnergy(
  context: EnergyAccountingContext,
  source: OrganismState,
  amount: number,
  counterpartyId: number,
  tick: number,
  events: EngineEvent[],
): void {
  if (source.energy < amount) {
    throw new EngineInvariantError("Attempted a partially funded energy transfer.");
  }
  source.energy -= amount;
  context.counters.energy_transferred = addSafe(
    context.counters.energy_transferred,
    amount,
    "energy transferred",
  );
  const bucket = context.currentBucket(source);
  bucket.energy_transferred = addSafe(
    bucket.energy_transferred,
    amount,
    "bucket energy transferred",
  );
  events.push({
    type: "energy",
    tick,
    kind: EnergyEventKind.OffspringEndowmentTransfer,
    organism_id: source.id,
    counterparty_id: counterpartyId,
    amount,
  });
}

export function discardEnergy(
  context: EnergyAccountingContext,
  organism: OrganismState,
  tick: number,
  events: EngineEvent[],
): number {
  const discarded = organism.energy;
  if (discarded === 0) {
    return 0;
  }
  organism.energy = 0;
  context.counters.energy_discarded = addSafe(
    context.counters.energy_discarded,
    discarded,
    "energy discarded",
  );
  const bucket = context.currentBucket(organism);
  bucket.energy_discarded = addSafe(
    bucket.energy_discarded,
    discarded,
    "bucket energy discarded",
  );
  events.push({
    type: "energy",
    tick,
    kind: EnergyEventKind.DeathDiscard,
    organism_id: organism.id,
    amount: discarded,
  });
  return discarded;
}

export function maintenanceCost(
  configuration: ImmutableEngineConfig,
  genomeLength: number,
): number {
  const rule = configuration.energy.genome_maintenance;
  if (rule.numerator === 0) {
    return 0;
  }
  const rawCost = (BigInt(genomeLength) * BigInt(rule.numerator)) / BigInt(rule.denominator);
  const minCost = BigInt(rule.min_cost ?? 1);
  const cost = rawCost < minCost ? minCost : rawCost;
  if (cost > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new EngineInvariantError("Genome maintenance cost exceeds safe integer range.");
  }
  return Number(cost);
}

export function safeEnergyRequirement(first: number, second: number): number {
  const result = first + second;
  if (!Number.isSafeInteger(result)) {
    throw new EngineInvariantError("Energy requirement exceeds safe integer range.");
  }
  return result;
}
