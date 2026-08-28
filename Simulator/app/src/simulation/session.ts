import {
  canonicalJson,
  FunctionalClass,
  Lineage,
  measureOrganismBehaviour,
  parseEngineConfig,
  sha256,
  SimulationEngine,
  type DeepReadonly,
  type EngineConfig,
  type EngineEvent,
  type ImmutableEngineConfig,
  type OrganismState,
  type PopulationMeasurement,
  type RunCounters,
  type LocalResourceCounters,
  type TerminalReason,
} from "@tierra-sim/engine";

export interface BrowserSample {
  readonly tick: number;
  readonly population_total: number;
  readonly host_population: number;
  readonly parasite_population: number;
  readonly interval_births: number;
  readonly interval_hgt_attempts: number;
  readonly interval_hgt_successes: number;
  readonly eligible_count: number | null;
  readonly mean_divergence: number | null;
  readonly inactive_proportion: number | null;
}

export interface BrowserOrganism {
  readonly state: DeepReadonly<OrganismState>;
  readonly functional_class: FunctionalClass;
  readonly autonomous_successes: number;
  readonly exploitative_successes: number;
  readonly informative_actions: number;
  readonly exploitative_tendency: number | null;
  readonly divergence: number | null;
  readonly hgt_attempts: number;
  readonly hgt_successes: number;
}

export type BrowserEventCategory =
  | "birth"
  | "exploitation"
  | "hgt"
  | "mutation"
  | "computation"
  | "death"
  | "system";

export interface BrowserEvent {
  readonly sequence: number;
  readonly tick: number;
  readonly category: BrowserEventCategory;
  readonly summary: string;
  readonly participant_ids: readonly number[];
  readonly discovery: boolean;
}

export interface BrowserSnapshot {
  readonly completed_tick: number;
  readonly requested_ticks: number;
  readonly terminal_reason: TerminalReason | null;
  readonly configuration_id: string;
  readonly state_hash: string;
  readonly width: number;
  readonly height: number;
  readonly occupancy: readonly (number | null)[];
  readonly organisms: readonly BrowserOrganism[];
  readonly functional_counts: Readonly<Record<FunctionalClass, number>>;
  readonly population_total: number;
  readonly host_population: number;
  readonly parasite_population: number;
  readonly total_energy: number;
  readonly organisms_ever_born: number;
  readonly ancestor_count: number;
  readonly maximum_organism_energy: number;
  readonly resource_stocks: readonly number[] | null;
  readonly resource_cell_capacity: number | null;
  readonly resource_total_stock: number | null;
  readonly resource_stock_proportion: number | null;
  readonly resource_counters: DeepReadonly<LocalResourceCounters> | null;
  readonly counters: DeepReadonly<RunCounters>;
  readonly latest_formal_measurement: PopulationMeasurement | null;
  readonly samples: readonly BrowserSample[];
  readonly recent_events: readonly BrowserEvent[];
}

export interface SessionOverrides {
  readonly seed?: number;
  readonly completed_ticks?: number;
  readonly world_width?: number;
  readonly world_height?: number;
}

function cloneConfiguration(configuration: EngineConfig): EngineConfig {
  return structuredClone(configuration);
}

function counterDifference(current: number, previous: number, label: string): number {
  const difference = current - previous;
  if (!Number.isSafeInteger(difference) || difference < 0) {
    throw new Error(`${label} counter moved backwards or overflowed.`);
  }
  return difference;
}

function browserSample(
  measurement: PopulationMeasurement,
  previousCounters: Readonly<RunCounters>,
): BrowserSample {
  const current = measurement.cumulative_counters;
  return {
    tick: measurement.tick,
    population_total: measurement.state.population_total,
    host_population: measurement.state.host_population,
    parasite_population: measurement.state.parasite_population,
    interval_births: counterDifference(current.births, previousCounters.births, "Birth"),
    interval_hgt_attempts: counterDifference(
      current.hgt_attempts,
      previousCounters.hgt_attempts,
      "HGT attempt",
    ),
    interval_hgt_successes: counterDifference(
      current.hgt_successes,
      previousCounters.hgt_successes,
      "HGT success",
    ),
    eligible_count: measurement.divergence?.total.eligible_count ?? null,
    mean_divergence: measurement.divergence?.total.mean_divergence ?? null,
    inactive_proportion: measurement.divergence?.total.inactive_proportion ?? null,
  };
}

function sumBuckets(
  organism: DeepReadonly<OrganismState>,
  key: "hgt_attempts" | "hgt_successes",
): number {
  return organism.behaviour_buckets.reduce((total, bucket) => total + bucket[key], 0);
}

export class BrowserSimulationSession {
  readonly configuration: ImmutableEngineConfig;

  #engine: SimulationEngine;
  #samples: BrowserSample[] = [];
  #latestFormalMeasurement: PopulationMeasurement | null = null;
  #previousSampleCounters: DeepReadonly<RunCounters>;
  #recentEvents: BrowserEvent[] = [];
  #eventSequence = 0;
  #discoveries = new Set<string>();

  private constructor(configuration: ImmutableEngineConfig, fixture: unknown) {
    const fixtureDigest = sha256(canonicalJson(fixture));
    if (fixtureDigest !== configuration.initial_population.fixture_sha256) {
      throw new Error(
        `Ancestor fixture digest mismatch: expected ${configuration.initial_population.fixture_sha256}, received ${fixtureDigest}.`,
      );
    }
    this.configuration = configuration;
    this.#engine = SimulationEngine.create(configuration, fixture);
    this.#previousSampleCounters = this.#engine.countersSnapshot();
    this.#appendEvent({
      tick: 0,
      category: "system",
      summary: `Initialised ${this.#engine.populationSize} ancestors in a ${configuration.world.width} × ${configuration.world.height} world.`,
      participant_ids: [],
      discovery: false,
    });
  }

  static create(
    configurationInput: EngineConfig,
    fixture: unknown,
    overrides: SessionOverrides = {},
  ): BrowserSimulationSession {
    const configuration = cloneConfiguration(configurationInput);
    if (overrides.seed !== undefined) {
      configuration.identity.seed = overrides.seed;
    }
    if (overrides.completed_ticks !== undefined) {
      configuration.duration.completed_ticks = overrides.completed_ticks;
    }
    if (overrides.world_width !== undefined) {
      configuration.world.width = overrides.world_width;
    }
    if (overrides.world_height !== undefined) {
      configuration.world.height = overrides.world_height;
    }
    return new BrowserSimulationSession(parseEngineConfig(configuration), fixture);
  }

  get terminalReason(): TerminalReason | null {
    return this.#engine.terminalReason;
  }

  step(tickCount = 1): BrowserSnapshot {
    if (!Number.isSafeInteger(tickCount) || tickCount <= 0) {
      throw new RangeError("Tick count must be a positive safe integer.");
    }
    for (let index = 0; index < tickCount && this.#engine.terminalReason === null; index += 1) {
      const report = this.#engine.stepTick();
      this.#recordEvents(report.events);
      this.#recordFunctionalDiscoveries(report.tick);
      const scheduled =
        report.tick % this.configuration.duration.sample_every_ticks === 0;
      if (scheduled) {
        this.#recordMeasurement(this.#engine.populationMeasurement("scheduled"));
      } else if (report.terminal_reason !== null) {
        this.#recordMeasurement(this.#engine.populationMeasurement("terminal"));
      }
    }
    return this.snapshot();
  }

  runUntilTerminated(): BrowserSnapshot {
    while (this.#engine.terminalReason === null) {
      this.step(Math.min(1_000, this.configuration.duration.completed_ticks));
    }
    return this.snapshot();
  }

  snapshot(): BrowserSnapshot {
    const organisms = this.#engine.organismIds().map((organismId) => {
      const state = this.#engine.organismSnapshot(organismId);
      if (state === null) {
        throw new Error(`Living organism ${organismId} has no state snapshot.`);
      }
      const behaviour = measureOrganismBehaviour(
        state as Readonly<OrganismState>,
        this.configuration.measurement.informative_action_threshold,
        this.configuration.measurement.functional_class_boundaries,
      );
      return {
        state,
        functional_class: behaviour.functional_class,
        autonomous_successes: behaviour.autonomous_successes,
        exploitative_successes: behaviour.exploitative_successes,
        informative_actions: behaviour.informative_actions,
        exploitative_tendency: behaviour.exploitative_tendency,
        divergence: behaviour.divergence,
        hgt_attempts: sumBuckets(state, "hgt_attempts"),
        hgt_successes: sumBuckets(state, "hgt_successes"),
      };
    });
    const hostPopulation = organisms.filter(
      (organism) => organism.state.lineage === Lineage.Host,
    ).length;
    const totalEnergy = organisms.reduce((total, organism) => total + organism.state.energy, 0);
    const functionalCounts: Record<FunctionalClass, number> = {
      [FunctionalClass.Autonomous]: 0,
      [FunctionalClass.Mixed]: 0,
      [FunctionalClass.Exploitative]: 0,
      [FunctionalClass.Inactive]: 0,
    };
    for (const organism of organisms) {
      functionalCounts[organism.functional_class] += 1;
    }
    const lineageRecords = this.#engine.lineageRecords();
    const resources = this.#engine.resourceSnapshot();
    const resourceTotalStock = resources?.stocks.reduce(
      (total, stock) => total + stock,
      0,
    ) ?? null;
    const resourceTotalCapacity =
      resources === null
        ? null
        : resources.cell_capacity * resources.stocks.length;
    return {
      completed_tick: this.#engine.completedTick,
      requested_ticks: this.configuration.duration.completed_ticks,
      terminal_reason: this.#engine.terminalReason,
      configuration_id: this.#engine.configurationId,
      state_hash: this.#engine.stateHash(),
      width: this.configuration.world.width,
      height: this.configuration.world.height,
      occupancy: this.#engine.grid.occupancySnapshot(),
      organisms,
      functional_counts: functionalCounts,
      population_total: organisms.length,
      host_population: hostPopulation,
      parasite_population: organisms.length - hostPopulation,
      total_energy: totalEnergy,
      organisms_ever_born: lineageRecords.length,
      ancestor_count: lineageRecords.filter((record) => record.parent_id === null).length,
      maximum_organism_energy: this.configuration.energy.maximum_organism_energy,
      resource_stocks: resources?.stocks ?? null,
      resource_cell_capacity: resources?.cell_capacity ?? null,
      resource_total_stock: resourceTotalStock,
      resource_stock_proportion:
        resourceTotalStock === null || resourceTotalCapacity === null
          ? null
          : resourceTotalStock / resourceTotalCapacity,
      resource_counters: resources?.counters ?? null,
      counters: this.#engine.countersSnapshot(),
      latest_formal_measurement: this.#latestFormalMeasurement,
      samples: [...this.#samples],
      recent_events: [...this.#recentEvents],
    };
  }

  #recordEvents(events: readonly EngineEvent[]): void {
    const tick = events[0]?.tick;
    if (tick === undefined) {
      return;
    }
    const autonomousBirths: number[] = [];
    const exploitativeBirths: number[] = [];
    const autonomousParticipants = new Set<number>();
    const exploitativeParticipants = new Set<number>();
    const hgtParticipants = new Set<number>();
    const mutationParticipants = new Set<number>();
    const computationParticipants = new Set<number>();
    const deathParticipants = new Set<number>();
    let hgtTransfers = 0;
    let hgtLoci = 0;
    let acceptedMutations = 0;
    let computationRewards = 0;
    let exploitationDeaths = 0;

    for (const event of events) {
      switch (event.type) {
        case "birth": {
          const exploitative = event.pathway === "exploitative";
          this.#appendDiscovery(
            `first-${event.pathway}-birth`,
            event.tick,
            exploitative ? "exploitation" : "birth",
            `First ${event.pathway} birth observed: organism ${event.child_id}.`,
            [event.caller_id, ...(event.donor_id === undefined ? [] : [event.donor_id]), event.child_id],
          );
          const births = exploitative ? exploitativeBirths : autonomousBirths;
          const participants = exploitative
            ? exploitativeParticipants
            : autonomousParticipants;
          births.push(event.child_id);
          participants.add(event.caller_id);
          participants.add(event.child_id);
          if (event.donor_id !== undefined) {
            participants.add(event.donor_id);
          }
          break;
        }
        case "hgt_transfer":
          this.#appendDiscovery(
            "first-hgt-transfer",
            event.tick,
            "hgt",
            `First successful HGT transfer: ${event.chunk.length} ${event.chunk.length === 1 ? "locus" : "loci"} entered organism ${event.organism_id}.`,
            [event.organism_id, event.donor_id],
          );
          hgtTransfers += 1;
          hgtLoci += event.chunk.length;
          hgtParticipants.add(event.organism_id);
          hgtParticipants.add(event.donor_id);
          break;
        case "mutation":
          if (event.accepted) {
            this.#appendDiscovery(
              "first-accepted-mutation",
              event.tick,
              "mutation",
              `First accepted mutation: ${event.mutation_class} in organism ${event.child_id}.`,
              [event.parent_id, event.child_id],
            );
            acceptedMutations += 1;
            mutationParticipants.add(event.parent_id);
            mutationParticipants.add(event.child_id);
          }
          break;
        case "computation_reward":
          if (event.credited_energy > 0) {
            this.#appendDiscovery(
              `first-computation-${event.operation}`,
              event.tick,
              "computation",
              `First rewarded ${event.operation.toUpperCase()} computation.`,
              [event.organism_id],
            );
            computationRewards += 1;
            computationParticipants.add(event.organism_id);
          }
          break;
        case "death":
          if (event.cause === "exploitation") {
            exploitationDeaths += 1;
            deathParticipants.add(event.organism_id);
          }
          break;
        default:
          break;
      }
    }

    const appendAggregate = (
      category: BrowserEventCategory,
      summary: string,
      participants: ReadonlySet<number>,
    ) => this.#appendEvent({
      tick,
      category,
      summary,
      participant_ids: [...participants],
      discovery: false,
    });

    if (autonomousBirths.length > 0) {
      appendAggregate(
        "birth",
        `${autonomousBirths.length} autonomous birth${autonomousBirths.length === 1 ? "" : "s"}; newest organism ${autonomousBirths.at(-1)}.`,
        autonomousParticipants,
      );
    }
    if (exploitativeBirths.length > 0) {
      appendAggregate(
        "exploitation",
        `${exploitativeBirths.length} exploitative birth${exploitativeBirths.length === 1 ? "" : "s"}; newest organism ${exploitativeBirths.at(-1)}.`,
        exploitativeParticipants,
      );
    }
    if (hgtTransfers > 0) {
      appendAggregate(
        "hgt",
        `${hgtTransfers} successful HGT transfer${hgtTransfers === 1 ? "" : "s"} moved ${hgtLoci} ${hgtLoci === 1 ? "locus" : "loci"}.`,
        hgtParticipants,
      );
    }
    if (acceptedMutations > 0) {
      appendAggregate(
        "mutation",
        `${acceptedMutations} mutation${acceptedMutations === 1 ? "" : "s"} accepted in new offspring.`,
        mutationParticipants,
      );
    }
    if (computationRewards > 0) {
      appendAggregate(
        "computation",
        `${computationRewards} rewarded computation${computationRewards === 1 ? "" : "s"}.`,
        computationParticipants,
      );
    }
    if (exploitationDeaths > 0) {
      appendAggregate(
        "death",
        `${exploitationDeaths} organism${exploitationDeaths === 1 ? "" : "s"} died through exploitation.`,
        deathParticipants,
      );
    }
  }

  #recordFunctionalDiscoveries(tick: number): void {
    if (this.#discoveries.has("first-mixed-behaviour")) {
      return;
    }
    for (const organismId of this.#engine.organismIds()) {
      const organism = this.#engine.organismSnapshot(organismId);
      if (organism === null) {
        continue;
      }
      const behaviour = measureOrganismBehaviour(
        organism as Readonly<OrganismState>,
        this.configuration.measurement.informative_action_threshold,
        this.configuration.measurement.functional_class_boundaries,
      );
      if (behaviour.functional_class === FunctionalClass.Mixed) {
        this.#appendDiscovery(
          "first-mixed-behaviour",
          tick,
          "exploitation",
          `First mixed realised behaviour: organism ${organismId} combined autonomous and exploitative births.`,
          [organismId],
        );
        return;
      }
    }
  }

  #appendDiscovery(
    key: string,
    tick: number,
    category: BrowserEventCategory,
    summary: string,
    participantIds: readonly number[],
  ): void {
    if (this.#discoveries.has(key)) {
      return;
    }
    this.#discoveries.add(key);
    this.#appendEvent({
      tick,
      category,
      summary,
      participant_ids: participantIds,
      discovery: true,
    });
  }

  #appendEvent(event: Omit<BrowserEvent, "sequence">): void {
    this.#eventSequence += 1;
    this.#recentEvents.push({ sequence: this.#eventSequence, ...event });
    if (this.#recentEvents.length > 160) {
      const removableIndex = this.#recentEvents.findIndex(
        (candidate) => !candidate.discovery && candidate.category !== "system",
      );
      this.#recentEvents.splice(Math.max(0, removableIndex), 1);
    }
  }

  #recordMeasurement(measurement: PopulationMeasurement): void {
    this.#samples.push(browserSample(measurement, this.#previousSampleCounters));
    this.#previousSampleCounters = measurement.cumulative_counters;
    if (measurement.divergence !== null) {
      this.#latestFormalMeasurement = measurement;
    }
  }
}
