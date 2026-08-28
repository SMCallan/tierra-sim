import {
  DeathCause,
  EcologicalOperation,
  EcologicalResultCode,
  Lineage,
  type DeathCause as DeathCauseValue,
  type EcologicalOperation as EcologicalOperationValue,
  type EngineEvent,
  type RunCounters,
} from "@tierra-sim/engine";

import type {
  LineageDiagnosticIdentityResiduals,
  LineageDiagnostics,
  LineageMechanismCounters,
  MechanismCounters,
  OperationResultCounters,
  RecordedSample,
} from "./types.js";

const lineages = [Lineage.Host, Lineage.Parasite] as const;
const operations = [
  EcologicalOperation.Copy,
  EcologicalOperation.ExecNbr,
  EcologicalOperation.Splice,
] as const;
const deathCauses = [
  DeathCause.Exogenous,
  DeathCause.Energy,
  DeathCause.Exploitation,
] as const;

function safeAdd(left: number, right: number, label: string): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw new RangeError(`${label} exceeds the safe-integer range.`);
  }
  return result;
}

function emptyOperationResults(): OperationResultCounters {
  return Object.fromEntries(
    Object.values(EcologicalResultCode).map((result) => [result, 0]),
  ) as OperationResultCounters;
}

function emptyOperations(): Record<EcologicalOperationValue, OperationResultCounters> {
  return {
    [EcologicalOperation.Copy]: emptyOperationResults(),
    [EcologicalOperation.ExecNbr]: emptyOperationResults(),
    [EcologicalOperation.Splice]: emptyOperationResults(),
  };
}

function emptyDeaths(): Record<DeathCauseValue, number> {
  return {
    [DeathCause.Exogenous]: 0,
    [DeathCause.Energy]: 0,
    [DeathCause.Exploitation]: 0,
  };
}

export function emptyLineageDiagnostics(): LineageDiagnostics {
  return {
    operation_results: {
      [Lineage.Host]: emptyOperations(),
      [Lineage.Parasite]: emptyOperations(),
    },
    death_causes: {
      [Lineage.Host]: emptyDeaths(),
      [Lineage.Parasite]: emptyDeaths(),
    },
  };
}

function cloneOperationResults(
  counters: Readonly<OperationResultCounters>,
): OperationResultCounters {
  return { ...counters };
}

export function cloneLineageDiagnostics(
  diagnostics: Readonly<LineageDiagnostics>,
): LineageDiagnostics {
  return {
    operation_results: {
      [Lineage.Host]: {
        [EcologicalOperation.Copy]: cloneOperationResults(
          diagnostics.operation_results.host.copy,
        ),
        [EcologicalOperation.ExecNbr]: cloneOperationResults(
          diagnostics.operation_results.host.exec_nbr,
        ),
        [EcologicalOperation.Splice]: cloneOperationResults(
          diagnostics.operation_results.host.splice,
        ),
      },
      [Lineage.Parasite]: {
        [EcologicalOperation.Copy]: cloneOperationResults(
          diagnostics.operation_results.parasite.copy,
        ),
        [EcologicalOperation.ExecNbr]: cloneOperationResults(
          diagnostics.operation_results.parasite.exec_nbr,
        ),
        [EcologicalOperation.Splice]: cloneOperationResults(
          diagnostics.operation_results.parasite.splice,
        ),
      },
    },
    death_causes: {
      [Lineage.Host]: { ...diagnostics.death_causes.host },
      [Lineage.Parasite]: { ...diagnostics.death_causes.parasite },
    },
  };
}

export function recordLineageDiagnosticEvent(
  diagnostics: LineageDiagnostics,
  lineage: Lineage,
  event: EngineEvent,
): void {
  if (event.type === "ecological_attempt") {
    const current = diagnostics.operation_results[lineage][event.operation][event.result];
    diagnostics.operation_results[lineage][event.operation][event.result] = safeAdd(
      current,
      1,
      `${lineage} ${event.operation} ${event.result} results`,
    );
  } else if (event.type === "death") {
    const current = diagnostics.death_causes[lineage][event.cause];
    diagnostics.death_causes[lineage][event.cause] = safeAdd(
      current,
      1,
      `${lineage} ${event.cause} deaths`,
    );
  }
}

function addDiagnostics(target: LineageDiagnostics, source: Readonly<LineageDiagnostics>): void {
  for (const lineage of lineages) {
    for (const operation of operations) {
      for (const result of Object.values(EcologicalResultCode)) {
        target.operation_results[lineage][operation][result] = safeAdd(
          target.operation_results[lineage][operation][result],
          source.operation_results[lineage][operation][result],
          `aggregated ${lineage} ${operation} ${result} results`,
        );
      }
    }
    for (const cause of deathCauses) {
      target.death_causes[lineage][cause] = safeAdd(
        target.death_causes[lineage][cause],
        source.death_causes[lineage][cause],
        `aggregated ${lineage} ${cause} deaths`,
      );
    }
  }
}

function emptyMechanisms(): MechanismCounters {
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

export function aggregateLineageMechanisms(
  samples: readonly RecordedSample[],
): LineageMechanismCounters {
  const aggregate: LineageMechanismCounters = {
    [Lineage.Host]: emptyMechanisms(),
    [Lineage.Parasite]: emptyMechanisms(),
  };
  for (const sample of samples) {
    for (const lineage of lineages) {
      for (const key of Object.keys(aggregate[lineage]) as (keyof MechanismCounters)[]) {
        aggregate[lineage][key] = safeAdd(
          aggregate[lineage][key],
          sample.lineage_interval[lineage][key],
          `aggregated ${lineage} ${key}`,
        );
      }
    }
  }
  return aggregate;
}

export function aggregateLineageDiagnostics(
  samples: readonly RecordedSample[],
): LineageDiagnostics {
  const aggregate = emptyLineageDiagnostics();
  for (const sample of samples) {
    addDiagnostics(aggregate, {
      operation_results: sample.lineage_operation_results,
      death_causes: sample.lineage_death_causes,
    });
  }
  return aggregate;
}

function sumResults(results: Readonly<OperationResultCounters>): number {
  return Object.values(results).reduce(
    (total, value) => safeAdd(total, value, "operation result sum"),
    0,
  );
}

function mechanismAttempts(
  counters: Readonly<MechanismCounters>,
  operation: EcologicalOperationValue,
): number {
  if (operation === EcologicalOperation.Copy) return counters.autonomous_attempts;
  if (operation === EcologicalOperation.ExecNbr) return counters.exploitative_attempts;
  return counters.hgt_attempts;
}

function mechanismSuccesses(
  counters: Readonly<MechanismCounters>,
  operation: EcologicalOperationValue,
): number {
  if (operation === EcologicalOperation.Copy) return counters.autonomous_successes;
  if (operation === EcologicalOperation.ExecNbr) return counters.exploitative_successes;
  return counters.hgt_successes;
}

function globalAttempts(
  counters: Readonly<RunCounters>,
  operation: EcologicalOperationValue,
): number {
  if (operation === EcologicalOperation.Copy) return counters.autonomous_attempts;
  if (operation === EcologicalOperation.ExecNbr) return counters.exploitative_attempts;
  return counters.hgt_attempts;
}

function globalSuccesses(
  counters: Readonly<RunCounters>,
  operation: EcologicalOperationValue,
): number {
  if (operation === EcologicalOperation.Copy) return counters.autonomous_successes;
  if (operation === EcologicalOperation.ExecNbr) return counters.exploitative_successes;
  return counters.hgt_successes;
}

function globalDeaths(counters: Readonly<RunCounters>, cause: DeathCauseValue): number {
  if (cause === DeathCause.Exogenous) return counters.deaths_exogenous;
  if (cause === DeathCause.Energy) return counters.deaths_energy;
  return counters.deaths_exploitation;
}

export function lineageDiagnosticIdentityResiduals(
  diagnostics: Readonly<LineageDiagnostics>,
  mechanisms: Readonly<LineageMechanismCounters>,
  counters: Readonly<RunCounters>,
): LineageDiagnosticIdentityResiduals {
  const lineageOperationAttempts = {
    [Lineage.Host]: {} as Record<EcologicalOperationValue, number>,
    [Lineage.Parasite]: {} as Record<EcologicalOperationValue, number>,
  };
  const lineageOperationSuccesses = {
    [Lineage.Host]: {} as Record<EcologicalOperationValue, number>,
    [Lineage.Parasite]: {} as Record<EcologicalOperationValue, number>,
  };
  const lineageDeaths = { [Lineage.Host]: 0, [Lineage.Parasite]: 0 };
  const globalOperationAttempts = {} as Record<EcologicalOperationValue, number>;
  const globalOperationSuccesses = {} as Record<EcologicalOperationValue, number>;
  const globalDeathCauses = {} as Record<DeathCauseValue, number>;

  for (const lineage of lineages) {
    for (const operation of operations) {
      const results = diagnostics.operation_results[lineage][operation];
      lineageOperationAttempts[lineage][operation] =
        sumResults(results) - mechanismAttempts(mechanisms[lineage], operation);
      lineageOperationSuccesses[lineage][operation] =
        results[EcologicalResultCode.Success] -
        mechanismSuccesses(mechanisms[lineage], operation);
    }
    lineageDeaths[lineage] =
      Object.values(diagnostics.death_causes[lineage]).reduce(
        (total, value) => safeAdd(total, value, `${lineage} death sum`),
        0,
      ) - mechanisms[lineage].deaths;
  }

  for (const operation of operations) {
    globalOperationAttempts[operation] =
      lineages.reduce(
        (total, lineage) =>
          safeAdd(
            total,
            sumResults(diagnostics.operation_results[lineage][operation]),
            `global ${operation} result sum`,
          ),
        0,
      ) - globalAttempts(counters, operation);
    globalOperationSuccesses[operation] =
      lineages.reduce(
        (total, lineage) =>
          safeAdd(
            total,
            diagnostics.operation_results[lineage][operation][EcologicalResultCode.Success],
            `global ${operation} success sum`,
          ),
        0,
      ) - globalSuccesses(counters, operation);
  }
  for (const cause of deathCauses) {
    globalDeathCauses[cause] =
      lineages.reduce(
        (total, lineage) =>
          safeAdd(
            total,
            diagnostics.death_causes[lineage][cause],
            `global ${cause} death sum`,
          ),
        0,
      ) - globalDeaths(counters, cause);
  }

  return {
    lineage_operation_attempts: lineageOperationAttempts,
    lineage_operation_successes: lineageOperationSuccesses,
    lineage_deaths: lineageDeaths,
    global_operation_attempts: globalOperationAttempts,
    global_operation_successes: globalOperationSuccesses,
    global_death_causes: globalDeathCauses,
  };
}

export function assertLineageDiagnosticIdentities(
  residuals: Readonly<LineageDiagnosticIdentityResiduals>,
): void {
  const values = [
    ...lineages.flatMap((lineage) => [
      ...Object.values(residuals.lineage_operation_attempts[lineage]),
      ...Object.values(residuals.lineage_operation_successes[lineage]),
      residuals.lineage_deaths[lineage],
    ]),
    ...Object.values(residuals.global_operation_attempts),
    ...Object.values(residuals.global_operation_successes),
    ...Object.values(residuals.global_death_causes),
  ];
  if (values.some((value) => value !== 0)) {
    throw new Error("Lineage diagnostic counts do not reconcile with authoritative counters.");
  }
}
