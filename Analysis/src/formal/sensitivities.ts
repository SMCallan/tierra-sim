/**
 * The six sensitivity analyses declared in SAP v1.0 §6, plus the horizon-matched exploratory
 * comparison that `D052` leaves in place of H4.
 *
 * Each is declared in the plan and computed here exactly as declared. Nothing in this module
 * chooses an analysis; where the plan's requirement could not be met from the export, Amendment 2
 * restated it and the restatement is what is implemented.
 *
 * Read-only.
 */

import { mean, quantile } from "./statistics.ts";
import {
  readBundle,
  runOutcomes,
  SAP_V1_PARAMETERS,
  type BundleInputs,
  type OutcomeParameters,
} from "./run-outcomes.ts";
import { classifyRun, type ClassifiedRun } from "./factorial.ts";

/* ------------------------------------------------------------------------------------------- */

export interface SensitivityRow {
  readonly label: string;
  readonly runsWithDefinedOutcome: number;
  readonly meanHostDivergence: number | null;
  readonly meanPopulationDivergence: number | null;
  readonly excludedByCoverage: number;
}

/** Sensitivity 3: burn-in 5,000 and 25,000 against the primary 10,000. */
export function burnInSensitivity(
  bundles: readonly BundleInputs[],
  burnIns: readonly number[] = [5_000, 10_000, 25_000],
): SensitivityRow[] {
  return burnIns.map((burnInTicks) => {
    const parameters: OutcomeParameters = { ...SAP_V1_PARAMETERS, burnInTicks };
    const outcomes = bundles.map((bundle) => runOutcomes(bundle, parameters));
    const host = outcomes
      .map((outcome) => outcome.host_mean_divergence_after_burn_in)
      .filter((value): value is number => value !== null);
    const population = outcomes
      .map((outcome) => outcome.mean_divergence_after_burn_in)
      .filter((value): value is number => value !== null);
    return {
      label: `burn-in ${burnInTicks.toLocaleString("en-GB")}${burnInTicks === 10_000 ? " (primary)" : ""}`,
      runsWithDefinedOutcome: host.length,
      meanHostDivergence: host.length === 0 ? null : mean(host),
      meanPopulationDivergence: population.length === 0 ? null : mean(population),
      excludedByCoverage: outcomes.filter((outcome) => !outcome.divergence_reliably_estimable).length,
    };
  });
}

/* ------------------------------------------------------------------------------------------- */

export interface ThresholdRow {
  readonly informativeActionThreshold: number;
  readonly meanHostDivergence: number | null;
  readonly meanEligibleProportion: number | null;
  readonly samplesWithAnyEligible: number;
  readonly samplesTotal: number;
}

/**
 * Sensitivity 1: informative-action thresholds 5 and 10 against the primary 1.
 *
 * These are **not** recomputed here. The engine evaluates them at sampling time and exports them in
 * each sample's `sensitivity` array with their own divergence and lineage-information blocks; a
 * post-hoc recomputation is impossible anyway, since per-organism action counts are not exported.
 * This function reads what the engine already computed.
 */
export function thresholdSensitivity(
  bundles: readonly BundleInputs[],
  burnInTicks: number = SAP_V1_PARAMETERS.burnInTicks,
): ThresholdRow[] {
  const byThreshold = new Map<number, { host: number[]; eligible: number[]; any: number; total: number }>();

  const record = (threshold: number, host: number | null, eligible: number | null): void => {
    const bucket = byThreshold.get(threshold) ?? { host: [], eligible: [], any: 0, total: 0 };
    bucket.total += 1;
    if (host !== null) {
      bucket.host.push(host);
      bucket.any += 1;
    }
    if (eligible !== null) {
      bucket.eligible.push(eligible);
    }
    byThreshold.set(threshold, bucket);
  };

  for (const bundle of bundles) {
    for (const sample of bundle.samples) {
      if (sample.tick <= burnInTicks) {
        continue;
      }
      record(1, sample.divergence?.host.mean_divergence ?? null, sample.divergence?.host.eligible_proportion ?? null);
      for (const entry of sample.sensitivity ?? []) {
        record(
          entry.informative_action_threshold,
          entry.divergence?.host.mean_divergence ?? null,
          entry.divergence?.host.eligible_proportion ?? null,
        );
      }
    }
  }

  return [...byThreshold.entries()]
    .sort(([left], [right]) => left - right)
    .map(([informativeActionThreshold, bucket]) => ({
      informativeActionThreshold,
      meanHostDivergence: bucket.host.length === 0 ? null : mean(bucket.host),
      meanEligibleProportion: bucket.eligible.length === 0 ? null : mean(bucket.eligible),
      samplesWithAnyEligible: bucket.any,
      samplesTotal: bucket.total,
    }));
}

/* ------------------------------------------------------------------------------------------- */

export interface BoundaryRow {
  readonly boundaries: string;
  readonly autonomous: number;
  readonly mixed: number;
  readonly exploitative: number;
}

/**
 * Sensitivity 2: functional-class boundaries 0.05/0.95 and 0.20/0.80 against the primary 0.10/0.90.
 *
 * Recomputed from the **host-lineage** twenty-bin `δ_i` histogram, per SAP Amendment 2. For a
 * host-lineage organism `δ_i = p_i`, so the bins map directly onto the classification thresholds;
 * for parasites `δ_i = 1 − p_i` and the order inverts, and the total histogram mixes both
 * transforms and cannot recover `p_i` at all. Bin width is 0.05, so every declared boundary falls
 * on a bin edge — an organism sitting exactly on a boundary is assigned by bin membership rather
 * than by the `≤` rule, which the amendment records as negligible but real.
 */
export function boundarySensitivity(
  bundles: readonly BundleInputs[],
  burnInTicks: number = SAP_V1_PARAMETERS.burnInTicks,
): BoundaryRow[] {
  const totals = new Array<number>(20).fill(0);
  for (const bundle of bundles) {
    for (const sample of bundle.samples) {
      if (sample.tick <= burnInTicks) {
        continue;
      }
      const histogram = sample.divergence?.host.divergence_histogram;
      if (histogram === undefined) {
        continue;
      }
      histogram.forEach((count, index) => {
        totals[index] = (totals[index] as number) + count;
      });
    }
  }
  const sum = (from: number, to: number): number =>
    totals.slice(from, to).reduce((running, value) => running + value, 0);

  // Each cut point is a bin index: 0.05 -> 1, 0.10 -> 2, 0.20 -> 4, 0.80 -> 16, 0.90 -> 18, 0.95 -> 19.
  return [
    { boundaries: "0.05 / 0.95", autonomous: sum(0, 1), mixed: sum(1, 19), exploitative: sum(19, 20) },
    { boundaries: "0.10 / 0.90 (primary)", autonomous: sum(0, 2), mixed: sum(2, 18), exploitative: sum(18, 20) },
    { boundaries: "0.20 / 0.80", autonomous: sum(0, 4), mixed: sum(4, 16), exploitative: sum(16, 20) },
  ];
}

/* ------------------------------------------------------------------------------------------- */

export interface ActiveOnlyResult {
  readonly allClassesDecoupling: number | null;
  readonly activeOnlyDecoupling: number | null;
  readonly samplesUsed: number;
}

/**
 * Sensitivity 4: active-only lineage information.
 *
 * `U(F|L)` is recomputed from the exported 2 × 4 lineage-by-class contingency table with the
 * `inactive` column removed. Both versions are computed from the same tables so the comparison
 * isolates the effect of dropping inactivity rather than mixing two estimators.
 */
export function activeOnlyLineageInformation(
  bundles: readonly BundleInputs[],
  burnInTicks: number = SAP_V1_PARAMETERS.burnInTicks,
): ActiveOnlyResult {
  const all: number[] = [];
  const active: number[] = [];

  for (const bundle of bundles) {
    for (const sample of bundle.samples) {
      if (sample.tick <= burnInTicks || sample.functional_classes === null || sample.functional_classes === undefined) {
        continue;
      }
      const table = [sample.functional_classes.host, sample.functional_classes.parasite];
      const withAll = theilU(table, ["autonomous", "mixed", "exploitative", "inactive"]);
      const withoutInactive = theilU(table, ["autonomous", "mixed", "exploitative"]);
      if (withAll !== null) {
        all.push(1 - withAll);
      }
      if (withoutInactive !== null) {
        active.push(1 - withoutInactive);
      }
    }
  }
  return {
    allClassesDecoupling: all.length === 0 ? null : mean(all),
    activeOnlyDecoupling: active.length === 0 ? null : mean(active),
    samplesUsed: active.length,
  };
}

/** Theil's `U(F|L) = I(F;L)/H(F)` over a lineage-by-class contingency table. */
export function theilU(
  rows: readonly Record<string, number>[],
  classes: readonly string[],
): number | null {
  const counts = rows.map((row) => classes.map((name) => row[name] ?? 0));
  const total = counts.flat().reduce((running, value) => running + value, 0);
  if (total === 0) {
    return null;
  }
  const lineagesPresent = counts.filter((row) => row.reduce((a, b) => a + b, 0) > 0).length;
  if (lineagesPresent < 2) {
    // Decision 0012: a constant lineage label cannot be informative or uninformative.
    return null;
  }
  const log2 = (value: number): number => (value <= 0 ? 0 : Math.log2(value));
  const classTotals = classes.map((_unused, index) =>
    counts.reduce((running, row) => running + (row[index] as number), 0),
  );
  const entropyF = -classTotals.reduce(
    (running, count) => running + (count / total) * log2(count / total),
    0,
  );
  if (entropyF === 0) {
    return null;
  }
  let mutual = 0;
  counts.forEach((row) => {
    const rowTotal = row.reduce((a, b) => a + b, 0);
    row.forEach((count, index) => {
      if (count === 0) {
        return;
      }
      const joint = count / total;
      mutual += joint * log2(joint / ((rowTotal / total) * ((classTotals[index] as number) / total)));
    });
  });
  return mutual / entropyF;
}

/* ------------------------------------------------------------------------------------------- */

export interface AttemptDiagnostic {
  readonly lineage: "host" | "parasite";
  readonly attemptRatio: number | null;
  readonly successRatio: number | null;
}

/**
 * Sensitivity 6, as restated by SAP Amendment 2: the **lineage-level** attempt ratio beside the
 * realised success ratio.
 *
 * A per-organism attempt-based `δ_i` is not recoverable — attempts are exported per lineage per
 * interval and never per organism. This is therefore an intent-versus-realisation contrast at
 * lineage level and **is not a per-organism quantity**. It cannot show that a particular organism
 * attempted more exploitation than it achieved; only that the lineage did.
 */
export function attemptDiagnostic(
  bundles: readonly BundleInputs[],
  burnInTicks: number = SAP_V1_PARAMETERS.burnInTicks,
): AttemptDiagnostic[] {
  const totals = {
    host: { aa: 0, ea: 0, as: 0, es: 0 },
    parasite: { aa: 0, ea: 0, as: 0, es: 0 },
  };
  for (const bundle of bundles) {
    for (const interval of bundle.intervals ?? []) {
      if (interval.tick <= burnInTicks) {
        continue;
      }
      for (const lineage of ["host", "parasite"] as const) {
        const source = interval.lineage_interval?.[lineage];
        if (source === undefined) {
          continue;
        }
        totals[lineage].aa += source.autonomous_attempts ?? 0;
        totals[lineage].ea += source.exploitative_attempts ?? 0;
        totals[lineage].as += source.autonomous_successes ?? 0;
        totals[lineage].es += source.exploitative_successes ?? 0;
      }
    }
  }
  const ratio = (exploitative: number, autonomous: number): number | null =>
    exploitative + autonomous === 0 ? null : exploitative / (exploitative + autonomous);
  return (["host", "parasite"] as const).map((lineage) => ({
    lineage,
    attemptRatio: ratio(totals[lineage].ea, totals[lineage].aa),
    successRatio: ratio(totals[lineage].es, totals[lineage].as),
  }));
}

/* ------------------------------------------------------------------------------------------- */

export interface HorizonMatchedComparison {
  readonly windowFrom: number;
  readonly windowTo: number;
  readonly factorialRuns: number;
  readonly controlRuns: number;
  readonly factorialMeanDecoupling: number | null;
  readonly controlMeanDecoupling: number | null;
}

/**
 * The exploratory comparison `D052` leaves in place of H4.
 *
 * **This is not a hypothesis test and must never be reported as one.** H4's declared baseline —
 * `control-no-evolution` — reached total population extinction before the burn-in, so the
 * confirmatory test has no baseline and `testH4` correctly declines to run.
 *
 * What remains is descriptive. The window runs from the end of the divergence transient to the
 * earliest control extinction, so both groups are observed over ticks they all survived. The
 * window is fixed by when the controls died, which is a property of the runs and not of any
 * outcome; it was not chosen by inspecting decoupling values.
 */
export function horizonMatchedDecoupling(
  runs: readonly { readonly bundle: BundleInputs; readonly classified: ClassifiedRun }[],
  windowFrom: number,
  windowTo: number,
): HorizonMatchedComparison {
  const meanOver = (predicate: (run: ClassifiedRun) => boolean): { value: number | null; count: number } => {
    const perRun: number[] = [];
    for (const { bundle, classified } of runs) {
      if (!predicate(classified)) {
        continue;
      }
      const defined = bundle.samples
        .filter((sample) => sample.tick >= windowFrom && sample.tick <= windowTo)
        .map((sample) => (sample.lineage_information?.defined === true ? sample.lineage_information.decoupling_score : null))
        .filter((value): value is number => value !== null);
      if (defined.length > 0) {
        perRun.push(mean(defined));
      }
    }
    return { value: perRun.length === 0 ? null : mean(perRun), count: perRun.length };
  };
  const factorial = meanOver((run) => run.block === "factorial");
  const control = meanOver((run) => run.outcomes.condition_id === "control-no-evolution");
  return {
    windowFrom,
    windowTo,
    factorialRuns: factorial.count,
    controlRuns: control.count,
    factorialMeanDecoupling: factorial.value,
    controlMeanDecoupling: control.value,
  };
}

/* ------------------------------------------------------------------------------------------- */

/** Loads a batch directory into bundles paired with their classified run-level outcomes. */
export function loadBatch(
  runDirectories: readonly string[],
  parameters: OutcomeParameters = SAP_V1_PARAMETERS,
): { readonly bundle: BundleInputs; readonly classified: ClassifiedRun }[] {
  return runDirectories.map((directory) => {
    const bundle = readBundle(directory);
    return { bundle, classified: classifyRun(runOutcomes(bundle, parameters)) };
  });
}

/** Median, for reporting extinction ticks without letting one long survivor drag the centre. */
export function median(values: readonly number[]): number | null {
  return values.length === 0 ? null : quantile(values, 0.5);
}
