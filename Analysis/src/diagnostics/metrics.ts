/** Corrected SCI-001 exposure, occupancy, and approximate organism-tick metrics. */

import { AuditError } from './discovery.ts';
import type { TimeseriesSample } from './timeseries.ts';

export type UndefinedReason =
  | 'no_attempts'
  | 'no_activations'
  | 'no_samples'
  | 'extinct_before_late_window';

export type MetricValue =
  | { readonly value: number; readonly undefinedReason: null }
  | { readonly value: null; readonly undefinedReason: UndefinedReason };

export const definedMetric = (value: number): MetricValue => {
  if (!Number.isFinite(value)) {
    throw new AuditError(`Metric value must be finite, received ${String(value)}`);
  }
  return { value, undefinedReason: null };
};

export const undefinedMetric = (reason: UndefinedReason): MetricValue => ({
  value: null,
  undefinedReason: reason,
});

export interface CumulativeCounters {
  readonly activations: number;
  readonly births: number;
  readonly deaths_energy: number;
  readonly deaths_exogenous: number;
  readonly deaths_exploitation: number;
  readonly autonomous_attempts: number;
  readonly autonomous_successes: number;
  readonly exploitative_attempts: number;
  readonly exploitative_successes: number;
  readonly hgt_attempts: number;
  readonly hgt_successes: number;
  readonly computation_rewards: number;
  readonly energy_transferred: number;
}

export interface ExposureMetrics {
  readonly births_rate_per_1000_activations: MetricValue;
  readonly deaths_total_rate_per_1000_activations: MetricValue;
  readonly autonomous_attempts_rate_per_1000_activations: MetricValue;
  readonly autonomous_successes_rate_per_1000_activations: MetricValue;
  readonly exploitative_attempts_rate_per_1000_activations: MetricValue;
  readonly exploitative_successes_rate_per_1000_activations: MetricValue;
  readonly hgt_attempts_rate_per_1000_activations: MetricValue;
  readonly hgt_successes_rate_per_1000_activations: MetricValue;
  readonly computation_rewards_rate_per_1000_activations: MetricValue;
  readonly energy_transferred_rate_per_1000_activations: MetricValue;
  readonly autonomous_success_ratio: MetricValue;
  readonly exploitative_success_ratio: MetricValue;
  readonly hgt_success_ratio: MetricValue;
}

const assertCount = (value: number, name: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new AuditError(`${name} must be a non-negative safe integer, received ${value}`);
  }
};

export const ratePerThousandActivations = (
  numerator: number,
  activations: number,
): MetricValue => {
  assertCount(numerator, 'Rate numerator');
  assertCount(activations, 'Activations');
  return activations === 0
    ? undefinedMetric('no_activations')
    : definedMetric((1_000 * numerator) / activations);
};

export const conditionalSuccessRatio = (successes: number, attempts: number): MetricValue => {
  assertCount(successes, 'Successes');
  assertCount(attempts, 'Attempts');
  if (successes > attempts) {
    throw new AuditError(`Successes (${successes}) exceed attempts (${attempts})`);
  }
  return attempts === 0
    ? undefinedMetric('no_attempts')
    : definedMetric(successes / attempts);
};

/** Applies the frozen §4.2 and §4.3 formulas to manifest cumulative counters. */
export const computeExposureMetrics = (counters: CumulativeCounters): ExposureMetrics => {
  for (const [name, value] of Object.entries(counters)) {
    assertCount(value, `Counter ${name}`);
  }
  const deathsTotal =
    counters.deaths_energy + counters.deaths_exogenous + counters.deaths_exploitation;
  if (!Number.isSafeInteger(deathsTotal)) {
    throw new AuditError(`Total deaths exceed the safe-integer range: ${deathsTotal}`);
  }

  const rate = (value: number): MetricValue =>
    ratePerThousandActivations(value, counters.activations);
  return {
    births_rate_per_1000_activations: rate(counters.births),
    deaths_total_rate_per_1000_activations: rate(deathsTotal),
    autonomous_attempts_rate_per_1000_activations: rate(counters.autonomous_attempts),
    autonomous_successes_rate_per_1000_activations: rate(counters.autonomous_successes),
    exploitative_attempts_rate_per_1000_activations: rate(counters.exploitative_attempts),
    exploitative_successes_rate_per_1000_activations: rate(counters.exploitative_successes),
    hgt_attempts_rate_per_1000_activations: rate(counters.hgt_attempts),
    hgt_successes_rate_per_1000_activations: rate(counters.hgt_successes),
    computation_rewards_rate_per_1000_activations: rate(counters.computation_rewards),
    energy_transferred_rate_per_1000_activations: rate(counters.energy_transferred),
    autonomous_success_ratio: conditionalSuccessRatio(
      counters.autonomous_successes,
      counters.autonomous_attempts,
    ),
    exploitative_success_ratio: conditionalSuccessRatio(
      counters.exploitative_successes,
      counters.exploitative_attempts,
    ),
    hgt_success_ratio: conditionalSuccessRatio(counters.hgt_successes, counters.hgt_attempts),
  };
};

export interface RationalFraction {
  readonly numerator: number;
  readonly denominator: number;
}

export const lateWindowStartTick = (
  requestedTicks: number,
  lateWindowFraction: RationalFraction,
): number => {
  assertCount(requestedTicks, 'Requested ticks');
  assertCount(lateWindowFraction.numerator, 'Late-window numerator');
  assertCount(lateWindowFraction.denominator, 'Late-window denominator');
  if (
    lateWindowFraction.denominator === 0 ||
    lateWindowFraction.numerator > lateWindowFraction.denominator
  ) {
    throw new AuditError(
      `Late-window fraction must be in [0, 1], received ${lateWindowFraction.numerator}/${lateWindowFraction.denominator}`,
    );
  }
  return requestedTicks * (1 - lateWindowFraction.numerator / lateWindowFraction.denominator);
};

/** Boundary samples are baselines; the final fractional window contains samples after it. */
export const selectLateSamples = (
  samples: readonly TimeseriesSample[],
  requestedTicks: number,
  lateWindowFraction: RationalFraction,
): TimeseriesSample[] => {
  const start = lateWindowStartTick(requestedTicks, lateWindowFraction);
  return samples.filter((sample) => sample.tick > start && sample.tick <= requestedTicks);
};

export interface OccupancyMetrics {
  readonly late_window_mean_occupancy: MetricValue;
  readonly late_window_maximum_occupancy: MetricValue;
  readonly whole_run_maximum_occupancy: MetricValue;
}

const maximum = (values: readonly number[]): number => Math.max(...values);
const mean = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0) / values.length;

export const computeOccupancyMetrics = (
  samples: readonly TimeseriesSample[],
  gridWidth: number,
  gridHeight: number,
  requestedTicks: number,
  completedTicks: number,
  terminalReason: string,
  lateWindowFraction: RationalFraction,
): OccupancyMetrics => {
  assertCount(gridWidth, 'Grid width');
  assertCount(gridHeight, 'Grid height');
  if (gridWidth === 0 || gridHeight === 0) {
    throw new AuditError(`Grid dimensions must be positive, received ${gridWidth} x ${gridHeight}`);
  }
  const capacity = gridWidth * gridHeight;
  if (!Number.isSafeInteger(capacity)) {
    throw new AuditError(`Grid capacity exceeds the safe-integer range: ${capacity}`);
  }

  const occupancies = samples.map((sample) => {
    if (sample.populationTotal > capacity) {
      throw new AuditError(
        `Run ${sample.runId} tick ${sample.tick} population ${sample.populationTotal} exceeds grid capacity ${capacity}`,
      );
    }
    return sample.populationTotal / capacity;
  });
  const wholeRunMaximum =
    occupancies.length === 0
      ? undefinedMetric('no_samples')
      : definedMetric(maximum(occupancies));

  const lateSamples = selectLateSamples(samples, requestedTicks, lateWindowFraction);
  if (lateSamples.length === 0) {
    const start = lateWindowStartTick(requestedTicks, lateWindowFraction);
    const reason: UndefinedReason =
      terminalReason === 'extinction' && completedTicks <= start
        ? 'extinct_before_late_window'
        : 'no_samples';
    return {
      late_window_mean_occupancy: undefinedMetric(reason),
      late_window_maximum_occupancy: undefinedMetric(reason),
      whole_run_maximum_occupancy: wholeRunMaximum,
    };
  }
  const lateOccupancies = lateSamples.map((sample) => sample.populationTotal / capacity);
  return {
    late_window_mean_occupancy: definedMetric(mean(lateOccupancies)),
    late_window_maximum_occupancy: definedMetric(maximum(lateOccupancies)),
    whole_run_maximum_occupancy: wholeRunMaximum,
  };
};

/** Trapezoidal integration over the retained samples; deliberately labelled approximate. */
export const approximateOrganismTicks = (
  samples: readonly TimeseriesSample[],
): MetricValue => {
  if (samples.length === 0) {
    return undefinedMetric('no_samples');
  }
  let total = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1] as TimeseriesSample;
    const current = samples[index] as TimeseriesSample;
    total +=
      (current.tick - previous.tick) *
      ((previous.populationTotal + current.populationTotal) / 2);
  }
  return definedMetric(total);
};

export interface DefinedOnlyMean {
  readonly mean: MetricValue;
  readonly definedN: number;
  readonly undefinedN: number;
}

/** Excludes undefined contributors and reports both contributor counts (§4.6). */
export const definedOnlyMean = (metrics: readonly MetricValue[]): DefinedOnlyMean => {
  const values = metrics.flatMap((metric) => (metric.value === null ? [] : [metric.value]));
  return {
    mean: values.length === 0 ? undefinedMetric('no_samples') : definedMetric(mean(values)),
    definedN: values.length,
    undefinedN: metrics.length - values.length,
  };
};

/** Campaign summaries may report one interval only when every contributing run agrees. */
export const requireConsistentReportEveryTicks = (
  intervals: readonly number[],
  campaign: string,
): number => {
  if (intervals.length === 0) {
    throw new AuditError(`Campaign ${campaign} has no report interval contributors`);
  }
  for (const interval of intervals) {
    if (!Number.isSafeInteger(interval) || interval <= 0) {
      throw new AuditError(
        `Campaign ${campaign} has invalid report_every_ticks contributor ${interval}`,
      );
    }
  }
  const unique = new Set(intervals);
  if (unique.size !== 1) {
    throw new AuditError(
      `Campaign ${campaign} mixes report_every_ticks contributors: ${[...unique].sort((a, b) => a - b).join(', ')}`,
    );
  }
  return intervals[0] as number;
};

export type SampledStateUndefinedReason =
  | 'not_observed_in_retained_samples'
  | 'no_sampled_lineage_absence'
  | 'no_global_extinction';

export type SampledTick =
  | { readonly value: number; readonly undefinedReason: null }
  | { readonly value: null; readonly undefinedReason: SampledStateUndefinedReason };

export type SampledExtinctLineage =
  | { readonly value: 'host' | 'parasite' | 'both'; readonly undefinedReason: null }
  | { readonly value: null; readonly undefinedReason: 'no_sampled_lineage_absence' };

export interface SampledLineageState {
  readonly bothLineagesObservedThroughTick: SampledTick;
  readonly firstSampledLineageAbsenceTick: SampledTick;
  readonly extinctLineage: SampledExtinctLineage;
  readonly globalExtinctionTick: SampledTick;
  readonly lastSampleTickWithCrossLineageContact: SampledTick;
}

/** Implements the amended sampled-state descriptions without fabricating a tick-0 sample. */
export const computeSampledLineageState = (
  samples: readonly TimeseriesSample[],
  completedTicks: number,
  terminalReason: string,
): SampledLineageState => {
  const samplesWithBoth = samples.filter(
    (sample) => sample.hostPopulation > 0 && sample.parasitePopulation > 0,
  );
  const firstAbsence = samples.find(
    (sample) => sample.hostPopulation === 0 || sample.parasitePopulation === 0,
  );
  const contactSamples = samples.filter((sample) => sample.hostParasiteContactEdges > 0);
  const terminalGlobalExtinction = samples.find(
    (sample) =>
      sample.tick === completedTicks &&
      sample.sampleKind === 'terminal' &&
      sample.populationTotal === 0,
  );

  const bothLineagesObservedThroughTick: SampledTick =
    samplesWithBoth.length === 0
      ? { value: null, undefinedReason: 'not_observed_in_retained_samples' }
      : { value: (samplesWithBoth.at(-1) as TimeseriesSample).tick, undefinedReason: null };
  const firstSampledLineageAbsenceTick: SampledTick =
    firstAbsence === undefined
      ? { value: null, undefinedReason: 'no_sampled_lineage_absence' }
      : { value: firstAbsence.tick, undefinedReason: null };
  const extinctLineage: SampledExtinctLineage =
    firstAbsence === undefined
      ? { value: null, undefinedReason: 'no_sampled_lineage_absence' }
      : {
          value:
            firstAbsence.hostPopulation === 0 && firstAbsence.parasitePopulation === 0
              ? 'both'
              : firstAbsence.hostPopulation === 0
                ? 'host'
                : 'parasite',
          undefinedReason: null,
        };
  const globalExtinctionTick: SampledTick =
    terminalReason === 'extinction' && terminalGlobalExtinction !== undefined
      ? { value: completedTicks, undefinedReason: null }
      : { value: null, undefinedReason: 'no_global_extinction' };
  const lastSampleTickWithCrossLineageContact: SampledTick =
    contactSamples.length === 0
      ? { value: null, undefinedReason: 'not_observed_in_retained_samples' }
      : { value: (contactSamples.at(-1) as TimeseriesSample).tick, undefinedReason: null };

  return {
    bothLineagesObservedThroughTick,
    firstSampledLineageAbsenceTick,
    extinctLineage,
    globalExtinctionTick,
    lastSampleTickWithCrossLineageContact,
  };
};
