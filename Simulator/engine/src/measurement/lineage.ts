import type { DeathCause } from "../domain/events.js";
import type { Lineage } from "../domain/organism.js";

export interface LineageRecord {
  readonly organism_id: number;
  readonly parent_id: number | null;
  readonly lineage: Lineage;
  readonly generation: number;
  readonly birth_tick: number;
  death_tick: number | null;
  death_cause: DeathCause | null;
}

export function cloneLineageRecord(record: LineageRecord): LineageRecord {
  return { ...record };
}
