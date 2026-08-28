/** Frozen v8 screening-gate re-evaluation from the four allowed retained per-run files. */

import { readFileSync } from 'node:fs';

import { AuditError } from './discovery.ts';
import {
  computeOccupancyMetrics,
  computeSampledLineageState,
  lateWindowStartTick,
  selectLateSamples,
  type CumulativeCounters,
  type RationalFraction,
} from './metrics.ts';
import type { TimeseriesSample } from './timeseries.ts';

export interface LoadedSweepSpecification {
  readonly lateWindowFraction: RationalFraction;
  readonly reportEveryTicks: number;
  readonly screeningAcceptance: Readonly<Record<string, number>>;
}

const requireFiniteNumber = (value: unknown, label: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AuditError(`${label} must be a finite number`);
  }
  return value;
};

/** Loads thresholds and the late-window fraction at runtime; no threshold is compiled in. */
export const loadSweepSpecification = (path: string): LoadedSweepSpecification => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch (error) {
    throw new AuditError(`Sweep specification "${path}" is not valid JSON: ${(error as Error).message}`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new AuditError(`Sweep specification "${path}" must be a JSON object`);
  }
  const document = parsed as Record<string, unknown>;
  const rawFraction = document['late_window_fraction'];
  if (typeof rawFraction !== 'object' || rawFraction === null || Array.isArray(rawFraction)) {
    throw new AuditError(`Sweep specification "${path}" has no late_window_fraction object`);
  }
  const fraction = rawFraction as Record<string, unknown>;
  const numerator = requireFiniteNumber(
    fraction['numerator'],
    `Sweep specification "${path}" late_window_fraction.numerator`,
  );
  const denominator = requireFiniteNumber(
    fraction['denominator'],
    `Sweep specification "${path}" late_window_fraction.denominator`,
  );
  // Reuse the metric-layer validation now so an invalid protocol fails before any row is made.
  lateWindowStartTick(1, { numerator, denominator });

  const rawAcceptance = document['screening_acceptance'];
  if (
    typeof rawAcceptance !== 'object' ||
    rawAcceptance === null ||
    Array.isArray(rawAcceptance)
  ) {
    throw new AuditError(`Sweep specification "${path}" has no screening_acceptance object`);
  }
  const screeningAcceptance: Record<string, number> = {};
  for (const [key, value] of Object.entries(rawAcceptance as Record<string, unknown>)) {
    screeningAcceptance[key] = requireFiniteNumber(
      value,
      `Sweep specification "${path}" screening_acceptance.${key}`,
    );
  }
  if (Object.keys(screeningAcceptance).length === 0) {
    throw new AuditError(`Sweep specification "${path}" has no screening_acceptance thresholds`);
  }
  const reportEveryTicks = requireFiniteNumber(
    document['report_every_ticks'],
    `Sweep specification "${path}" report_every_ticks`,
  );
  if (!Number.isSafeInteger(reportEveryTicks) || reportEveryTicks <= 0) {
    throw new AuditError(
      `Sweep specification "${path}" report_every_ticks must be a positive safe integer`,
    );
  }
  return {
    lateWindowFraction: { numerator, denominator },
    reportEveryTicks,
    screeningAcceptance,
  };
};

export interface ScreenCounters extends CumulativeCounters {
  readonly energy_created: number;
}

export interface ScreenRun {
  readonly runId: string;
  readonly dirtyWorktree: boolean;
  readonly requestedTicks: number;
  readonly completedTicks: number;
  readonly terminalReason: string;
  readonly gridWidth: number;
  readonly gridHeight: number;
  readonly configuredMinimumGenomeLength: number;
  readonly configuredMaximumGenomeLength: number;
  /** Configured energy credits for every opcode counted by `computation_rewards`. */
  readonly computationRewardAmounts: readonly number[];
  readonly counters: ScreenCounters;
  readonly finalPopulation: {
    readonly populationTotal: number;
    readonly hostPopulation: number;
    readonly parasitePopulation: number;
  };
  readonly samples: readonly TimeseriesSample[];
}

export type ScreenResult = 'pass' | 'fail' | 'not_derivable';
export type ScreenComparison = '>=' | '<=' | 'disabled_at_zero_threshold';
type ActiveScreenComparison = Exclude<ScreenComparison, 'disabled_at_zero_threshold'>;

export interface ScreenEvaluation {
  readonly runId: string;
  readonly gateKey: string;
  readonly observedValue: number | null;
  readonly threshold: number;
  readonly comparison: ScreenComparison;
  readonly result: ScreenResult;
  readonly reason: string;
}

interface Observation {
  readonly value: number | null;
  readonly reason: string;
}

const observed = (value: number): Observation => ({
  value,
  reason: 'derived_from_retained_fields',
});
const unavailable = (reason: string): Observation => ({ value: null, reason });
const mean = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0) / values.length;
const sum = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0);

const comparisonFor = (gateKey: string): ActiveScreenComparison =>
  gateKey.includes('_max') ||
  gateKey.startsWith('maximum_') ||
  gateKey === 'late_maximum_occupancy'
    ? '<='
    : '>=';

const evaluate = (
  runId: string,
  gateKey: string,
  threshold: number,
  comparison: ActiveScreenComparison,
  observation: Observation,
): ScreenEvaluation => {
  if (observation.value === null) {
    return {
      runId,
      gateKey,
      observedValue: null,
      threshold,
      comparison,
      result: 'not_derivable',
      reason: observation.reason,
    };
  }
  const passes =
    comparison === '>='
      ? observation.value >= threshold
      : observation.value <= threshold;
  return {
    runId,
    gateKey,
    observedValue: observation.value,
    threshold,
    comparison,
    result: passes ? 'pass' : 'fail',
    reason: observation.reason,
  };
};

/** Returns one row per threshold for a clean run; dirty runs intentionally return no rows. */
export const evaluateScreen = (
  run: ScreenRun,
  sweep: LoadedSweepSpecification,
): ScreenEvaluation[] => {
  if (run.dirtyWorktree) {
    return [];
  }

  const capacity = run.gridWidth * run.gridHeight;
  if (!Number.isSafeInteger(capacity) || capacity <= 0) {
    throw new AuditError(`Run ${run.runId} has invalid grid ${run.gridWidth} x ${run.gridHeight}`);
  }
  const occupancy = computeOccupancyMetrics(
    run.samples,
    run.gridWidth,
    run.gridHeight,
    run.requestedTicks,
    run.completedTicks,
    run.terminalReason,
    sweep.lateWindowFraction,
  );
  const sampledState = computeSampledLineageState(
    run.samples,
    run.completedTicks,
    run.terminalReason,
  );
  const lateSamples = selectLateSamples(
    run.samples,
    run.requestedTicks,
    sweep.lateWindowFraction,
  );
  const lateStart = lateWindowStartTick(run.requestedTicks, sweep.lateWindowFraction);
  const hasExactLateBoundary =
    lateStart === 0 || run.samples.some((sample) => sample.tick === lateStart);
  const lateIntervalObservation = (selector: (sample: TimeseriesSample) => number): Observation => {
    if (!hasExactLateBoundary) {
      return unavailable('late_window_boundary_not_retained');
    }
    if (lateSamples.length === 0) {
      return unavailable(
        run.terminalReason === 'extinction' && run.completedTicks <= lateStart
          ? 'extinct_before_late_window'
          : 'no_late_window_samples',
      );
    }
    return observed(sum(lateSamples.map(selector)));
  };

  const lateEligibility = lateSamples.flatMap((sample) =>
    sample.totalEligibleProportion === null ? [] : [sample.totalEligibleProportion],
  );
  const genomeBoundProportions = run.samples.flatMap((sample) => {
    if (sample.populationTotal === 0) {
      return [];
    }
    const boundaryCount =
      run.configuredMinimumGenomeLength === run.configuredMaximumGenomeLength
        ? sample.minimumGenomeBoundCount
        : sample.minimumGenomeBoundCount + sample.maximumGenomeBoundCount;
    if (boundaryCount > sample.populationTotal) {
      throw new AuditError(
        `Run ${run.runId} tick ${sample.tick} genome-bound count ${boundaryCount} exceeds population ${sample.populationTotal}`,
      );
    }
    return [boundaryCount / sample.populationTotal];
  });
  const lateResourceStocks = lateSamples.flatMap((sample) =>
    sample.resourceStockProportion === null ? [] : [sample.resourceStockProportion],
  );
  const lateDepletedProportions = lateSamples.map(
    (sample) => sample.resourceDepletedCells / capacity,
  );

  const final = run.finalPopulation;
  if (final.hostPopulation + final.parasitePopulation !== final.populationTotal) {
    throw new AuditError(
      `Run ${run.runId} final lineage counts do not sum to final population`,
    );
  }
  // `computation_rewards` counts reward events, while credited energy can be truncated at the
  // organism energy cap. The allowed retained files contain total created/discarded energy but
  // not created energy by source, so multiplying the count by a configured nominal reward would
  // be an approximation rather than a re-derivation of this historical gate.
  const computationShare = unavailable(
    'credited_computation_energy_not_retained',
  );

  const observations: Readonly<Record<string, Observation>> = {
    late_mean_occupancy_min:
      occupancy.late_window_mean_occupancy.value === null
        ? unavailable(occupancy.late_window_mean_occupancy.undefinedReason)
        : observed(occupancy.late_window_mean_occupancy.value),
    late_mean_occupancy_max:
      occupancy.late_window_mean_occupancy.value === null
        ? unavailable(occupancy.late_window_mean_occupancy.undefinedReason)
        : observed(occupancy.late_window_mean_occupancy.value),
    late_maximum_occupancy:
      occupancy.late_window_maximum_occupancy.value === null
        ? unavailable(occupancy.late_window_maximum_occupancy.undefinedReason)
        : observed(occupancy.late_window_maximum_occupancy.value),
    minimum_late_autonomous_successes: lateIntervalObservation(
      (sample) => sample.intervalAutonomousSuccesses,
    ),
    minimum_late_exploitative_successes: lateIntervalObservation(
      (sample) => sample.intervalExploitativeSuccesses,
    ),
    minimum_late_hgt_donor_opportunities: lateIntervalObservation((sample) => {
      const opportunities =
        sample.intervalHgtAttempts -
        sample.intervalHostSpliceNoNeighbour -
        sample.intervalParasiteSpliceNoNeighbour;
      if (opportunities < 0) {
        throw new AuditError(
          `Run ${run.runId} tick ${sample.tick} has more HGT no-neighbour results than attempts`,
        );
      }
      return opportunities;
    }),
    minimum_late_hgt_successes: lateIntervalObservation(
      (sample) => sample.intervalHgtSuccesses,
    ),
    minimum_late_eligibility_proportion:
      lateEligibility.length === 0
        ? unavailable('no_defined_late_eligibility_samples')
        : observed(mean(lateEligibility)),
    computation_created_energy_share_min: computationShare,
    computation_created_energy_share_max: computationShare,
    maximum_sampled_genome_bound_proportion:
      genomeBoundProportions.length === 0
        ? unavailable('no_living_samples_with_genome_bounds')
        : observed(Math.max(...genomeBoundProportions)),
    minimum_late_mean_host_parasite_contact_edges:
      lateSamples.length === 0
        ? unavailable('no_late_window_samples')
        : observed(mean(lateSamples.map((sample) => sample.hostParasiteContactEdges))),
    minimum_whole_run_exploitative_successes: observed(
      run.counters.exploitative_successes,
    ),
    late_mean_resource_stock_proportion_min:
      lateResourceStocks.length === 0
        ? unavailable('no_defined_late_resource_samples')
        : observed(mean(lateResourceStocks)),
    late_mean_resource_stock_proportion_max:
      lateResourceStocks.length === 0
        ? unavailable('no_defined_late_resource_samples')
        : observed(mean(lateResourceStocks)),
    maximum_late_mean_depleted_cell_proportion:
      lateDepletedProportions.length === 0
        ? unavailable('no_late_window_samples')
        : observed(mean(lateDepletedProportions)),
    maximum_projected_single_run_minutes: unavailable(
      'performance_projection_not_in_allowed_per_run_files',
    ),
    maximum_peak_rss_bytes: unavailable('peak_rss_not_in_allowed_per_run_files'),
  };

  const interactionKey = 'minimum_both_lineages_observed_through_tick';
  const results: ScreenEvaluation[] = [];
  for (const gateKey of Object.keys(sweep.screeningAcceptance).sort()) {
    const threshold = sweep.screeningAcceptance[gateKey] as number;
    const comparison = comparisonFor(gateKey);
    if (gateKey === 'minimum_final_lineage_proportion') {
      results.push(
        threshold === 0
          ? {
              runId: run.runId,
              gateKey,
              observedValue: null,
              threshold,
              comparison: 'disabled_at_zero_threshold',
              result: 'pass',
              reason: 'final_lineage_selection_disabled',
            }
          : {
              runId: run.runId,
              gateKey,
              observedValue: null,
              threshold,
              comparison: '>=',
              result: 'not_derivable',
              reason: 'nonzero_final_lineage_threshold_out_of_scope',
            },
      );
      continue;
    }
    if (gateKey === interactionKey) {
      const both = sampledState.bothLineagesObservedThroughTick.value;
      const contact = sampledState.lastSampleTickWithCrossLineageContact.value;
      if (both === null || contact === null) {
        const reasons: string[] = [];
        if (both === null) {
          reasons.push('no_retained_sample_with_both_lineages');
        }
        if (contact === null) {
          reasons.push('no_retained_sample_with_cross_lineage_contact');
        }
        results.push({
          runId: run.runId,
          gateKey,
          observedValue: null,
          threshold,
          comparison: '>=',
          result: 'fail',
          reason: reasons.join('|'),
        });
      } else {
        results.push(
          evaluate(run.runId, gateKey, threshold, '>=', {
            value: Math.min(both, contact),
            reason: 'minimum_of_sampled_lineage_and_contact_ticks',
          }),
        );
      }
      continue;
    }
    results.push(
      evaluate(
        run.runId,
        gateKey,
        threshold,
        comparison,
        observations[gateKey] ?? unavailable('threshold_key_not_supported_by_audit'),
      ),
    );
  }
  return results;
};
