import {
  canonicalJson,
  EcologicalOperation,
  EcologicalResultCode,
  Lineage,
  MutationClass,
  parseEngineConfig,
  SimulationEngine,
  type EngineEvent,
  type ImmutableEngineConfig,
  type LocalResourceCounters,
  type RunCounters,
  type TickReport,
} from "@tierra-sim/engine";

import type {
  CompletedRun,
  LineageDiagnostics,
  LineageMechanismCounters,
  MechanismCounters,
  RecordedSample,
  RetainedEngineEvent,
  RetainedCheckpoint,
} from "./types.js";
import {
  cloneLineageDiagnostics,
  emptyLineageDiagnostics,
  recordLineageDiagnosticEvent,
} from "./diagnostics.js";
import { nodeSha256 } from "./node-sha256.js";

export interface RunOptions {
  readonly configuration: unknown;
  readonly fixture: unknown;
  readonly onSample?: (sample: RecordedSample) => void;
  readonly onEvent?: (event: EngineEvent) => void;
  readonly onTick?: (report: TickReport) => void;
}

function emptyMechanismCounters(): MechanismCounters {
  return {
    autonomous_attempts: 0,
    autonomous_successes: 0,
    exploitative_attempts: 0,
    exploitative_successes: 0,
    hgt_attempts: 0,
    hgt_successes: 0,
    mutation_point_accepted: 0,
    mutation_insertion_accepted: 0,
    mutation_deletion_accepted: 0,
    computation_rewards: 0,
    births: 0,
    deaths: 0,
  };
}

function emptyLineageCounters(): LineageMechanismCounters {
  return {
    [Lineage.Host]: emptyMechanismCounters(),
    [Lineage.Parasite]: emptyMechanismCounters(),
  };
}

function cloneMechanismCounters(counters: MechanismCounters): MechanismCounters {
  return { ...counters };
}

function cloneLineageCounters(counters: LineageMechanismCounters): LineageMechanismCounters {
  return {
    [Lineage.Host]: cloneMechanismCounters(counters[Lineage.Host]),
    [Lineage.Parasite]: cloneMechanismCounters(counters[Lineage.Parasite]),
  };
}

function cloneRunCounters(counters: Readonly<RunCounters>): RunCounters {
  return {
    ...counters,
    mutation_attempted: { ...counters.mutation_attempted },
    mutation_accepted: { ...counters.mutation_accepted },
    mutation_rejected: { ...counters.mutation_rejected },
  };
}

function cloneResourceCounters(
  counters: Readonly<LocalResourceCounters> | null,
): LocalResourceCounters | null {
  return counters === null ? null : { ...counters };
}

function increment(value: number, label: string): number {
  if (!Number.isSafeInteger(value + 1)) {
    throw new RangeError(`${label} exceeds the safe-integer range.`);
  }
  return value + 1;
}

function lineageForEvent(engine: SimulationEngine, organismId: number): Lineage {
  const lineage = engine.lineageOf(organismId);
  if (lineage === null) {
    throw new Error(`Event references organism ${organismId} without a pedigree record.`);
  }
  return lineage;
}

function countEvent(
  counters: LineageMechanismCounters,
  event: EngineEvent,
  lineage: Lineage,
): void {
  if (event.type === "ecological_attempt") {
    const lineageCounters = counters[lineage];
    const success = event.result === EcologicalResultCode.Success;
    switch (event.operation) {
      case EcologicalOperation.Copy:
        lineageCounters.autonomous_attempts = increment(
          lineageCounters.autonomous_attempts,
          "lineage autonomous attempts",
        );
        if (success) {
          lineageCounters.autonomous_successes = increment(
            lineageCounters.autonomous_successes,
            "lineage autonomous successes",
          );
        }
        return;
      case EcologicalOperation.ExecNbr:
        lineageCounters.exploitative_attempts = increment(
          lineageCounters.exploitative_attempts,
          "lineage exploitative attempts",
        );
        if (success) {
          lineageCounters.exploitative_successes = increment(
            lineageCounters.exploitative_successes,
            "lineage exploitative successes",
          );
        }
        return;
      case EcologicalOperation.Splice:
        lineageCounters.hgt_attempts = increment(
          lineageCounters.hgt_attempts,
          "lineage HGT attempts",
        );
        if (success) {
          lineageCounters.hgt_successes = increment(
            lineageCounters.hgt_successes,
            "lineage HGT successes",
          );
        }
        return;
    }
  }
  if (event.type === "mutation" && event.accepted) {
    const lineageCounters = counters[lineage];
    switch (event.mutation_class) {
      case MutationClass.Point:
        lineageCounters.mutation_point_accepted = increment(
          lineageCounters.mutation_point_accepted,
          "lineage point mutations",
        );
        return;
      case MutationClass.Insertion:
        lineageCounters.mutation_insertion_accepted = increment(
          lineageCounters.mutation_insertion_accepted,
          "lineage insertion mutations",
        );
        return;
      case MutationClass.Deletion:
        lineageCounters.mutation_deletion_accepted = increment(
          lineageCounters.mutation_deletion_accepted,
          "lineage deletion mutations",
        );
        return;
    }
  }
  if (event.type === "computation_reward") {
    const lineageCounters = counters[lineage];
    lineageCounters.computation_rewards = increment(
      lineageCounters.computation_rewards,
      "lineage computation rewards",
    );
  } else if (event.type === "birth") {
    const lineageCounters = counters[lineage];
    lineageCounters.births = increment(lineageCounters.births, "lineage births");
  } else if (event.type === "death") {
    const lineageCounters = counters[lineage];
    lineageCounters.deaths = increment(lineageCounters.deaths, "lineage deaths");
  }
}

function primaryOrganismId(event: EngineEvent): number | null {
  switch (event.type) {
    case "activation":
    case "energy":
    case "ecological_attempt":
    case "hgt_transfer":
    case "computation_reward":
    case "death":
      return event.organism_id;
    case "birth":
      return event.caller_id;
    case "mutation":
      return event.parent_id;
    case "resource_regeneration":
      return null;
  }
}

function recordEvents(
  engine: SimulationEngine,
  report: TickReport,
  lineageCounters: LineageMechanismCounters,
  lineageDiagnostics: LineageDiagnostics,
  retainedEvents: RetainedEngineEvent[],
  retainEvents: boolean,
  runId: string,
  onEvent: ((event: EngineEvent) => void) | undefined,
): void {
  for (const event of report.events) {
    const organismId = primaryOrganismId(event);
    const lineage = organismId === null ? null : lineageForEvent(engine, organismId);
    if (lineage !== null) {
      countEvent(lineageCounters, event, lineage);
      recordLineageDiagnosticEvent(lineageDiagnostics, lineage, event);
    }
    onEvent?.(event);
    if (retainEvents) {
      retainedEvents.push({
        ...event,
        run_id: runId,
        lineage,
      });
    }
  }
}

function verifyFixtureDigest(
  configuration: ImmutableEngineConfig,
  fixture: unknown,
): string {
  const digest = nodeSha256(canonicalJson(fixture));
  if (digest !== configuration.initial_population.fixture_sha256) {
    throw new Error(
      `Ancestor fixture digest mismatch: expected ${configuration.initial_population.fixture_sha256}, received ${digest}.`,
    );
  }
  return digest;
}

export function executeRun(options: RunOptions): CompletedRun {
  const startedAt = new Date().toISOString();
  const configuration = parseEngineConfig(options.configuration);
  const fixtureDigest = verifyFixtureDigest(configuration, options.fixture);
  const engine = SimulationEngine.create(configuration, options.fixture, {
    sha256: nodeSha256,
  });
  const retainedEvents: RetainedEngineEvent[] = [];
  const checkpoints: RetainedCheckpoint[] = [];
  const samples: RecordedSample[] = [];
  let previousCounters = cloneRunCounters(engine.countersSnapshot());
  let previousResourceCounters = cloneResourceCounters(
    engine.resourceSnapshot()?.counters ?? null,
  );
  let lineageInterval = emptyLineageCounters();
  let lineageDiagnostics = emptyLineageDiagnostics();

  while (engine.terminalReason === null) {
    const report = engine.stepTick();
    recordEvents(
      engine,
      report,
      lineageInterval,
      lineageDiagnostics,
      retainedEvents,
      configuration.measurement.detailed_event_logging,
      configuration.identity.run_id,
      options.onEvent,
    );

    const scheduled = report.tick % configuration.duration.sample_every_ticks === 0;
    if (scheduled) {
      const diagnosticSnapshot = cloneLineageDiagnostics(lineageDiagnostics);
      const sample: RecordedSample = {
        measurement: engine.populationMeasurement("scheduled"),
        previous_counters: previousCounters,
        previous_resource_counters: previousResourceCounters,
        lineage_interval: cloneLineageCounters(lineageInterval),
        lineage_operation_results: diagnosticSnapshot.operation_results,
        lineage_death_causes: diagnosticSnapshot.death_causes,
      };
      samples.push(sample);
      options.onSample?.(sample);
      previousCounters = cloneRunCounters(engine.countersSnapshot());
      previousResourceCounters = cloneResourceCounters(
        engine.resourceSnapshot()?.counters ?? null,
      );
      lineageInterval = emptyLineageCounters();
      lineageDiagnostics = emptyLineageDiagnostics();
    }

    const checkpointInterval = configuration.duration.checkpoint_every_ticks;
    if (checkpointInterval !== null && report.tick % checkpointInterval === 0) {
      checkpoints.push({ tick: report.tick, checkpoint: engine.checkpoint() });
    }

    if (report.terminal_reason !== null && !scheduled) {
      const diagnosticSnapshot = cloneLineageDiagnostics(lineageDiagnostics);
      const sample: RecordedSample = {
        measurement: engine.populationMeasurement("terminal"),
        previous_counters: previousCounters,
        previous_resource_counters: previousResourceCounters,
        lineage_interval: cloneLineageCounters(lineageInterval),
        lineage_operation_results: diagnosticSnapshot.operation_results,
        lineage_death_causes: diagnosticSnapshot.death_causes,
      };
      samples.push(sample);
      options.onSample?.(sample);
    }
    options.onTick?.(report);
  }

  const terminalReason = engine.terminalReason;
  if (terminalReason === null) {
    throw new Error("Run loop ended without a terminal reason.");
  }
  return {
    configuration,
    fixture: options.fixture,
    configuration_id: engine.configurationId,
    fixture_sha256: fixtureDigest,
    samples,
    checkpoints,
    events: retainedEvents,
    lineage_records: engine.lineageRecords(),
    final_counters: cloneRunCounters(engine.countersSnapshot()),
    final_state_hash: engine.stateHash(),
    state_hash_algorithm: engine.stateHashAlgorithm,
    final_prng_state: engine.prngState,
    completed_ticks: engine.completedTick,
    terminal_reason: terminalReason,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
  };
}
