import { deepFreeze, type DeepReadonly } from "../config/deep-freeze.js";
import { parseEngineConfig, type ImmutableEngineConfig } from "../config/schema.js";
import {
  createBehaviourWindow,
  type BehaviourBucket,
  type OrganismState,
} from "../domain/organism.js";
import {
  createRunCounters,
  DeathCause,
  EcologicalOperation,
  EcologicalResultCode,
  EnergyEventKind,
  MutationClass,
  type DeathCause as DeathCauseValue,
  type EcologicalOperation as EcologicalOperationValue,
  type EcologicalResultCode as EcologicalResultCodeValue,
  type EnergyEventKind as EnergyEventKindValue,
  type EngineEvent,
  type RunCounters,
} from "../domain/events.js";
import {
  mutateCopiedGenome,
  type MutationOutcome,
  type MutationRecord,
} from "../genome/mutation.js";
import { sha256, type Sha256Function } from "../hash/sha256.js";
import { cloneLineageRecord, type LineageRecord } from "../measurement/lineage.js";
import {
  measurePopulation,
  type PopulationMeasurement,
  type SampleKind,
} from "../measurement/population.js";
import { Xoshiro128StarStar, type PrngState } from "../random/prng.js";
import { parseAncestorFixture, type AncestorFixture } from "../seed/fixture.js";
import {
  ComputationOperation,
  createVmState,
  executeVmInstruction,
  resetReproductiveCycle,
  type ComputationOperation as ComputationOperationValue,
  type ComputationTask,
  type VmEffect,
} from "../vm/machine.js";
import { Opcode } from "../vm/opcodes.js";
import {
  directionFromRegister,
  fromCellIndex,
  rotateDirection,
  type Coordinate,
} from "../world/coordinates.js";
import { WorldGrid } from "../world/grid.js";
import {
  LocalResourceField,
  type LocalResourceStateSnapshot,
} from "../world/resource-field.js";
import {
  addSafe,
  creditEnergy,
  discardEnergy,
  dissipateEnergy,
  maintenanceCost,
  safeEnergyRequirement,
  transferEnergy,
  type EnergyAccountingContext,
} from "./accounting.js";
import { currentBehaviourBucket, prepareBehaviourBucket } from "./behaviour-window.js";
import {
  configurationDigest,
  createCheckpoint,
  hashScientificState,
  type PedigreeDigests,
  LEGACY_STATE_HASH_VERSION,
  PEDIGREE_DIGEST_STATE_HASH_VERSION,
  parseCheckpoint,
  STATE_HASH_VERSION,
  type EngineCheckpoint,
  type ScientificStateSnapshot,
  type StateHashVersion,
} from "./checkpoint.js";
import { EngineInvariantError } from "./errors.js";
import { assertEngineInvariants } from "./invariants.js";
import {
  cloneOrganismState,
  cloneRunCounters,
  countersSnapshot as createCountersSnapshot,
  organismSnapshot as createOrganismSnapshot,
} from "./snapshots.js";
import type { TerminalReason, TickReport } from "./types.js";

export { EngineInvariantError } from "./errors.js";
export type { TerminalReason, TickReport } from "./types.js";

interface MaterialisedAncestor {
  readonly lineage: OrganismState["lineage"];
  readonly genome: readonly number[];
  readonly initial_energy: number;
  readonly coordinate: Coordinate;
}

interface AttemptDetails {
  readonly donor_id?: number;
  readonly child_id?: number;
}

export interface EngineRuntimeOptions {
  readonly sha256?: Sha256Function;
}

function assertConformantSha256(digest: Sha256Function): void {
  if (
    digest("") !== "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" ||
    digest("abc") !== "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  ) {
    throw new Error("Runtime SHA-256 implementation failed normative conformance vectors.");
  }
}

export class SimulationEngine {
  readonly configuration: ImmutableEngineConfig;
  readonly configurationId: string;
  readonly grid: WorldGrid;

  #completedTick = 0;
  #terminalReason: TerminalReason | null = null;
  #nextOrganismId = 0;
  #nextTaskId = 0;
  #activeBucketNumber: number | null = null;
  #random: Xoshiro128StarStar;
  #organisms = new Map<number, OrganismState>();
  #lineageRecords = new Map<number, LineageRecord>();
  #counters = createRunCounters();
  #resources: LocalResourceField | null = null;
  #sha256: Sha256Function;

  private constructor(
    configuration: ImmutableEngineConfig,
    fixture: AncestorFixture | null,
    runtime: EngineRuntimeOptions,
  ) {
    this.configuration = configuration;
    this.#sha256 = runtime.sha256 ?? sha256;
    assertConformantSha256(this.#sha256);
    this.configurationId = configurationDigest(configuration, this.#sha256);
    this.grid = new WorldGrid(configuration.world.width, configuration.world.height);
    this.#random = new Xoshiro128StarStar(configuration.identity.seed);
    if (configuration.resources !== undefined) {
      this.#resources = new LocalResourceField(
        configuration.world.width,
        configuration.world.height,
        configuration.resources,
      );
    }
    if (fixture !== null) {
      this.#initialisePopulation(fixture);
      this.assertInvariants();
    }
  }

  static create(
    configurationInput: unknown,
    fixtureInput: unknown,
    runtime: EngineRuntimeOptions = {},
  ): SimulationEngine {
    const configuration = parseEngineConfig(configurationInput);
    const fixture = parseAncestorFixture(fixtureInput, configuration);
    return new SimulationEngine(configuration, fixture, runtime);
  }

  static restore(
    configurationInput: unknown,
    checkpointInput: unknown,
    runtime: EngineRuntimeOptions = {},
  ): SimulationEngine {
    const configuration = parseEngineConfig(configurationInput);
    const digest = runtime.sha256 ?? sha256;
    const checkpoint = parseCheckpoint(checkpointInput, digest);
    const expectedConfigurationId = configurationDigest(configuration, digest);
    if (checkpoint.configuration_id !== expectedConfigurationId) {
      throw new Error("Checkpoint configuration digest does not match the supplied configuration.");
    }

    const engine = new SimulationEngine(configuration, null, runtime);
    const state = checkpoint.state;
    engine.#completedTick = state.completed_tick;
    engine.#terminalReason = state.terminal_reason;
    engine.#nextOrganismId = state.next_organism_id;
    engine.#nextTaskId = state.next_task_id;
    engine.#random = Xoshiro128StarStar.fromState(state.prng_state);
    engine.#counters = cloneRunCounters(state.counters);
    if (configuration.resources === undefined) {
      if (state.local_resources !== undefined) {
        throw new EngineInvariantError("Legacy configuration cannot restore resource state.");
      }
      engine.#resources = null;
    } else {
      if (state.local_resources === undefined) {
        throw new EngineInvariantError("Resource configuration is missing checkpoint resource state.");
      }
      engine.#resources = LocalResourceField.restore(
        configuration.world.width,
        configuration.world.height,
        configuration.resources,
        state.local_resources,
      );
    }
    for (const serialised of state.organisms) {
      const organism = cloneOrganismState(serialised);
      engine.grid.place(organism.id, organism.coordinate);
      engine.#organisms.set(organism.id, organism);
    }
    const reconstructedOccupancy = engine.grid.occupancySnapshot();
    if (
      reconstructedOccupancy.length !== state.world_occupancy.length ||
      reconstructedOccupancy.some(
        (organismId, index) => organismId !== state.world_occupancy[index],
      )
    ) {
      throw new EngineInvariantError("Checkpoint world occupancy disagrees with organism coordinates.");
    }
    for (const serialised of state.lineage_records) {
      const record = cloneLineageRecord(serialised);
      engine.#lineageRecords.set(record.organism_id, record);
    }
    // Decision 0018: rebuild both digests so a resumed run hashes identically to an
    // uninterrupted one. The pedigree fold is ascending by identifier and the death combination is
    // order-independent, so both are exactly recoverable from the records alone.
    engine.#foldPedigreeDigest();
    for (const record of engine.#lineageRecords.values()) {
      if (record.death_tick !== null && record.death_cause !== null) {
        engine.#xorDeathDigest(record.organism_id, record.death_tick, record.death_cause);
      }
    }
    engine.assertInvariants();
    if (engine.stateHash() !== checkpoint.state_hash) {
      throw new EngineInvariantError("Restored engine state does not reproduce checkpoint state hash.");
    }
    return engine;
  }

  get completedTick(): number {
    return this.#completedTick;
  }

  get populationSize(): number {
    return this.#organisms.size;
  }

  get terminalReason(): TerminalReason | null {
    return this.#terminalReason;
  }

  get prngState(): PrngState {
    return this.#random.getState();
  }

  /**
   * The algorithm `stateHash()` actually uses.
   *
   * This must track `stateHash()` exactly, because it is what the run manifest records and
   * therefore what any future reproduction attempt compares against. It did not: after Decision
   * 0018 introduced the pedigree-digest algorithm, `stateHash()` began emitting v4 for every
   * resource-bearing configuration while this getter still reported v3, so all sixty formal runs
   * carry a manifest naming an algorithm that did not produce their hashes (`D053`). The hashes
   * themselves are correct and internally consistent; only the label was wrong.
   */
  get stateHashAlgorithm(): StateHashVersion {
    if (this.#resources === null) {
      return LEGACY_STATE_HASH_VERSION;
    }
    return this.#pedigreeDigests() === undefined
      ? STATE_HASH_VERSION
      : PEDIGREE_DIGEST_STATE_HASH_VERSION;
  }

  lineageRecord(organismId: number): DeepReadonly<LineageRecord> | null {
    const record = this.#lineageRecords.get(organismId);
    return record === undefined ? null : deepFreeze(cloneLineageRecord(record));
  }

  lineageOf(organismId: number): OrganismState["lineage"] | null {
    return this.#lineageRecords.get(organismId)?.lineage ?? null;
  }

  lineageRecords(): readonly DeepReadonly<LineageRecord>[] {
    return Object.freeze(
      [...this.#lineageRecords.values()]
        .sort((left, right) => left.organism_id - right.organism_id)
        .map((record) => deepFreeze(cloneLineageRecord(record))),
    );
  }

  organismIds(): readonly number[] {
    return this.grid.organismIds();
  }

  organismSnapshot(organismId: number): DeepReadonly<OrganismState> | null {
    const organism = this.#organisms.get(organismId);
    return organism === undefined ? null : createOrganismSnapshot(organism);
  }

  countersSnapshot(): DeepReadonly<RunCounters> {
    return createCountersSnapshot(this.#counters);
  }

  resourceSnapshot(): DeepReadonly<LocalResourceStateSnapshot> | null {
    return this.#resources === null ? null : deepFreeze(this.#resources.snapshot());
  }

  scientificStateSnapshot(): ScientificStateSnapshot {
    return this.#scientificStateSnapshot(true);
  }

  /**
   * @param cloneRecords copy each lineage record before returning. Required whenever the caller
   * retains the snapshot; unnecessary when it is serialised immediately and dropped.
   */
  #scientificStateSnapshot(cloneRecords: boolean): ScientificStateSnapshot {
    const state: ScientificStateSnapshot = {
      completed_tick: this.#completedTick,
      terminal_reason: this.#terminalReason,
      next_organism_id: this.#nextOrganismId,
      next_task_id: this.#nextTaskId,
      prng_state: this.#random.getState(),
      world_occupancy: [...this.grid.occupancySnapshot()],
      organisms: this.organismIds().map((organismId) =>
        cloneOrganismState(this.#requiredOrganism(organismId)),
      ),
      counters: cloneRunCounters(this.#counters),
      // Records are inserted in ascending `organism_id` in all three paths — ancestor
      // materialisation, birth, and checkpoint restore — so Map insertion order is already the
      // canonical order. Re-sorting cost a comparison sort over every organism that had ever
      // existed, on every state hash: 2,500 sorts of up to 6.1M near-sorted elements in a
      // 500,000-tick run, for no change in output.
      lineage_records: cloneRecords
        ? [...this.#lineageRecords.values()].map(cloneLineageRecord)
        : [...this.#lineageRecords.values()],
      ...(this.#resources === null
        ? {}
        : { local_resources: this.#resources.snapshot() }),
    };
    return state;
  }

  #xorDeathDigest(organismId: number, deathTick: number, cause: string): void {
    const hex = this.#sha256(`${organismId},${deathTick},${cause}`);
    for (let index = 0; index < 32; index += 1) {
      const byte = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
      this.#lineageDeathAccumulator[index] = (this.#lineageDeathAccumulator[index] ?? 0) ^ byte;
    }
  }

  get #lineageDeathDigest(): string {
    return [...this.#lineageDeathAccumulator]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * Decision 0018 applies to the modern resource-bearing construct only. Legacy resource-free
   * configurations keep their frozen v2 hashing semantics untouched.
   */
  #pedigreeDigests(): PedigreeDigests | undefined {
    if (this.#resources === null) {
      return undefined;
    }
    this.#foldPedigreeDigest();
    return {
      lineage_pedigree_digest: this.#lineagePedigreeDigest,
      lineage_death_digest: this.#lineageDeathDigest,
    };
  }

  /** Folds every record created since the last fold. Cheap and idempotent. */
  #foldPedigreeDigest(): void {
    for (let id = this.#pedigreeDigestThrough; id < this.#nextOrganismId; id += 1) {
      const record = this.#lineageRecords.get(id);
      if (record === undefined) {
        continue;
      }
      this.#lineagePedigreeDigest = this.#sha256(
        `${this.#lineagePedigreeDigest}|${record.organism_id},${record.parent_id ?? "r"},${record.lineage},${record.generation},${record.birth_tick}`,
      );
    }
    this.#pedigreeDigestThrough = this.#nextOrganismId;
  }

  stateHash(): string {
    // Hashing reads the snapshot once and discards it, so the defensive clone of every lineage
    // record is pure waste — at 500,000 ticks that is roughly 6.1 million object allocations per
    // hash, 2,500 times over. Checkpoints keep the cloned snapshot, because a checkpoint is
    // retained and must not alias live engine state.
    return hashScientificState(
      this.configurationId,
      this.#scientificStateSnapshot(false),
      this.#sha256,
      this.#pedigreeDigests(),
    );
  }

  checkpoint(): EngineCheckpoint {
    // Checkpoints carry the full pedigree for restoration and hash it the same way a live run
    // does, so a checkpoint hash and a run hash remain directly comparable.
    return createCheckpoint(
      this.configurationId,
      this.scientificStateSnapshot(),
      this.#sha256,
      this.#pedigreeDigests(),
    );
  }

  populationMeasurement(sampleKind: SampleKind): PopulationMeasurement {
    const atSampleBoundary =
      this.#completedTick > 0 &&
      this.#completedTick % this.configuration.duration.sample_every_ticks === 0;
    if (sampleKind === "scheduled" && !atSampleBoundary) {
      throw new Error("Scheduled measurements are defined only at configured sample boundaries.");
    }
    if (sampleKind === "terminal" && this.#terminalReason === null) {
      throw new Error("A terminal measurement requires a terminated run.");
    }
    return measurePopulation({
      configuration: this.configuration,
      organisms: this.organismIds().map((organismId) => this.#requiredOrganism(organismId)),
      counters: cloneRunCounters(this.#counters),
      tick: this.#completedTick,
      sample_kind: sampleKind,
      state_hash: this.stateHash(),
      include_formal_divergence: atSampleBoundary,
      world_occupancy: this.grid.occupancySnapshot(),
      local_resources: this.#resources?.snapshot() ?? null,
    });
  }

  stepTick(): TickReport {
    if (this.#terminalReason !== null) {
      throw new Error(`Cannot step a terminated run (${this.#terminalReason}).`);
    }

    const tick = this.#completedTick + 1;
    const events: EngineEvent[] = [];
    this.#regenerateResources(tick, events);
    this.#activeBucketNumber = Math.floor(
      (tick - 1) / this.configuration.measurement.bucket_length_ticks,
    );
    for (const organism of this.#organisms.values()) {
      this.#prepareCurrentBucket(organism);
    }

    const activationOrder = this.#random.shuffled(this.grid.organismIds());

    for (const organismId of activationOrder) {
      const organism = this.#organisms.get(organismId);
      if (organism === undefined) {
        continue;
      }

      if (this.#random.bernoulli(this.configuration.world.exogenous_death_probability)) {
        this.#killOrganism(organism, DeathCause.Exogenous, tick, events);
        continue;
      }

      if (this.#resources === null) {
        this.#creditEnergy(
          organism,
          this.configuration.energy.environmental_income,
          EnergyEventKind.EnvironmentalIncome,
          tick,
          events,
        );
      } else {
        this.#harvestResource(organism, tick, events);
      }
      if (organism.reproduction_cooldown > 0) {
        organism.reproduction_cooldown -= 1;
      }

      const occupiedNeighbours = this.grid.occupiedNeighbourCount(organism.coordinate);
      const vmStep = executeVmInstruction(organism.vm, organism.genome, {
        occupied_neighbours: occupiedNeighbours,
        empty_neighbours: 4 - occupiedNeighbours,
        computation_rewards: this.configuration.energy.computation_rewards,
      });
      organism.vm = vmStep.state;
      this.#counters.activations = addSafe(this.#counters.activations, 1, "activations");
      events.push({
        type: "activation",
        tick,
        organism_id: organism.id,
        executed_opcode: vmStep.executed_opcode,
      });

      this.#applyVmEffect(organism, vmStep.effect, tick, events);

      this.#dissipateEnergy(
        organism,
        this.configuration.energy.base_instruction_cost,
        EnergyEventKind.BaseExecutionCost,
        tick,
        events,
      );
      this.#dissipateEnergy(
        organism,
        this.#maintenanceCost(organism.genome.length),
        EnergyEventKind.GenomeMaintenanceCost,
        tick,
        events,
      );
      organism.age_ticks = addSafe(organism.age_ticks, 1, "organism age");

      if (organism.energy === 0 && this.#organisms.has(organism.id)) {
        this.#killOrganism(organism, DeathCause.Energy, tick, events);
      }
    }

    this.#completedTick = tick;
    this.#activeBucketNumber = null;
    if (this.#organisms.size === 0) {
      this.#terminalReason = "extinction";
    } else if (tick >= this.configuration.duration.completed_ticks) {
      this.#terminalReason = "completed";
    }

    this.assertInvariants();
    for (const event of events) {
      Object.freeze(event);
    }
    return Object.freeze({
      tick,
      activation_order: Object.freeze([...activationOrder]),
      events: Object.freeze(events),
      population_size: this.#organisms.size,
      terminal_reason: this.#terminalReason,
    });
  }

  runUntilTerminated(): readonly TickReport[] {
    const reports: TickReport[] = [];
    while (this.#terminalReason === null) {
      reports.push(this.stepTick());
    }
    return Object.freeze(reports);
  }

  /** Pedigree identifiers below this have been verified; creation-time properties cannot change. */
  #pedigreeVerifiedThrough = 0;
  /**
   * Decision 0018. Rolling digests folded one record at a time, so the state hash never
   * re-serialises pedigree history. Births fold creation-time fields once, when the record first
   * appears; deaths fold at the single site a record transitions. Folding per record rather than
   * per batch keeps the digest independent of how often the hash is taken.
   */
  #lineagePedigreeDigest = "";
  /**
   * Deaths are combined by XOR rather than sequentially, so the digest does not depend on the
   * order deaths occurred. That is required for checkpoint restore: a checkpoint preserves the
   * records but not the event order, so an order-dependent fold could not be rebuilt and a resumed
   * run would hash differently from an uninterrupted one.
   */
  #lineageDeathAccumulator = new Uint8Array(32);
  #pedigreeDigestThrough = 0;
  /** Records carrying a death tick, maintained where deaths are written. */
  #deadRecordCount = 0;

  assertInvariants(): void {
    // A terminal state always takes the full scan, so every completed run ends with the whole
    // registry verified and deaths independently recounted.
    const full = this.#terminalReason !== null;
    assertEngineInvariants({
      configuration: this.configuration,
      grid: this.grid,
      organisms: this.#organisms,
      lineageRecords: this.#lineageRecords,
      counters: this.#counters,
      resources: this.#resources,
      completedTick: this.#completedTick,
      terminalReason: this.#terminalReason,
      nextOrganismId: this.#nextOrganismId,
      nextTaskId: this.#nextTaskId,
      ...(full
        ? {}
        : {
            pedigreeVerifiedThrough: this.#pedigreeVerifiedThrough,
            deadRecordCount: this.#deadRecordCount,
          }),
    });
    this.#pedigreeVerifiedThrough = this.#nextOrganismId;
  }

  #initialisePopulation(fixture: AncestorFixture): void {
    const materialised: Omit<MaterialisedAncestor, "coordinate">[] = [];
    for (const ancestor of fixture.ancestors) {
      for (let index = 0; index < ancestor.count; index += 1) {
        materialised.push({
          lineage: ancestor.lineage,
          genome: ancestor.genome,
          initial_energy: ancestor.initial_energy,
        });
      }
    }

    let coordinates: Coordinate[];
    const placement = this.configuration.initial_population.placement_algorithm;
    if (placement === "shuffled_cells") {
      const cellIndices = Array.from({ length: this.grid.cellCount }, (_, index) => index);
      this.#random.shuffleInPlace(cellIndices);
      coordinates = cellIndices
        .slice(0, materialised.length)
        .map((cellIndex) => fromCellIndex(cellIndex, this.grid.width, this.grid.height));
    } else if (placement === "fixed") {
      coordinates = fixture.ancestors.flatMap((ancestor) => ancestor.coordinates ?? []);
    } else {
      const region = fixture.focal_region;
      if (region === undefined) {
        throw new EngineInvariantError("Seeded focal-region placement is missing its region.");
      }
      const focalAncestor = fixture.ancestors[region.focal_ancestor_index];
      if (focalAncestor === undefined) {
        throw new EngineInvariantError("Seeded focal-region ancestor is missing.");
      }
      const regionCellIndices: number[] = [];
      for (let offsetY = 0; offsetY < region.height; offsetY += 1) {
        for (let offsetX = 0; offsetX < region.width; offsetX += 1) {
          const x = (region.origin.x + offsetX) % this.grid.width;
          const y = (region.origin.y + offsetY) % this.grid.height;
          regionCellIndices.push(y * this.grid.width + x);
        }
      }
      this.#random.shuffleInPlace(regionCellIndices);
      const focalCellIndices = regionCellIndices.slice(0, focalAncestor.count);
      const focalCells = new Set(focalCellIndices);
      const backgroundCellIndices = Array.from(
        { length: this.grid.cellCount },
        (_, index) => index,
      ).filter((index) => !focalCells.has(index));
      this.#random.shuffleInPlace(backgroundCellIndices);
      let backgroundOffset = 0;
      coordinates = fixture.ancestors.flatMap((ancestor, ancestorIndex) => {
        if (ancestorIndex === region.focal_ancestor_index) {
          return focalCellIndices.map((cellIndex) =>
            fromCellIndex(cellIndex, this.grid.width, this.grid.height),
          );
        }
        const assigned = backgroundCellIndices.slice(
          backgroundOffset,
          backgroundOffset + ancestor.count,
        );
        backgroundOffset += ancestor.count;
        return assigned.map((cellIndex) =>
          fromCellIndex(cellIndex, this.grid.width, this.grid.height),
        );
      });
    }

    materialised.forEach((ancestor, index) => {
      const coordinate = coordinates[index];
      if (coordinate === undefined) {
        throw new EngineInvariantError("Initial placement did not produce enough coordinates.");
      }
      const organismId = this.#reserveOrganismId();
      const organism: OrganismState = {
        id: organismId,
        parent_id: null,
        lineage: ancestor.lineage,
        generation: 0,
        coordinate: Object.freeze({ ...coordinate }),
        genome: [...ancestor.genome],
        vm: createVmState(this.#nextTask()),
        energy: ancestor.initial_energy,
        age_ticks: 0,
        reproduction_cooldown: 0,
        behaviour_buckets: createBehaviourWindow(this.configuration.measurement.bucket_count),
      };
      this.grid.place(organismId, coordinate);
      this.#organisms.set(organismId, organism);
      this.#lineageRecords.set(organismId, {
        organism_id: organismId,
        parent_id: null,
        lineage: organism.lineage,
        generation: 0,
        birth_tick: 0,
        death_tick: null,
        death_cause: null,
      });
      this.#counters.initial_energy = addSafe(
        this.#counters.initial_energy,
        organism.energy,
        "initial energy",
      );
    });
  }

  #regenerateResources(tick: number, events: EngineEvent[]): void {
    if (this.#resources === null || this.configuration.resources === undefined) {
      return;
    }
    const regeneration = this.#resources.regenerate(
      this.configuration.resources.regeneration_per_tick,
    );
    this.#counters.energy_created = addSafe(
      this.#counters.energy_created,
      regeneration.amount,
      "energy created by resource regeneration",
    );
    events.push({
      type: "resource_regeneration",
      tick,
      amount: regeneration.amount,
      replenished_cells: regeneration.replenished_cells,
      total_stock_after: this.#resources.totalStock(),
    });
  }

  #harvestResource(
    organism: OrganismState,
    tick: number,
    events: EngineEvent[],
  ): void {
    if (this.#resources === null || this.configuration.resources === undefined) {
      throw new EngineInvariantError("Resource harvest requested without resource state.");
    }
    const energyRoom = this.configuration.energy.maximum_organism_energy - organism.energy;
    const requested = Math.min(
      this.configuration.resources.harvest_per_activation,
      energyRoom,
    );
    const harvested = this.#resources.harvest(organism.coordinate, requested);
    if (harvested === 0) {
      return;
    }
    organism.energy += harvested;
    this.#counters.energy_transferred = addSafe(
      this.#counters.energy_transferred,
      harvested,
      "energy transferred by resource harvest",
    );
    const bucket = this.#currentBucket(organism);
    bucket.energy_transferred = addSafe(
      bucket.energy_transferred,
      harvested,
      "bucket energy transferred by resource harvest",
    );
    events.push({
      type: "energy",
      tick,
      kind: EnergyEventKind.ResourceHarvest,
      organism_id: organism.id,
      amount: harvested,
    });
  }

  #applyVmEffect(
    organism: OrganismState,
    effect: VmEffect,
    tick: number,
    events: EngineEvent[],
  ): void {
    switch (effect.kind) {
      case "none":
        return;
      case "output":
        this.#applyOutput(organism, effect, tick, events);
        return;
      case "copy_request":
        this.#attemptCopy(organism, tick, events);
        return;
      case "exec_nbr_request":
        this.#attemptExecNbr(organism, tick, events);
        return;
      case "splice_request":
        this.#attemptSplice(organism, tick, events);
        return;
    }
  }

  #applyOutput(
    organism: OrganismState,
    effect: Extract<VmEffect, { kind: "output" }>,
    tick: number,
    events: EngineEvent[],
  ): void {
    if (!effect.rewarded || effect.operation === null) {
      return;
    }
    const credited = this.#creditEnergy(
      organism,
      effect.reward_energy,
      EnergyEventKind.ComputationReward,
      tick,
      events,
    );
    this.#counters.computation_rewards = addSafe(
      this.#counters.computation_rewards,
      1,
      "computation rewards",
    );
    const bucket = this.#currentBucket(organism);
    const key = this.#rewardBucketKey(effect.operation);
    bucket[key] = addSafe(bucket[key], 1, key);
    events.push({
      type: "computation_reward",
      tick,
      organism_id: organism.id,
      operation: effect.operation,
      requested_energy: effect.reward_energy,
      credited_energy: credited,
    });
  }

  #attemptCopy(organism: OrganismState, tick: number, events: EngineEvent[]): void {
    this.#beginAttempt(organism, EcologicalOperation.Copy);
    if (organism.reproduction_cooldown > 0) {
      this.#finishAttempt(
        organism,
        EcologicalOperation.Copy,
        EcologicalResultCode.Cooldown,
        tick,
        events,
      );
      return;
    }

    const destination = this.grid.firstEmptyCardinal(
      organism.coordinate,
      directionFromRegister(organism.vm.register_a),
    );
    if (destination === null) {
      this.#finishAttempt(
        organism,
        EcologicalOperation.Copy,
        EcologicalResultCode.NoEmptyCell,
        tick,
        events,
      );
      return;
    }

    const required = this.#safeEnergyRequirement(
      this.configuration.energy.autonomous_reproduction_cost,
      this.configuration.energy.offspring_endowment,
    );
    if (organism.energy < required) {
      this.#finishAttempt(
        organism,
        EcologicalOperation.Copy,
        EcologicalResultCode.InsufficientCallerEnergy,
        tick,
        events,
      );
      return;
    }

    const childId = this.#reserveOrganismId();
    this.#dissipateEnergy(
      organism,
      this.configuration.energy.autonomous_reproduction_cost,
      EnergyEventKind.AutonomousReproductionCost,
      tick,
      events,
    );
    this.#transferEnergy(
      organism,
      this.configuration.energy.offspring_endowment,
      childId,
      tick,
      events,
    );
    this.#createOffspring(organism, childId, destination, "autonomous", tick, events);
    this.#finishAttempt(
      organism,
      EcologicalOperation.Copy,
      EcologicalResultCode.Success,
      tick,
      events,
      { child_id: childId },
    );
  }

  #attemptExecNbr(organism: OrganismState, tick: number, events: EngineEvent[]): void {
    this.#beginAttempt(organism, EcologicalOperation.ExecNbr);
    this.#dissipateEnergy(
      organism,
      this.configuration.energy.exec_nbr_attempt_cost,
      EnergyEventKind.ExecNbrAttemptCost,
      tick,
      events,
    );
    if (organism.energy === 0) {
      this.#finishAttempt(
        organism,
        EcologicalOperation.ExecNbr,
        EcologicalResultCode.InsufficientCallerEnergy,
        tick,
        events,
      );
      return;
    }

    const donorSearchDirection = directionFromRegister(organism.vm.register_a);
    const donorSelection = this.grid.firstOccupiedCardinal(
      organism.coordinate,
      donorSearchDirection,
    );
    if (donorSelection === null || donorSelection.organism_id === organism.id) {
      this.#finishAttempt(
        organism,
        EcologicalOperation.ExecNbr,
        EcologicalResultCode.NoNeighbour,
        tick,
        events,
      );
      return;
    }
    const donorDirection = donorSelection.direction;
    const donorId = donorSelection.organism_id;
    const donor = this.#requiredOrganism(donorId);
    if (!this.#donorProvidesCopy(organism, donor)) {
      const donorCopyRule =
        this.configuration.exploitation?.donor_copy_rule ?? "addressed_locus";
      this.#finishAttempt(
        organism,
        EcologicalOperation.ExecNbr,
        donorCopyRule === "addressed_locus"
          ? EcologicalResultCode.DonorLocusNotCopy
          : EcologicalResultCode.DonorCopyAbsent,
        tick,
        events,
        { donor_id: donorId },
      );
      return;
    }
    if (organism.reproduction_cooldown > 0) {
      this.#finishAttempt(
        organism,
        EcologicalOperation.ExecNbr,
        EcologicalResultCode.Cooldown,
        tick,
        events,
        { donor_id: donorId },
      );
      return;
    }

    const destination = this.grid.firstEmptyCardinal(
      organism.coordinate,
      rotateDirection(donorDirection, 1),
    );
    if (destination === null) {
      this.#finishAttempt(
        organism,
        EcologicalOperation.ExecNbr,
        EcologicalResultCode.NoEmptyCell,
        tick,
        events,
        { donor_id: donorId },
      );
      return;
    }
    const requiredDonorEnergy = this.#safeEnergyRequirement(
      this.configuration.energy.offspring_endowment,
      this.configuration.energy.exploit_levy,
    );
    if (donor.energy < requiredDonorEnergy) {
      this.#finishAttempt(
        organism,
        EcologicalOperation.ExecNbr,
        EcologicalResultCode.InsufficientDonorEnergy,
        tick,
        events,
        { donor_id: donorId },
      );
      return;
    }

    const childId = this.#reserveOrganismId();
    this.#transferEnergy(
      donor,
      this.configuration.energy.offspring_endowment,
      childId,
      tick,
      events,
    );
    this.#dissipateEnergy(
      donor,
      this.configuration.energy.exploit_levy,
      EnergyEventKind.ExploitLevy,
      tick,
      events,
    );
    const callerBucket = this.#currentBucket(organism);
    const donorBucket = this.#currentBucket(donor);
    callerBucket.exploit_energy_obtained = addSafe(
      callerBucket.exploit_energy_obtained,
      this.configuration.energy.offspring_endowment,
      "exploit energy obtained",
    );
    donorBucket.exploit_energy_lost = addSafe(
      donorBucket.exploit_energy_lost,
      requiredDonorEnergy,
      "exploit energy lost",
    );

    this.#createOffspring(
      organism,
      childId,
      destination,
      "exploitative",
      tick,
      events,
      donorId,
    );
    if (donor.energy === 0) {
      this.#killOrganism(donor, DeathCause.Exploitation, tick, events);
    }
    this.#finishAttempt(
      organism,
      EcologicalOperation.ExecNbr,
      EcologicalResultCode.Success,
      tick,
      events,
      { donor_id: donorId, child_id: childId },
    );
  }

  #donorProvidesCopy(caller: OrganismState, donor: OrganismState): boolean {
    const addressedLocus = caller.vm.register_b % donor.genome.length;
    const rule =
      this.configuration.exploitation?.donor_copy_rule ?? "addressed_locus";
    if (rule === "addressed_locus") {
      return donor.genome[addressedLocus] === Opcode.COPY;
    }
    for (let offset = 0; offset < donor.genome.length; offset += 1) {
      const locus = (addressedLocus + offset) % donor.genome.length;
      if (donor.genome[locus] === Opcode.COPY) {
        return true;
      }
    }
    return false;
  }

  #attemptSplice(organism: OrganismState, tick: number, events: EngineEvent[]): void {
    this.#beginAttempt(organism, EcologicalOperation.Splice);
    this.#dissipateEnergy(
      organism,
      this.configuration.energy.splice_attempt_cost,
      EnergyEventKind.SpliceAttemptCost,
      tick,
      events,
    );
    if (organism.energy === 0) {
      this.#finishAttempt(
        organism,
        EcologicalOperation.Splice,
        EcologicalResultCode.InsufficientCallerEnergy,
        tick,
        events,
      );
      return;
    }

    const donorDirection = directionFromRegister(organism.vm.register_a);
    const donorId = this.grid.occupantInDirection(organism.coordinate, donorDirection);
    if (donorId === null || donorId === organism.id) {
      this.#finishAttempt(
        organism,
        EcologicalOperation.Splice,
        EcologicalResultCode.NoNeighbour,
        tick,
        events,
      );
      return;
    }
    const donor = this.#requiredOrganism(donorId);
    if (!this.#random.bernoulli(this.configuration.hgt.success_probability)) {
      this.#finishAttempt(
        organism,
        EcologicalOperation.Splice,
        EcologicalResultCode.HgtTrialFailed,
        tick,
        events,
        { donor_id: donorId },
      );
      return;
    }

    const chunkLength =
      this.configuration.hgt.min_chunk_length +
      this.#random.uniformInt(
        this.configuration.hgt.max_chunk_length - this.configuration.hgt.min_chunk_length + 1,
      );
    const donorStart = this.#random.uniformInt(donor.genome.length);
    const chunk = Array.from(
      { length: chunkLength },
      (_, offset) => donor.genome[(donorStart + offset) % donor.genome.length] as number,
    );
    const insertionBoundary = this.#random.uniformInt(organism.genome.length + 1);

    if (organism.genome.length + chunk.length > this.configuration.reproduction.max_genome_length) {
      this.#finishAttempt(
        organism,
        EcologicalOperation.Splice,
        EcologicalResultCode.GenomeCapacity,
        tick,
        events,
        { donor_id: donorId },
      );
      return;
    }
    if (organism.energy < this.configuration.energy.splice_success_cost) {
      this.#finishAttempt(
        organism,
        EcologicalOperation.Splice,
        EcologicalResultCode.InsufficientCallerEnergy,
        tick,
        events,
        { donor_id: donorId },
      );
      return;
    }

    this.#dissipateEnergy(
      organism,
      this.configuration.energy.splice_success_cost,
      EnergyEventKind.SpliceSuccessCost,
      tick,
      events,
    );
    const nextInstructionPointer = organism.vm.instruction_pointer;
    organism.genome.splice(insertionBoundary, 0, ...chunk);
    if (insertionBoundary <= nextInstructionPointer) {
      organism.vm.instruction_pointer = nextInstructionPointer + chunk.length;
    }
    events.push({
      type: "hgt_transfer",
      tick,
      organism_id: organism.id,
      donor_id: donorId,
      donor_start_locus: donorStart,
      insertion_boundary: insertionBoundary,
      chunk: Object.freeze([...chunk]),
    });
    this.#finishAttempt(
      organism,
      EcologicalOperation.Splice,
      EcologicalResultCode.Success,
      tick,
      events,
      { donor_id: donorId },
    );
  }

  #beginAttempt(organism: OrganismState, operation: EcologicalOperationValue): void {
    const bucket = this.#currentBucket(organism);
    switch (operation) {
      case EcologicalOperation.Copy:
        bucket.autonomous_attempts = addSafe(
          bucket.autonomous_attempts,
          1,
          "autonomous attempts",
        );
        this.#counters.autonomous_attempts = addSafe(
          this.#counters.autonomous_attempts,
          1,
          "autonomous attempts",
        );
        break;
      case EcologicalOperation.ExecNbr:
        bucket.exploitative_attempts = addSafe(
          bucket.exploitative_attempts,
          1,
          "exploitative attempts",
        );
        this.#counters.exploitative_attempts = addSafe(
          this.#counters.exploitative_attempts,
          1,
          "exploitative attempts",
        );
        break;
      case EcologicalOperation.Splice:
        bucket.hgt_attempts = addSafe(bucket.hgt_attempts, 1, "HGT attempts");
        this.#counters.hgt_attempts = addSafe(this.#counters.hgt_attempts, 1, "HGT attempts");
        break;
    }
  }

  #finishAttempt(
    organism: OrganismState,
    operation: EcologicalOperationValue,
    result: EcologicalResultCodeValue,
    tick: number,
    events: EngineEvent[],
    details: AttemptDetails = {},
  ): void {
    const bucket = this.#currentBucket(organism);
    bucket.result_counts[result] = addSafe(bucket.result_counts[result], 1, `${result} results`);
    if (result === EcologicalResultCode.Success) {
      switch (operation) {
        case EcologicalOperation.Copy:
          bucket.autonomous_successes = addSafe(
            bucket.autonomous_successes,
            1,
            "autonomous successes",
          );
          this.#counters.autonomous_successes = addSafe(
            this.#counters.autonomous_successes,
            1,
            "autonomous successes",
          );
          break;
        case EcologicalOperation.ExecNbr:
          bucket.exploitative_successes = addSafe(
            bucket.exploitative_successes,
            1,
            "exploitative successes",
          );
          this.#counters.exploitative_successes = addSafe(
            this.#counters.exploitative_successes,
            1,
            "exploitative successes",
          );
          break;
        case EcologicalOperation.Splice:
          bucket.hgt_successes = addSafe(bucket.hgt_successes, 1, "HGT successes");
          this.#counters.hgt_successes = addSafe(
            this.#counters.hgt_successes,
            1,
            "HGT successes",
          );
          break;
      }
    }
    events.push({
      type: "ecological_attempt",
      tick,
      operation,
      organism_id: organism.id,
      result,
      ...(details.donor_id === undefined ? {} : { donor_id: details.donor_id }),
      ...(details.child_id === undefined ? {} : { child_id: details.child_id }),
    });
  }

  #createOffspring(
    parent: OrganismState,
    childId: number,
    destination: Coordinate,
    pathway: "autonomous" | "exploitative",
    tick: number,
    events: EngineEvent[],
    donorId?: number,
  ): OrganismState {
    const mutation = mutateCopiedGenome(
      parent.genome,
      this.configuration.reproduction,
      this.#random,
    );
    this.#recordMutations(parent, childId, mutation, tick, events);
    parent.vm = resetReproductiveCycle(parent.vm, this.#nextTask());
    const child: OrganismState = {
      id: childId,
      parent_id: parent.id,
      lineage: parent.lineage,
      generation: addSafe(parent.generation, 1, "generation"),
      coordinate: Object.freeze({ ...destination }),
      genome: mutation.genome,
      vm: createVmState(this.#nextTask()),
      energy: this.configuration.energy.offspring_endowment,
      age_ticks: 0,
      reproduction_cooldown: 0,
      behaviour_buckets: createBehaviourWindow(this.configuration.measurement.bucket_count),
    };
    this.#prepareCurrentBucket(child);
    parent.reproduction_cooldown = this.configuration.reproduction.cooldown_ticks;
    this.grid.place(child.id, destination);
    this.#organisms.set(child.id, child);
    this.#lineageRecords.set(child.id, {
      organism_id: child.id,
      parent_id: parent.id,
      lineage: child.lineage,
      generation: child.generation,
      birth_tick: tick,
      death_tick: null,
      death_cause: null,
    });
    this.#counters.births = addSafe(this.#counters.births, 1, "births");
    events.push({
      type: "birth",
      tick,
      pathway,
      caller_id: parent.id,
      ...(donorId === undefined ? {} : { donor_id: donorId }),
      child_id: child.id,
      destination: Object.freeze({ ...destination }),
      offspring_endowment: child.energy,
    });
    return child;
  }

  #recordMutations(
    parent: OrganismState,
    childId: number,
    outcome: MutationOutcome,
    tick: number,
    events: EngineEvent[],
  ): void {
    const bucket = this.#currentBucket(parent);
    for (const record of outcome.records) {
      this.#incrementMutationCounters(record, bucket);
      events.push({
        type: "mutation",
        tick,
        parent_id: parent.id,
        child_id: childId,
        mutation_class: record.mutation_class,
        original_locus: record.original_locus,
        accepted: record.accepted,
        result: record.result,
        ...(record.previous_opcode === undefined
          ? {}
          : { previous_opcode: record.previous_opcode }),
        ...(record.new_opcode === undefined ? {} : { new_opcode: record.new_opcode }),
      });
    }
  }

  #incrementMutationCounters(record: MutationRecord, bucket: BehaviourBucket): void {
    const mutationClass = record.mutation_class;
    this.#counters.mutation_attempted[mutationClass] = addSafe(
      this.#counters.mutation_attempted[mutationClass],
      1,
      `${mutationClass} mutations attempted`,
    );
    const statusCounters = record.accepted
      ? this.#counters.mutation_accepted
      : this.#counters.mutation_rejected;
    statusCounters[mutationClass] = addSafe(
      statusCounters[mutationClass],
      1,
      `${mutationClass} mutation result`,
    );
    if (!record.accepted) {
      bucket.result_counts[record.result] = addSafe(
        bucket.result_counts[record.result],
        1,
        `${record.result} mutation results`,
      );
    }

    switch (mutationClass) {
      case MutationClass.Point:
        if (record.accepted) {
          bucket.mutation_point_accepted = addSafe(
            bucket.mutation_point_accepted,
            1,
            "accepted point mutations",
          );
        } else {
          bucket.mutation_point_rejected = addSafe(
            bucket.mutation_point_rejected,
            1,
            "rejected point mutations",
          );
        }
        break;
      case MutationClass.Insertion:
        if (record.accepted) {
          bucket.mutation_insertion_accepted = addSafe(
            bucket.mutation_insertion_accepted,
            1,
            "accepted insertions",
          );
        } else {
          bucket.mutation_insertion_rejected = addSafe(
            bucket.mutation_insertion_rejected,
            1,
            "rejected insertions",
          );
        }
        break;
      case MutationClass.Deletion:
        if (record.accepted) {
          bucket.mutation_deletion_accepted = addSafe(
            bucket.mutation_deletion_accepted,
            1,
            "accepted deletions",
          );
        } else {
          bucket.mutation_deletion_rejected = addSafe(
            bucket.mutation_deletion_rejected,
            1,
            "rejected deletions",
          );
        }
        break;
    }
  }

  #creditEnergy(
    organism: OrganismState,
    requested: number,
    kind: EnergyEventKindValue,
    tick: number,
    events: EngineEvent[],
  ): number {
    return creditEnergy(this.#energyAccountingContext(), organism, requested, kind, tick, events);
  }

  #dissipateEnergy(
    organism: OrganismState,
    requested: number,
    kind: EnergyEventKindValue,
    tick: number,
    events: EngineEvent[],
  ): number {
    return dissipateEnergy(
      this.#energyAccountingContext(),
      organism,
      requested,
      kind,
      tick,
      events,
    );
  }

  #transferEnergy(
    source: OrganismState,
    amount: number,
    counterpartyId: number,
    tick: number,
    events: EngineEvent[],
  ): void {
    transferEnergy(
      this.#energyAccountingContext(),
      source,
      amount,
      counterpartyId,
      tick,
      events,
    );
  }

  #killOrganism(
    organism: OrganismState,
    cause: DeathCauseValue,
    tick: number,
    events: EngineEvent[],
  ): void {
    if (!this.#organisms.has(organism.id)) {
      return;
    }
    const discarded = discardEnergy(
      this.#energyAccountingContext(),
      organism,
      tick,
      events,
    );

    const removedCoordinate = this.grid.removeOrganism(organism.id);
    if (removedCoordinate === null || !this.#organisms.delete(organism.id)) {
      throw new EngineInvariantError(`Failed to remove organism ${organism.id}.`);
    }
    const lineageRecord = this.#lineageRecords.get(organism.id);
    if (lineageRecord === undefined || lineageRecord.death_tick !== null) {
      throw new EngineInvariantError(`Missing or already-dead lineage record for ${organism.id}.`);
    }
    lineageRecord.death_tick = tick;
    lineageRecord.death_cause = cause;
    this.#deadRecordCount += 1;
    this.#xorDeathDigest(lineageRecord.organism_id, tick, cause);
    // Death is the only transition a pedigree record undergoes, and this is the only place it is
    // written, so the transition properties are checked here rather than by rescanning history.
    if (
      lineageRecord.death_tick < lineageRecord.birth_tick ||
      lineageRecord.death_tick > this.#completedTick + 1
    ) {
      throw new EngineInvariantError(
        `Organism ${lineageRecord.organism_id} has an invalid death tick.`,
      );
    }
    if (this.#organisms.has(lineageRecord.organism_id)) {
      throw new EngineInvariantError(
        `Dead organism ${lineageRecord.organism_id} remains in the live population.`,
      );
    }
    switch (cause) {
      case DeathCause.Exogenous:
        this.#counters.deaths_exogenous = addSafe(
          this.#counters.deaths_exogenous,
          1,
          "exogenous deaths",
        );
        break;
      case DeathCause.Energy:
        this.#counters.deaths_energy = addSafe(
          this.#counters.deaths_energy,
          1,
          "energy deaths",
        );
        break;
      case DeathCause.Exploitation:
        this.#counters.deaths_exploitation = addSafe(
          this.#counters.deaths_exploitation,
          1,
          "exploitation deaths",
        );
        break;
    }
    events.push({
      type: "death",
      tick,
      organism_id: organism.id,
      cause,
      energy_discarded: discarded,
    });
  }

  #prepareCurrentBucket(organism: OrganismState): void {
    if (this.#activeBucketNumber === null) {
      throw new EngineInvariantError("No active behavioural bucket is prepared.");
    }
    prepareBehaviourBucket(
      organism,
      this.#activeBucketNumber,
      this.configuration.measurement.bucket_count,
    );
  }

  #currentBucket(organism: OrganismState): BehaviourBucket {
    return currentBehaviourBucket(
      organism,
      this.#activeBucketNumber,
      this.configuration.measurement.bucket_count,
    );
  }

  #maintenanceCost(genomeLength: number): number {
    return maintenanceCost(this.configuration, genomeLength);
  }

  #safeEnergyRequirement(first: number, second: number): number {
    return safeEnergyRequirement(first, second);
  }

  #energyAccountingContext(): EnergyAccountingContext {
    return {
      configuration: this.configuration,
      counters: this.#counters,
      currentBucket: (organism) => this.#currentBucket(organism),
    };
  }

  #nextTask(): ComputationTask {
    const taskId = this.#nextTaskId;
    this.#nextTaskId = addSafe(this.#nextTaskId, 1, "next task identifier");
    return {
      id: taskId,
      input_a: this.#random.uniformInt(256),
      input_b: this.#random.uniformInt(256),
    };
  }

  #reserveOrganismId(): number {
    const organismId = this.#nextOrganismId;
    this.#nextOrganismId = addSafe(
      this.#nextOrganismId,
      1,
      "next organism identifier",
    );
    return organismId;
  }

  #requiredOrganism(organismId: number): OrganismState {
    const organism = this.#organisms.get(organismId);
    if (organism === undefined) {
      throw new EngineInvariantError(`Grid references missing organism ${organismId}.`);
    }
    return organism;
  }

  #rewardBucketKey(
    operation: ComputationOperationValue,
  ): "rewarded_and" | "rewarded_xor" | "rewarded_equ" | "rewarded_add" {
    switch (operation) {
      case ComputationOperation.And:
        return "rewarded_and";
      case ComputationOperation.Xor:
        return "rewarded_xor";
      case ComputationOperation.Equ:
        return "rewarded_equ";
      case ComputationOperation.Add:
        return "rewarded_add";
    }
  }
}
