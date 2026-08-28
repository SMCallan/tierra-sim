import type { ImmutableEngineConfig } from "../config/schema.js";
import type { OrganismState } from "../domain/organism.js";
import type { RunCounters } from "../domain/events.js";
import type { LineageRecord } from "../measurement/lineage.js";
import { validateGenome } from "../vm/opcodes.js";
import type { WorldGrid } from "../world/grid.js";
import type { LocalResourceField } from "../world/resource-field.js";
import { EngineInvariantError } from "./errors.js";
import type { TerminalReason } from "./types.js";

export interface InvariantState {
  readonly configuration: ImmutableEngineConfig;
  readonly grid: WorldGrid;
  readonly organisms: ReadonlyMap<number, OrganismState>;
  readonly lineageRecords: ReadonlyMap<number, LineageRecord>;
  readonly counters: RunCounters;
  readonly resources: LocalResourceField | null;
  readonly completedTick: number;
  readonly terminalReason: TerminalReason | null;
  readonly nextOrganismId: number;
  readonly nextTaskId: number;
  /**
   * Highest pedigree identifier already verified by an earlier assertion. When supplied, only
   * records at or above it are re-verified: the properties checked below the watermark
   * (contiguity, parentage, ancestor metadata, birth tick) are fixed when a record is written and
   * cannot subsequently change. Omit to force a full scan, which every terminal state does.
   */
  readonly pedigreeVerifiedThrough?: number;
  /**
   * Engine-maintained count of records carrying a death tick, used in place of recounting the
   * whole registry during incremental assertions. A full scan recounts independently.
   */
  readonly deadRecordCount?: number;
}

export function assertEngineInvariants(state: InvariantState): void {
  const {
    configuration,
    grid,
    organisms,
    lineageRecords,
    counters,
    resources,
    completedTick,
    terminalReason,
    nextOrganismId,
    nextTaskId,
    pedigreeVerifiedThrough,
    deadRecordCount,
  } = state;
  if (grid.populationSize !== organisms.size) {
    throw new EngineInvariantError("Grid and organism-map population sizes differ.");
  }
  if (counters.births !== counters.autonomous_successes + counters.exploitative_successes) {
    throw new EngineInvariantError("Birth total does not equal successful reproduction pathways.");
  }
  if (!Number.isSafeInteger(completedTick) || completedTick < 0) {
    throw new EngineInvariantError("Completed tick is invalid.");
  }
  if (completedTick > configuration.duration.completed_ticks) {
    throw new EngineInvariantError("Completed tick exceeds the configured duration.");
  }
  if (terminalReason === "extinction" && organisms.size !== 0) {
    throw new EngineInvariantError("An extinction terminal state still has living organisms.");
  }
  if (
    terminalReason === "completed" &&
    completedTick !== configuration.duration.completed_ticks
  ) {
    throw new EngineInvariantError("A completed terminal state is not at the configured duration.");
  }
  if (
    terminalReason === null &&
    (organisms.size === 0 || completedTick >= configuration.duration.completed_ticks)
  ) {
    throw new EngineInvariantError("A terminal condition exists without a terminal reason.");
  }

  let livingEnergy = 0n;
  for (const [organismId, organism] of organisms) {
    const coordinate = grid.coordinateOf(organismId);
    if (
      coordinate === null ||
      coordinate.x !== organism.coordinate.x ||
      coordinate.y !== organism.coordinate.y
    ) {
      throw new EngineInvariantError(`Organism ${organismId} coordinate disagrees with grid.`);
    }
    if (
      !Number.isSafeInteger(organism.energy) ||
      organism.energy < 0 ||
      organism.energy > configuration.energy.maximum_organism_energy
    ) {
      throw new EngineInvariantError(`Organism ${organismId} has invalid energy.`);
    }
    if (
      organism.genome.length < configuration.reproduction.min_genome_length ||
      organism.genome.length > configuration.reproduction.max_genome_length
    ) {
      throw new EngineInvariantError(`Organism ${organismId} genome length is outside bounds.`);
    }
    validateGenome(organism.genome);
    if (organism.behaviour_buckets.length !== configuration.measurement.bucket_count) {
      throw new EngineInvariantError(`Organism ${organismId} has an invalid behaviour window.`);
    }
    const lineageRecord = lineageRecords.get(organismId);
    if (
      lineageRecord === undefined ||
      lineageRecord.parent_id !== organism.parent_id ||
      lineageRecord.lineage !== organism.lineage ||
      lineageRecord.generation !== organism.generation ||
      lineageRecord.death_tick !== null ||
      lineageRecord.death_cause !== null
    ) {
      throw new EngineInvariantError(`Organism ${organismId} has an inconsistent lineage record.`);
    }
    livingEnergy += BigInt(organism.energy);
  }

  if (!Number.isSafeInteger(nextOrganismId) || nextOrganismId !== lineageRecords.size) {
    throw new EngineInvariantError("Next organism identifier disagrees with the pedigree registry.");
  }
  const initialOrganisms = lineageRecords.size - counters.births;
  const expectedNextTaskId = initialOrganisms + counters.births * 2;
  if (!Number.isSafeInteger(expectedNextTaskId) || nextTaskId !== expectedNextTaskId) {
    throw new EngineInvariantError("Next task identifier disagrees with births and ancestors.");
  }
  // A full scan recounts deaths from the registry, which is the independent cross-check against
  // the death counters. An incremental assertion cannot recount without traversing everything, so
  // it uses the engine's maintained tally; every terminal state performs a full scan and restores
  // the independent recount.
  const fullScan = pedigreeVerifiedThrough === undefined;
  const firstUnverified = fullScan ? 0 : Math.max(0, pedigreeVerifiedThrough);
  let deadRecords = 0;
  for (let organismId = firstUnverified; organismId < nextOrganismId; organismId += 1) {
    const record = lineageRecords.get(organismId);
    if (record === undefined || record.organism_id !== organismId) {
      throw new EngineInvariantError("Pedigree identifiers are not complete and contiguous.");
    }
    if (record.birth_tick > completedTick) {
      throw new EngineInvariantError(`Organism ${organismId} is recorded as born in the future.`);
    }
    if ((record.death_tick === null) !== (record.death_cause === null)) {
      throw new EngineInvariantError(`Organism ${organismId} has an incomplete death record.`);
    }
    if (record.death_tick !== null) {
      deadRecords += 1;
      if (record.death_tick < record.birth_tick || record.death_tick > completedTick) {
        throw new EngineInvariantError(`Organism ${organismId} has an invalid death tick.`);
      }
      if (organisms.has(organismId)) {
        throw new EngineInvariantError(`Dead organism ${organismId} remains in the live population.`);
      }
    }
    if (record.parent_id === null) {
      if (record.generation !== 0 || record.birth_tick !== 0) {
        throw new EngineInvariantError(`Ancestor ${organismId} has invalid pedigree metadata.`);
      }
    } else {
      const parent = lineageRecords.get(record.parent_id);
      if (
        parent === undefined ||
        parent.organism_id >= record.organism_id ||
        parent.lineage !== record.lineage ||
        record.generation !== parent.generation + 1
      ) {
        throw new EngineInvariantError(`Organism ${organismId} has an invalid parent relationship.`);
      }
    }
  }
  const recordedDeaths =
    counters.deaths_exogenous + counters.deaths_energy + counters.deaths_exploitation;
  const observedDeaths = fullScan ? deadRecords : deadRecordCount;
  if (observedDeaths !== recordedDeaths) {
    throw new EngineInvariantError("Pedigree deaths disagree with cumulative death counters.");
  }

  if ((configuration.resources === undefined) !== (resources === null)) {
    throw new EngineInvariantError("Configuration and resource-state presence disagree.");
  }
  try {
    resources?.assertValid();
  } catch (error) {
    throw new EngineInvariantError(
      `Invalid local resource field: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const resourceSnapshot = resources?.snapshot();
  if (resourceSnapshot !== undefined) {
    const expectedInitialResource =
      grid.cellCount * (configuration.resources?.initial_stock ?? 0);
    if (resourceSnapshot.counters.initial_total !== expectedInitialResource) {
      throw new EngineInvariantError("Initial resource counter disagrees with configuration.");
    }
    const expectedCurrentResource =
      BigInt(resourceSnapshot.counters.initial_total) +
      BigInt(resourceSnapshot.counters.regenerated_total) -
      BigInt(resourceSnapshot.counters.harvested_total);
    if (expectedCurrentResource !== BigInt(resources?.totalStock() ?? 0)) {
      throw new EngineInvariantError("Resource reservoir ledger is not exact.");
    }
    if (
      resourceSnapshot.counters.zero_harvests +
        resourceSnapshot.counters.partial_harvests >
      resourceSnapshot.counters.harvest_opportunities
    ) {
      throw new EngineInvariantError("Resource harvest outcome counters exceed opportunities.");
    }
  }
  const initialResource = BigInt(resourceSnapshot?.counters.initial_total ?? 0);
  const currentResource = BigInt(resources?.totalStock() ?? 0);
  const supplied =
    BigInt(counters.initial_energy) + initialResource + BigInt(counters.energy_created);
  const accounted =
    livingEnergy +
    currentResource +
    BigInt(counters.energy_dissipated) +
    BigInt(counters.energy_discarded);
  if (supplied !== accounted) {
    throw new EngineInvariantError(
      `Energy ledger mismatch: supplied ${supplied}, accounted ${accounted}.`,
    );
  }
}
