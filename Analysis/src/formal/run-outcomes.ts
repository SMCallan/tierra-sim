/**
 * Run-level outcome extraction for the formal factorial analysis.
 *
 * Reads an immutable run bundle and derives the run-level response variables named in
 * `Research/research-questions.md` — "Threshold and autocorrelation". Independent runs are the
 * replication unit, so this module reduces one run to one row; samples within a run are repeated
 * observations and are never treated as replicates here.
 *
 * Read-only. It never writes into a bundle and never recomputes engine state.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

/** A per-sample divergence summary as exported by the engine. */
export interface DivergenceSummary {
  readonly mean_divergence: number | null;
  readonly divergence_histogram?: readonly number[];
  readonly median_divergence: number | null;
  readonly q25_divergence: number | null;
  readonly q75_divergence: number | null;
  readonly eligible_count: number;
  readonly eligible_proportion: number | null;
  readonly inactive_count: number;
  readonly inactive_proportion: number | null;
  readonly population_count: number;
}

export interface LineageInformation {
  readonly defined: boolean;
  readonly theil_u_function_given_lineage: number | null;
  readonly decoupling_score: number | null;
  readonly mutual_information_bits: number | null;
  readonly function_entropy_bits: number | null;
  readonly undefined_reason: string | null;
}

/**
 * One exported sample.
 *
 * `divergence` and `lineage_information` are **nullable**, and that is not defensive typing. When a
 * run reaches total population extinction the engine emits a final sample in which there are no
 * organisms to measure, so those blocks are null rather than zero-filled. Four of the sixty formal
 * runs did exactly that. Treating the null as an object crashed the pipeline (`D051`); treating it
 * as zero would be worse, because it would record a divergence of zero for a population that does
 * not exist.
 */
export interface FunctionalClasses {
  readonly host: Record<string, number>;
  readonly parasite: Record<string, number>;
  readonly total: Record<string, number>;
}

/** One entry of the engine's per-sample `sensitivity` array, at an alternate declared threshold. */
export interface SensitivityEntry {
  readonly informative_action_threshold: number;
  readonly divergence: {
    readonly host: DivergenceSummary;
    readonly parasite: DivergenceSummary;
    readonly total: DivergenceSummary;
  } | null;
  readonly functional_classes: FunctionalClasses | null;
  readonly lineage_information: LineageInformation | null;
}

export interface Sample {
  readonly tick: number;
  readonly divergence: {
    readonly host: DivergenceSummary;
    readonly parasite: DivergenceSummary;
    readonly total: DivergenceSummary;
  } | null;
  readonly lineage_information: LineageInformation | null;
  readonly functional_classes: FunctionalClasses | null;
  /** Alternate informative-action thresholds, computed by the engine at sampling time (SAP §6.1). */
  readonly sensitivity?: readonly SensitivityEntry[];
  readonly state: { readonly host_population: number; readonly parasite_population: number };
}

/** Divergence for one lineage, or nulls when the sample has no organisms at all. */
const ABSENT: DivergenceSummary = {
  mean_divergence: null,
  median_divergence: null,
  q25_divergence: null,
  q75_divergence: null,
  eligible_count: 0,
  eligible_proportion: null,
  inactive_count: 0,
  inactive_proportion: null,
  population_count: 0,
};

function divergenceOf(sample: Sample, lineage: "host" | "parasite" | "total"): DivergenceSummary {
  return sample.divergence === null ? ABSENT : sample.divergence[lineage];
}

export interface RunOutcomes {
  readonly run_id: string;
  readonly condition_id: string;
  readonly replicate_id: number;
  readonly seed: number;
  readonly completed_ticks: number;
  readonly terminal_reason: string;
  readonly burn_in_ticks: number;

  /**
   * **Primary outcome** under Decision 0019: the mean of per-sample host-lineage `Δ_D` after
   * burn-in. Promoted from secondary because the population measure is confounded by lineage
   * composition (`D042`).
   */
  readonly host_mean_divergence_after_burn_in: number | null;
  readonly late_window_host_mean_divergence: number | null;
  /** Mean post-burn-in decoupling `1 − U(F|L)` over samples where the estimand is defined. */
  readonly post_burn_in_decoupling: number | null;

  /** Secondary confirmatory: did the parasite lineage survive, and if not, when did it go? */
  readonly parasite_extant_at_end: boolean;
  readonly parasite_extinction_tick: number | null;

  /**
   * Secondary **descriptive**. Retained and reported so the `D042` confound stays visible, never
   * used for a between-condition test.
   */
  readonly mean_divergence_after_burn_in: number | null;
  /** Trapezoidal area under Δ_D over ticks after burn-in, normalised by elapsed ticks. */
  /** SAP §2.4: primary host-lineage mean × defined observation duration, in `Δ_D`·ticks. */
  readonly sap_auc_host_delta_ticks: number | null;
  readonly late_window_mean_divergence: number | null;
  readonly parasite_mean_divergence_after_burn_in: number | null;
  readonly mean_eligible_proportion_after_burn_in: number | null;
  readonly mean_inactive_proportion_after_burn_in: number | null;

  /**
   * Decision 0007 coverage floor. When false the run is `divergence_not_reliably_estimable`: its
   * ecology, persistence and activity are still reported, but its divergence is excluded from
   * primary tests and is **not** imputed.
   */
  readonly divergence_reliably_estimable: boolean;

  /** First tick at which host `Δ_D` reaches half, and nine tenths, of this run's own asymptote. */
  readonly onset_tick_50: number | null;
  readonly onset_tick_90: number | null;

  /** Theil's U at the final sample where lineage information was defined. */
  readonly final_defined_theil_u: number | null;
  readonly final_defined_decoupling_score: number | null;
  readonly lineage_information_defined_samples: number;
  readonly lineage_information_undefined_samples: number;
  /** SAP section 7 requires this in every table carrying the primary outcome. */
  readonly degenerate_sample_proportion: number;
  readonly samples_total: number;
  readonly samples_with_defined_divergence: number;
  readonly undefined_reason: string | null;
}

/**
 * Declared analysis parameters. None of these is a property of a run: each must come from the
 * frozen plan so it cannot be chosen after seeing trajectories.
 */
export interface OutcomeParameters {
  readonly burnInTicks: number;
  /** Trailing fraction of *requested* ticks forming the late window. */
  readonly lateWindowFraction: number;
  /** Minimum mean eligible proportion for divergence to be reliably estimable (Decision 0007). */
  readonly coverageFloor: number;
}

/**
 * The values frozen in `Experiments/protocols/statistical-analysis-plan-v1.0.md`.
 *
 * These live here as a named constant rather than as defaults scattered through the module so that
 * a reader can see the whole declared parameter set at once, and so that changing one is a visible
 * edit against the plan rather than a silent drift. The late window was previously hard-coded at a
 * quarter of the run, which disagreed with the plan's ticks 90,000–100,000 of 100,000; the plan
 * governs.
 */
export const SAP_V1_PARAMETERS: OutcomeParameters = {
  burnInTicks: 10_000,
  lateWindowFraction: 1 / 10,
  coverageFloor: 0.25,
};

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

/** Mean over defined values only. Returns null rather than coercing undefined to zero. */
export function definedMean(values: readonly (number | null)[]): number | null {
  const defined = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (defined.length === 0) {
    return null;
  }
  return defined.reduce((total, value) => total + value, 0) / defined.length;
}

/**
 * Trapezoidal area under a sampled series, normalised by elapsed ticks so it is comparable across
 * runs of different length. Undefined points break the integration into segments rather than being
 * interpolated across, because an undefined Δ_D is not a value of zero.
 */
/**
 * Observation duration over which the series is *defined*, in ticks.
 *
 * Undefined samples break the interval rather than being bridged: an undefined `Δ_D` is not a value
 * of zero, so a gap contributes no duration. SAP §2.4 defines area under the curve as the primary
 * mean multiplied by this duration, which is why it is computed separately rather than folded into
 * a normalised average.
 */
export function definedObservationDuration(
  points: readonly { readonly tick: number; readonly value: number | null }[],
): number {
  let span = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (
      previous === undefined ||
      current === undefined ||
      previous.value === null ||
      current.value === null
    ) {
      continue;
    }
    span += current.tick - previous.tick;
  }
  return span;
}

export function normalisedAuc(
  points: readonly { readonly tick: number; readonly value: number | null }[],
): number | null {
  let area = 0;
  let span = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (
      previous === undefined ||
      current === undefined ||
      previous.value === null ||
      current.value === null
    ) {
      continue;
    }
    const width = current.tick - previous.tick;
    area += ((previous.value + current.value) / 2) * width;
    span += width;
  }
  return span === 0 ? null : area / span;
}

/** Per-interval lineage counters, which sit beside the measurement rather than inside it. */
export interface IntervalRecord {
  readonly tick: number;
  readonly lineage_interval?: Record<string, Record<string, number>>;
}

export interface BundleInputs {
  readonly manifest: Record<string, unknown>;
  readonly samples: readonly Sample[];
  /**
   * Interval counters, aligned with `samples`. Attempts are recorded here per **lineage**, never
   * per organism, which is why SAP Amendment 2 restates the attempt-based sensitivity at lineage
   * level rather than as a per-organism ratio.
   */
  readonly intervals?: readonly IntervalRecord[];
}

export function readBundle(runDirectory: string): BundleInputs {
  const manifest = readJson(join(runDirectory, "manifest.json")) as Record<string, unknown>;
  const raw = readJson(join(runDirectory, "measurements.json")) as readonly {
    readonly measurement: Sample;
    readonly lineage_interval?: Record<string, Record<string, number>>;
  }[];
  return {
    manifest,
    samples: raw.map((entry) => entry.measurement),
    intervals: raw.map((entry) => ({
      tick: entry.measurement.tick,
      ...(entry.lineage_interval === undefined ? {} : { lineage_interval: entry.lineage_interval }),
    })),
  };
}

/**
 * First tick at which a series reaches `fraction` of its own asymptote.
 *
 * The asymptote is the run's post-burn-in level, but the search runs over **all** samples,
 * including those before burn-in. In this system onset completes between roughly ticks 1,000 and
 * 3,000 while burn-in is 10,000, so restricting the search to post-burn-in samples would report
 * every run as having risen before the first sample it was allowed to look at.
 */
export function onsetTick(
  samples: readonly { readonly tick: number; readonly value: number | null }[],
  asymptote: number | null,
  fraction: number,
): number | null {
  if (asymptote === null || asymptote <= 0) {
    return null;
  }
  const target = asymptote * fraction;
  for (const sample of samples) {
    if (sample.value !== null && sample.value >= target) {
      return sample.tick;
    }
  }
  return null;
}

/**
 * Reduces one run to its run-level outcomes.
 *
 * `parameters` are declared analysis parameters, not properties of the run. They must come from
 * the frozen analysis specification — normally `SAP_V1_PARAMETERS` — so they cannot be chosen
 * after seeing trajectories. A sensitivity analysis passes a different set deliberately and says
 * so; nothing here supplies a default, because a default is how an undeclared value gets used.
 */
export function runOutcomes(bundle: BundleInputs, parameters: OutcomeParameters): RunOutcomes {
  const { manifest, samples } = bundle;
  const { burnInTicks, lateWindowFraction, coverageFloor } = parameters;
  const requestedTicks = manifest["requested_ticks"] as number;
  // SAP section 2.1 averages over samples *strictly after* the burn-in tick, and section 1 fixes
  // the first included sample at 10,200. A `>=` selector admits the boundary sample at 10,000
  // and gives each full-horizon run 451 samples where the plan specifies 450.
  const afterBurnIn = samples.filter((sample) => sample.tick > burnInTicks);
  // The late window is taken from requested ticks, so a run that terminated early is not silently
  // given a different window than the plan declared.
  const lateFrom = requestedTicks * (1 - lateWindowFraction);
  const late = samples.filter((sample) => sample.tick >= lateFrom);

  const definedInformation = samples.filter((sample) => sample.lineage_information?.defined === true);
  const finalDefined = definedInformation.at(-1) ?? null;

  const totals = afterBurnIn.map((sample) => divergenceOf(sample, "total").mean_divergence);
  const hostAfterBurnIn = definedMean(
    afterBurnIn.map((sample) => divergenceOf(sample, "host").mean_divergence),
  );
  const hostSeries = samples.map((sample) => ({
    tick: sample.tick,
    value: divergenceOf(sample, "host").mean_divergence,
  }));

  const coverage = definedMean(
    afterBurnIn.map((sample) => divergenceOf(sample, "total").eligible_proportion),
  );
  // A run whose parasite count reaches zero and never recovers. Recorded as the first zero rather
  // than as "zero at the end", so a run that lost its parasites early and a run that lost them at
  // the final sample are not reported as the same event.
  const extinctionSample = samples.find((sample) => sample.state.parasite_population === 0) ?? null;

  return {
    run_id: manifest["run_id"] as string,
    condition_id: manifest["condition_id"] as string,
    replicate_id: manifest["replicate_id"] as number,
    seed: manifest["seed"] as number,
    completed_ticks: manifest["completed_ticks"] as number,
    terminal_reason: manifest["terminal_reason"] as string,
    burn_in_ticks: burnInTicks,

    host_mean_divergence_after_burn_in: hostAfterBurnIn,
    late_window_host_mean_divergence: definedMean(
      late.map((sample) => divergenceOf(sample, "host").mean_divergence),
    ),
    post_burn_in_decoupling: definedMean(
      afterBurnIn
        .filter((sample) => sample.lineage_information?.defined === true)
        .map((sample) => sample.lineage_information?.decoupling_score ?? null),
    ),

    parasite_extant_at_end: (samples.at(-1)?.state.parasite_population ?? 0) > 0,
    parasite_extinction_tick: extinctionSample?.tick ?? null,

    mean_divergence_after_burn_in: definedMean(totals),
    sap_auc_host_delta_ticks: ((): number | null => {
      const hostPoints = afterBurnIn.map((sample) => ({
        tick: sample.tick,
        value: divergenceOf(sample, "host").mean_divergence,
      }));
      const duration = definedObservationDuration(hostPoints);
      const hostMean = definedMean(hostPoints.map((point) => point.value));
      return hostMean === null || duration === 0 ? null : hostMean * duration;
    })(),
    late_window_mean_divergence: definedMean(
      late.map((sample) => divergenceOf(sample, "total").mean_divergence),
    ),
    parasite_mean_divergence_after_burn_in: definedMean(
      afterBurnIn.map((sample) => divergenceOf(sample, "parasite").mean_divergence),
    ),
    mean_eligible_proportion_after_burn_in: coverage,
    mean_inactive_proportion_after_burn_in: definedMean(
      afterBurnIn.map((sample) => divergenceOf(sample, "total").inactive_proportion),
    ),

    // Undefined coverage cannot clear a floor. A run with nothing to measure is not reliably
    // estimable, and treating a null as passing would let an empty run into the primary tests.
    divergence_reliably_estimable: coverage !== null && coverage >= coverageFloor,

    onset_tick_50: onsetTick(hostSeries, hostAfterBurnIn, 0.5),
    onset_tick_90: onsetTick(hostSeries, hostAfterBurnIn, 0.9),

    final_defined_theil_u: finalDefined?.lineage_information?.theil_u_function_given_lineage ?? null,
    final_defined_decoupling_score: finalDefined?.lineage_information?.decoupling_score ?? null,
    lineage_information_defined_samples: definedInformation.length,
    lineage_information_undefined_samples: samples.length - definedInformation.length,
    degenerate_sample_proportion:
      samples.length === 0 ? 0 : (samples.length - definedInformation.length) / samples.length,
    samples_total: samples.length,
    samples_with_defined_divergence: totals.filter((value) => value !== null).length,
    undefined_reason:
      samples.at(-1)?.lineage_information?.undefined_reason ?? null,
  };
}
