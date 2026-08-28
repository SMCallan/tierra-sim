/**
 * The factorial analysis specified by `Experiments/protocols/statistical-analysis-plan-v1.0.md`.
 *
 * This module executes the plan and refuses to exceed it. Every test it runs is named in SAP
 * section 4; every parameter it uses is passed in from `SAP_V1_PARAMETERS` or from a declared
 * sensitivity set. It does not choose a burn-in, a coverage floor, a seed, or an outcome.
 *
 * Read-only with respect to every bundle.
 */

import {
  bootstrapPartialEtaSquared,
  createRandom,
  holmAdjust,
  mean,
  permutationTest,
  shuffleInPlace,
  standardDeviation,
  twoWayAnova,
  type BootstrapInterval,
  type Effect,
  type FactorialObservation,
  type PermutationResult,
  type TwoWayAnova,
} from "./statistics.ts";
import type { RunOutcomes } from "./run-outcomes.ts";

/* ---------------------------------------------------------------------------------------------
 * Design partition
 * ------------------------------------------------------------------------------------------- */

export type Block = "factorial" | "default-series" | "control";

export interface ClassifiedRun {
  readonly outcomes: RunOutcomes;
  readonly block: Block;
  /** Mutation level as written in the condition identifier, e.g. `"0.01"`. Null for controls. */
  readonly mutation: string | null;
  readonly hgt: string | null;
}

/**
 * Reads the design position out of a condition identifier.
 *
 * Levels are kept as the **strings** the identifier carries rather than parsed to numbers. The
 * factors are categorical with three declared levels; converting to a number would invite an
 * accidental linear contrast, and `0.5` and `0.50` would stop being the same level.
 */
export function classifyRun(outcomes: RunOutcomes): ClassifiedRun {
  const condition = outcomes.condition_id;
  const mutation = /(?:^|__)mut-([^_]+)/.exec(condition)?.[1] ?? null;
  const hgt = /(?:^|__)hgt-([^_]+)/.exec(condition)?.[1] ?? null;
  const block: Block = condition.startsWith("factorial__")
    ? "factorial"
    : condition.startsWith("default-series")
      ? "default-series"
      : "control";
  return { outcomes, block, mutation, hgt };
}

/* ---------------------------------------------------------------------------------------------
 * Eligibility
 * ------------------------------------------------------------------------------------------- */

export interface EligibilityReport {
  readonly total: number;
  readonly included: number;
  readonly excludedForCoverage: readonly string[];
  readonly excludedForUndefinedOutcome: readonly string[];
}

/**
 * Applies SAP section 3 to the factorial block: a run enters the primary tests only if its
 * divergence is reliably estimable and its primary outcome is defined.
 *
 * Exclusions are listed by run identifier rather than counted, because SAP section 7 requires the
 * count of excluded runs in every table and a reader who wants to check one needs its name.
 */
export function selectFactorialRuns(runs: readonly ClassifiedRun[]): {
  readonly eligible: readonly ClassifiedRun[];
  readonly report: EligibilityReport;
} {
  const factorial = runs.filter((run) => run.block === "factorial");
  const excludedForCoverage: string[] = [];
  const excludedForUndefinedOutcome: string[] = [];
  const eligible: ClassifiedRun[] = [];
  for (const run of factorial) {
    if (!run.outcomes.divergence_reliably_estimable) {
      excludedForCoverage.push(run.outcomes.run_id);
    } else if (run.outcomes.host_mean_divergence_after_burn_in === null) {
      excludedForUndefinedOutcome.push(run.outcomes.run_id);
    } else {
      eligible.push(run);
    }
  }
  return {
    eligible,
    report: {
      total: factorial.length,
      included: eligible.length,
      excludedForCoverage,
      excludedForUndefinedOutcome,
    },
  };
}

/* ---------------------------------------------------------------------------------------------
 * Cell summaries
 * ------------------------------------------------------------------------------------------- */

export interface CellSummary {
  readonly mutation: string;
  readonly hgt: string;
  readonly runs: number;
  readonly hostDivergenceMean: number;
  readonly hostDivergenceSd: number | null;
  readonly populationDivergenceMean: number | null;
  readonly parasiteExtinctRuns: number;
  readonly meanDegenerateSampleProportion: number;
}

/**
 * Per-cell descriptives.
 *
 * Population `Δ_D`, extinction count and degenerate-sample proportion travel alongside the primary
 * outcome because SAP section 7 requires them in every table that carries it. A host-lineage `Δ_D`
 * of 0.89 means something different before and after parasite extinction, and a reader must be
 * able to see which regime produced it.
 */
export function summariseCells(runs: readonly ClassifiedRun[]): CellSummary[] {
  const cells = new Map<string, ClassifiedRun[]>();
  for (const run of runs) {
    const key = `${String(run.mutation)}|${String(run.hgt)}`;
    const bucket = cells.get(key);
    if (bucket === undefined) {
      cells.set(key, [run]);
    } else {
      bucket.push(run);
    }
  }
  return [...cells.entries()]
    .map(([key, bucket]) => {
      const [mutation = "", hgt = ""] = key.split("|");
      const host = bucket.map((run) => run.outcomes.host_mean_divergence_after_burn_in as number);
      const population = bucket
        .map((run) => run.outcomes.mean_divergence_after_burn_in)
        .filter((value): value is number => value !== null);
      return {
        mutation,
        hgt,
        runs: bucket.length,
        hostDivergenceMean: mean(host),
        hostDivergenceSd: standardDeviation(host),
        populationDivergenceMean: population.length === 0 ? null : mean(population),
        parasiteExtinctRuns: bucket.filter((run) => !run.outcomes.parasite_extant_at_end).length,
        meanDegenerateSampleProportion: mean(
          bucket.map((run) => run.outcomes.degenerate_sample_proportion),
        ),
      };
    })
    .sort((left, right) =>
      left.mutation === right.mutation
        ? left.hgt.localeCompare(right.hgt)
        : left.mutation.localeCompare(right.mutation),
    );
}

/* ---------------------------------------------------------------------------------------------
 * The hypothesis tests
 * ------------------------------------------------------------------------------------------- */

/** Seeds are per-effect and recorded, as SAP section 8 requires. */
export interface AnalysisSeeds {
  readonly permutation: Record<Effect, number>;
  readonly bootstrap: Record<Effect, number>;
}

export const SAP_V1_SEEDS: AnalysisSeeds = {
  permutation: { a: 20260802, b: 20260803, interaction: 20260804 },
  bootstrap: { a: 20260812, b: 20260813, interaction: 20260814 },
};

export interface HypothesisResult {
  readonly hypothesis: "H1" | "H2" | "H3";
  readonly effect: Effect;
  readonly label: string;
  readonly permutation: PermutationResult;
  readonly partialEtaSquared: BootstrapInterval;
  readonly adjustedP: number;
}

export interface FactorialAnalysis {
  readonly anova: TwoWayAnova;
  readonly cells: readonly CellSummary[];
  readonly eligibility: EligibilityReport;
  readonly hypotheses: readonly HypothesisResult[];
  readonly permutations: number;
  readonly resamples: number;
  readonly seeds: AnalysisSeeds;
  readonly warnings: readonly string[];
}

const HYPOTHESIS_OF: Record<Effect, { hypothesis: "H1" | "H2" | "H3"; label: string }> = {
  a: { hypothesis: "H1", label: "mutation main effect" },
  b: { hypothesis: "H2", label: "HGT main effect" },
  interaction: { hypothesis: "H3", label: "mutation x HGT interaction" },
};

/**
 * Runs SAP section 4 on the factorial block.
 *
 * H1 to H3 are tested here. H4 is not: SAP section 4 names it as "`D_info` vs. lineage-only
 * baseline" without defining the baseline or the test, which is not enough to implement without
 * choosing something the plan did not choose. `summariseDecoupling` reports the quantity and its
 * interval; the test itself needs a plan amendment made before the formal run, not a decision
 * taken here.
 */
export function analyseFactorial(
  runs: readonly ClassifiedRun[],
  options: {
    readonly permutations: number;
    readonly resamples: number;
    readonly seeds: AnalysisSeeds;
  },
): FactorialAnalysis {
  const { eligible, report } = selectFactorialRuns(runs);
  const warnings: string[] = [];

  const observations: FactorialObservation[] = eligible.map((run) => ({
    factorA: run.mutation ?? "unknown",
    factorB: run.hgt ?? "unknown",
    response: run.outcomes.host_mean_divergence_after_burn_in as number,
  }));

  const anova = twoWayAnova(observations);
  if (!anova.balanced) {
    warnings.push(
      `The design is unbalanced: cell sizes ${[...anova.cellCounts.values()].join(", ")}. ` +
        "Type II sums of squares are used, and the exclusions are listed in the eligibility report.",
    );
  }
  if (report.excludedForCoverage.length > 0) {
    warnings.push(
      `${String(report.excludedForCoverage.length)} run(s) excluded by the Decision 0007 coverage ` +
        `floor: ${report.excludedForCoverage.join(", ")}. Their ecology and persistence are still reported.`,
    );
  }

  const effects: Effect[] = ["a", "b", "interaction"];
  const permutationResults = effects.map((effect) =>
    permutationTest(observations, effect, options.permutations, options.seeds.permutation[effect]),
  );
  const adjusted = holmAdjust(
    permutationResults.map((result) => ({
      label: HYPOTHESIS_OF[result.effect].hypothesis,
      p: result.pValue,
    })),
  );

  const hypotheses = permutationResults.map((permutation, index) => ({
    hypothesis: HYPOTHESIS_OF[permutation.effect].hypothesis,
    effect: permutation.effect,
    label: HYPOTHESIS_OF[permutation.effect].label,
    permutation,
    partialEtaSquared: bootstrapPartialEtaSquared(
      observations,
      permutation.effect,
      options.resamples,
      options.seeds.bootstrap[permutation.effect],
    ),
    adjustedP: adjusted[index]?.adjusted ?? 1,
  }));

  // A bootstrap that threw away a meaningful share of its resamples has produced an interval over
  // the resamples that happened to be admissible, which is not the interval it claims to be. The
  // 5% threshold is a reporting safeguard rather than an analysis choice, so it warns rather than
  // failing: the interval is still reported, with the reader told how much of it is real.
  for (const hypothesis of hypotheses) {
    const { discarded, resamples } = hypothesis.partialEtaSquared;
    const attempted = discarded + resamples;
    if (attempted > 0 && discarded / attempted > 0.05) {
      warnings.push(
        `${hypothesis.hypothesis}: ${String(discarded)} of ${String(attempted)} bootstrap resamples ` +
          `(${(100 * (discarded / attempted)).toFixed(1)}%) were degenerate and discarded. The ` +
          "partial eta-squared interval is conditioned on the admissible resamples and should be " +
          "read as wider than reported.",
      );
    }
  }

  return {
    anova,
    cells: summariseCells(eligible),
    eligibility: report,
    hypotheses,
    permutations: options.permutations,
    resamples: options.resamples,
    seeds: options.seeds,
    warnings,
  };
}

/* ---------------------------------------------------------------------------------------------
 * Persistence and decoupling
 * ------------------------------------------------------------------------------------------- */

export interface PersistenceByLevel {
  readonly level: string;
  readonly runs: number;
  readonly extinct: number;
  readonly medianExtinctionTick: number | null;
}

/**
 * Parasite persistence by HGT level — the SAP section 2.2 confirmatory secondary outcome, promoted
 * because `D041` establishes persistence as the mechanism through which HGT acts.
 *
 * The median extinction tick is taken over **extinct runs only**. Including survivors as a
 * censored value at the horizon would understate how long the survivors actually persisted, and
 * substituting the horizon for them would invent an extinction that did not occur.
 */
export function persistenceByHgt(runs: readonly ClassifiedRun[]): PersistenceByLevel[] {
  const levels = new Map<string, ClassifiedRun[]>();
  for (const run of runs.filter((candidate) => candidate.hgt !== null)) {
    const key = run.hgt as string;
    const bucket = levels.get(key);
    if (bucket === undefined) {
      levels.set(key, [run]);
    } else {
      bucket.push(run);
    }
  }
  return [...levels.entries()]
    .map(([level, bucket]) => {
      const ticks = bucket
        .map((run) => run.outcomes.parasite_extinction_tick)
        .filter((tick): tick is number => tick !== null)
        .sort((left, right) => left - right);
      const middle = Math.floor(ticks.length / 2);
      return {
        level,
        runs: bucket.length,
        extinct: ticks.length,
        medianExtinctionTick:
          ticks.length === 0
            ? null
            : ticks.length % 2 === 1
              ? (ticks[middle] as number)
              : ((ticks[middle - 1] as number) + (ticks[middle] as number)) / 2,
      };
    })
    .sort((left, right) => left.level.localeCompare(right.level));
}

export interface DecouplingSummary {
  readonly runsWithDefinedDecoupling: number;
  readonly runsWithNoDefinedSample: number;
  readonly meanDecoupling: number | null;
  readonly meanDegenerateSampleProportion: number;
}

/**
 * Post-burn-in decoupling across runs, with the degeneracy that qualifies it.
 *
 * Reporting a mean decoupling without the proportion of samples that were degenerate would be the
 * single most misleading number this analysis could produce: calibration found that proportion
 * reaching 99% in the worst 100,000-tick run, meaning the estimand was undefined for almost the
 * whole run whose value is being averaged in.
 */
export function summariseDecoupling(runs: readonly ClassifiedRun[]): DecouplingSummary {
  const defined = runs
    .map((run) => run.outcomes.post_burn_in_decoupling)
    .filter((value): value is number => value !== null);
  return {
    runsWithDefinedDecoupling: defined.length,
    runsWithNoDefinedSample: runs.length - defined.length,
    meanDecoupling: defined.length === 0 ? null : mean(defined),
    meanDegenerateSampleProportion:
      runs.length === 0 ? 0 : mean(runs.map((run) => run.outcomes.degenerate_sample_proportion)),
  };
}

/* ---------------------------------------------------------------------------------------------
 * H4 — SAP v1.0 Amendment 1
 * ------------------------------------------------------------------------------------------- */

export interface H4Result {
  readonly tested: boolean;
  /** Why the test was not run, when it was not. Null when it was. */
  readonly notTestedReason: string | null;
  readonly factorialRuns: number;
  readonly controlRuns: number;
  readonly factorialMeanDecoupling: number | null;
  readonly controlMeanDecoupling: number | null;
  readonly difference: number | null;
  readonly pValue: number | null;
  readonly permutations: number;
  readonly seed: number;
}

/** Minimum runs per group. Below this the amendment requires the fact to be reported, not a number. */
const H4_MINIMUM_GROUP_SIZE = 3;

/**
 * H4 under SAP v1.0 Amendment 1: is post-burn-in decoupling higher in the factorial block than in
 * the no-evolution control, where neither mutation nor HGT can move behaviour off its lineage?
 *
 * A two-sample permutation test on the difference in means, permuting the group labels. The
 * controls are not entered into the factorial model — section 4 forbids that — this is a separate
 * two-group comparison in which each run contributes one value.
 *
 * The amendment's own limits are enforced here rather than left to the reader. `D_info` is
 * undefined once a lineage goes extinct, and calibration found that happening in most runs, so the
 * control group can empty. Below three runs in either group the function returns `tested: false`
 * with the reason, because a difference computed from one or two runs would be reported with the
 * same authority as a real result.
 */
export function testH4(
  runs: readonly ClassifiedRun[],
  permutations: number,
  seed: number,
): H4Result {
  const definedDecoupling = (run: ClassifiedRun): number | null =>
    run.outcomes.post_burn_in_decoupling;

  const factorial = runs
    .filter((run) => run.block === "factorial")
    .map(definedDecoupling)
    .filter((value): value is number => value !== null);
  const control = runs
    .filter((run) => run.outcomes.condition_id === "control-no-evolution")
    .map(definedDecoupling)
    .filter((value): value is number => value !== null);

  const base = {
    factorialRuns: factorial.length,
    controlRuns: control.length,
    permutations,
    seed,
  };

  if (factorial.length < H4_MINIMUM_GROUP_SIZE || control.length < H4_MINIMUM_GROUP_SIZE) {
    return {
      ...base,
      tested: false,
      notTestedReason:
        `Fewer than ${String(H4_MINIMUM_GROUP_SIZE)} runs with a defined post-burn-in D_info in at ` +
        `least one group: ${String(factorial.length)} factorial, ${String(control.length)} control. ` +
        "D_info is undefined once a lineage goes extinct; SAP v1.0 Amendment 1 requires this to be " +
        "reported in place of a result.",
      factorialMeanDecoupling: factorial.length === 0 ? null : mean(factorial),
      controlMeanDecoupling: control.length === 0 ? null : mean(control),
      difference: null,
      pValue: null,
    };
  }

  const observedDifference = mean(factorial) - mean(control);
  const pooled = [...factorial, ...control];
  const random = createRandom(seed);
  const scratch = [...pooled];
  let atLeastAsExtreme = 0;
  for (let iteration = 0; iteration < permutations; iteration += 1) {
    shuffleInPlace(scratch, random);
    const permutedDifference =
      mean(scratch.slice(0, factorial.length)) - mean(scratch.slice(factorial.length));
    // One-sided: H4 predicts factorial decoupling exceeds the control, and a control that decouples
    // *more* than the factorial would not support H4 in any direction.
    if (permutedDifference >= observedDifference - 1e-12) {
      atLeastAsExtreme += 1;
    }
  }

  return {
    ...base,
    tested: true,
    notTestedReason: null,
    factorialMeanDecoupling: mean(factorial),
    controlMeanDecoupling: mean(control),
    difference: observedDifference,
    pValue: (atLeastAsExtreme + 1) / (permutations + 1),
  };
}
