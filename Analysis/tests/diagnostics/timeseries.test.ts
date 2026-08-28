import { describe, expect, it } from 'vitest';

import {
  parseTimeseries,
  REQUIRED_TIMESERIES_COLUMNS,
} from '../../src/diagnostics/timeseries.ts';

const baseRow = (): Record<(typeof REQUIRED_TIMESERIES_COLUMNS)[number], string> => ({
  run_id: 'run-1',
  tick: '20',
  sample_kind: 'scheduled',
  population_total: '8',
  host_population: '5',
  parasite_population: '3',
  minimum_genome_bound_count: '2',
  maximum_genome_bound_count: '1',
  spatial_host_parasite_contact_edges: '2',
  resource_stock_proportion: '0.75',
  resource_depleted_cells: '4',
  cumulative_births: '10',
  cumulative_deaths: '4',
  cumulative_autonomous_attempts: '8',
  cumulative_autonomous_successes: '4',
  cumulative_exploitative_attempts: '6',
  cumulative_exploitative_successes: '3',
  cumulative_hgt_attempts: '5',
  cumulative_hgt_successes: '2',
  interval_autonomous_successes: '2',
  interval_exploitative_successes: '1',
  interval_hgt_attempts: '3',
  interval_hgt_successes: '1',
  total_eligible_proportion: '0.5',
  interval_host_splice_no_neighbour: '1',
  interval_parasite_splice_no_neighbour: '0',
});

const csv = (
  rows: readonly Record<string, string>[],
  columns: readonly string[] = REQUIRED_TIMESERIES_COLUMNS,
): string =>
  `${columns.join(',')}\n${rows
    .map((row) => columns.map((column) => row[column] ?? '').join(','))
    .join('\n')}\n`;

describe('strict timeseries reader', () => {
  it('projects required fields and preserves legitimate nullable measurements', () => {
    const row = baseRow();
    row.total_eligible_proportion = '';

    expect(parseTimeseries(csv([row]), 'fixture.csv', 'run-1')).toEqual([
      expect.objectContaining({
        runId: 'run-1',
        tick: 20,
        populationTotal: 8,
        minimumGenomeBoundCount: 2,
        maximumGenomeBoundCount: 1,
        totalEligibleProportion: null,
      }),
    ]);
  });

  it('rejects a missing required column', () => {
    const columns = REQUIRED_TIMESERIES_COLUMNS.filter((column) => column !== 'population_total');
    expect(() => parseTimeseries(csv([baseRow()], columns), 'fixture.csv')).toThrow(
      /missing required column "population_total"/,
    );
  });

  it('rejects a blank non-nullable field rather than substituting zero', () => {
    const row = baseRow();
    row.population_total = '';
    expect(() => parseTimeseries(csv([row]), 'fixture.csv')).toThrow(
      /column "population_total" is blank/,
    );
  });

  it('strictly parses both genome-bound counts as non-negative safe integers', () => {
    const blankMinimum = baseRow();
    blankMinimum.minimum_genome_bound_count = '';
    expect(() => parseTimeseries(csv([blankMinimum]), 'fixture.csv')).toThrow(
      /column "minimum_genome_bound_count" is blank/,
    );

    const fractionalMaximum = baseRow();
    fractionalMaximum.maximum_genome_bound_count = '1.5';
    expect(() => parseTimeseries(csv([fractionalMaximum]), 'fixture.csv')).toThrow(
      /column "maximum_genome_bound_count" is not a safe integer/,
    );
  });

  it('rejects non-increasing ticks', () => {
    const first = baseRow();
    const second = { ...baseRow(), tick: '20' };
    expect(() => parseTimeseries(csv([first, second]), 'fixture.csv')).toThrow(
      /not strictly increasing/,
    );
  });

  it('rejects a row attributed to another run', () => {
    expect(() => parseTimeseries(csv([baseRow()]), 'fixture.csv', 'other-run')).toThrow(
      /expected "other-run"/,
    );
  });
});
