import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { screenEvaluationRow } from '../../src/diagnostics/audit.ts';
import {
  evaluateScreen,
  loadSweepSpecification,
  type ScreenRun,
} from '../../src/diagnostics/screen.ts';
import type { TimeseriesSample } from '../../src/diagnostics/timeseries.ts';

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'sci-001c-screen-'));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

const sample = (tick: number, contactEdges = 2): TimeseriesSample => ({
  runId: 'clean-run',
  tick,
  sampleKind: 'scheduled',
  populationTotal: 8,
  hostPopulation: 5,
  parasitePopulation: 3,
  minimumGenomeBoundCount: 0,
  maximumGenomeBoundCount: 1,
  hostParasiteContactEdges: contactEdges,
  resourceStockProportion: 0.5,
  resourceDepletedCells: 1,
  cumulativeBirths: tick,
  cumulativeDeaths: 0,
  cumulativeAutonomousAttempts: tick,
  cumulativeAutonomousSuccesses: tick / 2,
  cumulativeExploitativeAttempts: tick,
  cumulativeExploitativeSuccesses: tick / 4,
  cumulativeHgtAttempts: tick,
  cumulativeHgtSuccesses: tick / 4,
  intervalAutonomousSuccesses: 2,
  intervalExploitativeSuccesses: 1,
  intervalHgtAttempts: 3,
  intervalHgtSuccesses: 1,
  totalEligibleProportion: 0.5,
  intervalHostSpliceNoNeighbour: 1,
  intervalParasiteSpliceNoNeighbour: 0,
});

const run = (overrides: Partial<ScreenRun> = {}): ScreenRun => ({
  runId: 'clean-run',
  dirtyWorktree: false,
  requestedTicks: 400,
  completedTicks: 400,
  terminalReason: 'completed',
  gridWidth: 10,
  gridHeight: 1,
  configuredMinimumGenomeLength: 2,
  configuredMaximumGenomeLength: 24,
  computationRewardAmounts: [4, 4, 4, 4],
  counters: {
    activations: 1_000,
    births: 10,
    deaths_energy: 1,
    deaths_exogenous: 1,
    deaths_exploitation: 0,
    autonomous_attempts: 20,
    autonomous_successes: 10,
    exploitative_attempts: 8,
    exploitative_successes: 4,
    hgt_attempts: 8,
    hgt_successes: 4,
    computation_rewards: 10,
    energy_transferred: 50,
    energy_created: 1_000,
  },
  finalPopulation: { populationTotal: 8, hostPopulation: 5, parasitePopulation: 3 },
  samples: [sample(200), sample(300), sample(400)],
  ...overrides,
});

const writeSweep = (acceptance: Readonly<Record<string, number>>): string => {
  const path = join(directory, 'sweep.json');
  writeFileSync(
    path,
    `${JSON.stringify({
      report_every_ticks: 100,
      late_window_fraction: { numerator: 1, denominator: 4 },
      screening_acceptance: acceptance,
    })}\n`,
  );
  return path;
};

describe('threshold loading and gate comparison', () => {
  it('evaluates one pass and one fail against values loaded from a fixture sweep JSON', () => {
    const sweep = loadSweepSpecification(
      writeSweep({ late_mean_occupancy_min: 0.5, late_maximum_occupancy: 0.75 }),
    );
    const results = evaluateScreen(run(), sweep);

    expect(results).toEqual([
      expect.objectContaining({
        gateKey: 'late_maximum_occupancy',
        observedValue: 0.8,
        threshold: 0.75,
        comparison: '<=',
        result: 'fail',
      }),
      expect.objectContaining({
        gateKey: 'late_mean_occupancy_min',
        observedValue: 0.8,
        threshold: 0.5,
        comparison: '>=',
        result: 'pass',
      }),
    ]);
  });

  it('does not emit any screen row for a dirty run', () => {
    const sweep = loadSweepSpecification(writeSweep({ late_mean_occupancy_min: 0.5 }));
    expect(evaluateScreen(run({ dirtyWorktree: true }), sweep)).toEqual([]);
  });

  it('passes disabled final-lineage selection without imputing a numeric proportion', () => {
    const sweep = loadSweepSpecification(
      writeSweep({ minimum_final_lineage_proportion: 0 }),
    );
    const [result] = evaluateScreen(
      run({
        finalPopulation: { populationTotal: 0, hostPopulation: 0, parasitePopulation: 0 },
      }),
      sweep,
    );

    expect(result).toMatchObject({
      observedValue: null,
      comparison: 'disabled_at_zero_threshold',
      result: 'pass',
      reason: 'final_lineage_selection_disabled',
    });
  });

  it('marks computation-share thresholds not derivable from retained event counts', () => {
    const sweep = loadSweepSpecification(
      writeSweep({
        computation_created_energy_share_min: 0.0001,
        computation_created_energy_share_max: 0.25,
      }),
    );
    const results = evaluateScreen(
      run({
        computationRewardAmounts: [1_000],
        counters: { ...run().counters, computation_rewards: 999, energy_created: 1_000 },
      }),
      sweep,
    );

    expect(results).toHaveLength(2);
    for (const result of results) {
      expect(result).toMatchObject({
        observedValue: null,
        result: 'not_derivable',
        reason: 'credited_computation_energy_not_retained',
      });
    }
  });

  it('matches the historical genome-bound formula for distinct and equal configured bounds', () => {
    const sweep = loadSweepSpecification(
      writeSweep({ maximum_sampled_genome_bound_proportion: 0.3 }),
    );
    const boundedSamples = [
      sample(200),
      sample(300),
      { ...sample(400), minimumGenomeBoundCount: 2, maximumGenomeBoundCount: 1 },
    ];

    const [distinctBounds] = evaluateScreen(run({ samples: boundedSamples }), sweep);
    expect(distinctBounds).toMatchObject({ observedValue: 3 / 8, result: 'fail' });

    const [equalBounds] = evaluateScreen(
      run({
        samples: boundedSamples,
        configuredMinimumGenomeLength: 7,
        configuredMaximumGenomeLength: 7,
      }),
      sweep,
    );
    expect(equalBounds).toMatchObject({ observedValue: 2 / 8, result: 'pass' });
  });

  it('formats a fractional late contact-edge mean to four decimal places in screen CSV', () => {
    const sweep = loadSweepSpecification(
      writeSweep({ minimum_late_mean_host_parasite_contact_edges: 1 }),
    );
    const [result] = evaluateScreen(
      run({ samples: [sample(200), sample(300), sample(350, 1), sample(400, 2)] }),
      sweep,
    );

    expect(result).toMatchObject({ observedValue: 1.5, result: 'pass' });
    expect(screenEvaluationRow(result as NonNullable<typeof result>)['observed_value']).toBe(
      '1.5000',
    );
  });
});

describe('amended composite interaction-exposure gate', () => {
  it('passes only when both sampled lineage persistence and sampled contact meet the threshold', () => {
    const sweep = loadSweepSpecification(
      writeSweep({ minimum_both_lineages_observed_through_tick: 300 }),
    );
    const [result] = evaluateScreen(run(), sweep);

    expect(result).toMatchObject({
      observedValue: 400,
      comparison: '>=',
      result: 'pass',
      reason: 'minimum_of_sampled_lineage_and_contact_ticks',
    });

    const contactStopsEarly = run({ samples: [sample(200), sample(300, 0), sample(400, 0)] });
    const [failed] = evaluateScreen(contactStopsEarly, sweep);
    expect(failed).toMatchObject({ observedValue: 200, result: 'fail' });
  });

  it('derives fail, not not_derivable or fabricated zero, when a component was never observed', () => {
    const sweep = loadSweepSpecification(
      writeSweep({ minimum_both_lineages_observed_through_tick: 300 }),
    );
    const noContact = run({ samples: [sample(200, 0), sample(300, 0), sample(400, 0)] });
    const [result] = evaluateScreen(noContact, sweep);

    expect(result).toMatchObject({
      observedValue: null,
      result: 'fail',
      reason: 'no_retained_sample_with_cross_lineage_contact',
    });
    expect(result?.result).not.toBe('not_derivable');
  });
});
