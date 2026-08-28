import { describe, expect, it } from 'vitest';

import {
  approximateOrganismTicks,
  computeExposureMetrics,
  computeOccupancyMetrics,
  computeSampledLineageState,
  conditionalSuccessRatio,
  definedMetric,
  definedOnlyMean,
  ratePerThousandActivations,
  requireConsistentReportEveryTicks,
  undefinedMetric,
} from '../../src/diagnostics/metrics.ts';
import type { TimeseriesSample } from '../../src/diagnostics/timeseries.ts';

const sample = (
  tick: number,
  populationTotal: number,
  overrides: Partial<TimeseriesSample> = {},
): TimeseriesSample => ({
  runId: 'run-1',
  tick,
  sampleKind: 'scheduled',
  populationTotal,
  hostPopulation: populationTotal,
  parasitePopulation: 0,
  minimumGenomeBoundCount: 0,
  maximumGenomeBoundCount: 0,
  hostParasiteContactEdges: 0,
  resourceStockProportion: 0.5,
  resourceDepletedCells: 0,
  cumulativeBirths: 0,
  cumulativeDeaths: 0,
  cumulativeAutonomousAttempts: 0,
  cumulativeAutonomousSuccesses: 0,
  cumulativeExploitativeAttempts: 0,
  cumulativeExploitativeSuccesses: 0,
  cumulativeHgtAttempts: 0,
  cumulativeHgtSuccesses: 0,
  intervalAutonomousSuccesses: 0,
  intervalExploitativeSuccesses: 0,
  intervalHgtAttempts: 0,
  intervalHgtSuccesses: 0,
  totalEligibleProportion: null,
  intervalHostSpliceNoNeighbour: 0,
  intervalParasiteSpliceNoNeighbour: 0,
  ...overrides,
});

const counters = {
  activations: 20,
  births: 5,
  deaths_energy: 1,
  deaths_exogenous: 2,
  deaths_exploitation: 1,
  autonomous_attempts: 4,
  autonomous_successes: 2,
  exploitative_attempts: 12,
  exploitative_successes: 3,
  hgt_attempts: 5,
  hgt_successes: 1,
  computation_rewards: 6,
  energy_transferred: 7,
} as const;

describe('corrected exposure metrics', () => {
  it('computes a hand-checked per-1,000-activation rate', () => {
    expect(ratePerThousandActivations(5, 20)).toEqual({
      value: 250,
      undefinedReason: null,
    });
    expect(computeExposureMetrics(counters).births_rate_per_1000_activations.value).toBe(250);
  });

  it('computes all three conditional success ratios without a population term', () => {
    const result = computeExposureMetrics(counters);
    expect(result.autonomous_success_ratio.value).toBe(0.5);
    expect(result.exploitative_success_ratio.value).toBe(0.25);
    expect(result.hgt_success_ratio.value).toBe(0.2);
  });
});

describe('occupancy and approximate organism-ticks', () => {
  it('selects the late window from requested ticks when extinction ends the run early', () => {
    const result = computeOccupancyMetrics(
      [sample(70, 10), sample(80, 8)],
      10,
      10,
      100,
      80,
      'extinction',
      { numerator: 1, denominator: 4 },
    );

    // Requested-tick boundary is 75, so only tick 80 contributes. A completed-tick boundary
    // would incorrectly include both samples and produce 0.09.
    expect(result.late_window_mean_occupancy.value).toBe(0.08);
    expect(result.late_window_maximum_occupancy.value).toBe(0.08);
    expect(result.whole_run_maximum_occupancy.value).toBe(0.1);
  });

  it('integrates an irregular sample series by the trapezoidal rule', () => {
    // (3 - 0) * (2 + 4) / 2 = 9; (10 - 3) * (4 + 6) / 2 = 35.
    expect(approximateOrganismTicks([sample(0, 2), sample(3, 4), sample(10, 6)])).toEqual({
      value: 44,
      undefinedReason: null,
    });
  });
});

describe('explicit undefined handling and defined-only aggregation', () => {
  it('emits every frozen undefined reason in its triggering case', () => {
    expect(ratePerThousandActivations(0, 0)).toEqual(undefinedMetric('no_activations'));
    expect(conditionalSuccessRatio(0, 0)).toEqual(undefinedMetric('no_attempts'));
    expect(approximateOrganismTicks([])).toEqual(undefinedMetric('no_samples'));

    const earlyExtinction = computeOccupancyMetrics(
      [sample(70, 5)],
      10,
      10,
      100,
      70,
      'extinction',
      { numerator: 1, denominator: 4 },
    );
    expect(earlyExtinction.late_window_mean_occupancy).toEqual(
      undefinedMetric('extinct_before_late_window'),
    );
  });

  it('excludes undefined campaign contributors and reports both counts', () => {
    expect(
      definedOnlyMean([definedMetric(2), undefinedMetric('no_attempts'), definedMetric(4)]),
    ).toEqual({ mean: definedMetric(3), definedN: 2, undefinedN: 1 });
  });

  it('reports one campaign sampling interval only when every contributor agrees', () => {
    expect(requireConsistentReportEveryTicks([200, 200, 200], 'campaign-a')).toBe(200);
    expect(() => requireConsistentReportEveryTicks([100, 200], 'campaign-a')).toThrow(
      /mixes report_every_ticks contributors: 100, 200/,
    );
  });
});

describe('amended sampled lineage state', () => {
  it('never fabricates a tick-0 persistence observation when the first retained row is tick 200', () => {
    const state = computeSampledLineageState(
      [
        sample(200, 8, { hostPopulation: 5, parasitePopulation: 3 }),
        sample(400, 7, { hostPopulation: 7, parasitePopulation: 0 }),
      ],
      400,
      'completed',
    );

    expect(state.bothLineagesObservedThroughTick).toEqual({ value: 200, undefinedReason: null });
    expect(state.firstSampledLineageAbsenceTick).toEqual({ value: 400, undefinedReason: null });
    expect(state.extinctLineage).toEqual({ value: 'parasite', undefinedReason: null });
  });

  it('labels first absence as sampled and reports no exact global extinction without a terminal zero row', () => {
    const state = computeSampledLineageState(
      [sample(200, 3, { hostPopulation: 3, parasitePopulation: 0 })],
      200,
      'completed',
    );

    expect(state.firstSampledLineageAbsenceTick.value).toBe(200);
    expect(state.globalExtinctionTick).toEqual({
      value: null,
      undefinedReason: 'no_global_extinction',
    });
  });

  it('emits an exact global extinction tick only for a verified terminal zero-population row', () => {
    const state = computeSampledLineageState(
      [
        sample(200, 2, { hostPopulation: 2, parasitePopulation: 0 }),
        sample(317, 0, {
          sampleKind: 'terminal',
          hostPopulation: 0,
          parasitePopulation: 0,
        }),
      ],
      317,
      'extinction',
    );

    expect(state.globalExtinctionTick).toEqual({ value: 317, undefinedReason: null });
  });

  it('reports sampled cross-lineage contact separately from lineage persistence', () => {
    const state = computeSampledLineageState(
      [
        sample(200, 8, {
          hostPopulation: 5,
          parasitePopulation: 3,
          hostParasiteContactEdges: 2,
        }),
        sample(400, 8, { hostPopulation: 5, parasitePopulation: 3 }),
      ],
      400,
      'completed',
    );

    expect(state.bothLineagesObservedThroughTick.value).toBe(400);
    expect(state.lastSampleTickWithCrossLineageContact.value).toBe(200);
    expect(state.firstSampledLineageAbsenceTick.undefinedReason).toBe(
      'no_sampled_lineage_absence',
    );
  });
});
