/**
 * Strict reader for the retained SCI-001 `timeseries.csv` files.
 *
 * Only fields required by the frozen audit specification are projected. Missing columns,
 * malformed numbers, inconsistent run identifiers, and non-increasing sample ticks are fatal;
 * the audit never substitutes a default for retained evidence.
 */

import { readFileSync } from 'node:fs';

import { parseCsv } from './csv.ts';
import { AuditError } from './discovery.ts';

export const REQUIRED_TIMESERIES_COLUMNS = [
  'run_id',
  'tick',
  'sample_kind',
  'population_total',
  'host_population',
  'parasite_population',
  'minimum_genome_bound_count',
  'maximum_genome_bound_count',
  'spatial_host_parasite_contact_edges',
  'resource_stock_proportion',
  'resource_depleted_cells',
  'cumulative_births',
  'cumulative_deaths',
  'cumulative_autonomous_attempts',
  'cumulative_autonomous_successes',
  'cumulative_exploitative_attempts',
  'cumulative_exploitative_successes',
  'cumulative_hgt_attempts',
  'cumulative_hgt_successes',
  'interval_autonomous_successes',
  'interval_exploitative_successes',
  'interval_hgt_attempts',
  'interval_hgt_successes',
  'total_eligible_proportion',
  'interval_host_splice_no_neighbour',
  'interval_parasite_splice_no_neighbour',
] as const;

export interface TimeseriesSample {
  readonly runId: string;
  readonly tick: number;
  readonly sampleKind: string;
  readonly populationTotal: number;
  readonly hostPopulation: number;
  readonly parasitePopulation: number;
  readonly minimumGenomeBoundCount: number;
  readonly maximumGenomeBoundCount: number;
  readonly hostParasiteContactEdges: number;
  readonly resourceStockProportion: number | null;
  readonly resourceDepletedCells: number;
  readonly cumulativeBirths: number;
  readonly cumulativeDeaths: number;
  readonly cumulativeAutonomousAttempts: number;
  readonly cumulativeAutonomousSuccesses: number;
  readonly cumulativeExploitativeAttempts: number;
  readonly cumulativeExploitativeSuccesses: number;
  readonly cumulativeHgtAttempts: number;
  readonly cumulativeHgtSuccesses: number;
  readonly intervalAutonomousSuccesses: number;
  readonly intervalExploitativeSuccesses: number;
  readonly intervalHgtAttempts: number;
  readonly intervalHgtSuccesses: number;
  readonly totalEligibleProportion: number | null;
  readonly intervalHostSpliceNoNeighbour: number;
  readonly intervalParasiteSpliceNoNeighbour: number;
}

const requireCell = (
  record: Readonly<Record<string, string>>,
  column: string,
  rowNumber: number,
  source: string,
): string => {
  const value = record[column];
  if (value === undefined) {
    throw new AuditError(`Timeseries "${source}" is missing required column "${column}"`);
  }
  if (value === '') {
    throw new AuditError(
      `Timeseries "${source}" row ${rowNumber} column "${column}" is blank`,
    );
  }
  return value;
};

const parseNumber = (
  raw: string,
  column: string,
  rowNumber: number,
  source: string,
): number => {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new AuditError(
      `Timeseries "${source}" row ${rowNumber} column "${column}" is not a finite number: "${raw}"`,
    );
  }
  return value;
};

const parseNonNegative = (
  record: Readonly<Record<string, string>>,
  column: string,
  rowNumber: number,
  source: string,
): number => {
  const value = parseNumber(requireCell(record, column, rowNumber, source), column, rowNumber, source);
  if (value < 0) {
    throw new AuditError(
      `Timeseries "${source}" row ${rowNumber} column "${column}" is negative: ${value}`,
    );
  }
  return value;
};

const parseNonNegativeInteger = (
  record: Readonly<Record<string, string>>,
  column: string,
  rowNumber: number,
  source: string,
): number => {
  const value = parseNonNegative(record, column, rowNumber, source);
  if (!Number.isSafeInteger(value)) {
    throw new AuditError(
      `Timeseries "${source}" row ${rowNumber} column "${column}" is not a safe integer: ${value}`,
    );
  }
  return value;
};

const parseNullableNonNegative = (
  record: Readonly<Record<string, string>>,
  column: string,
  rowNumber: number,
  source: string,
): number | null => {
  const raw = record[column];
  if (raw === undefined) {
    throw new AuditError(`Timeseries "${source}" is missing required column "${column}"`);
  }
  return raw === '' ? null : parseNonNegative(record, column, rowNumber, source);
};

const parseNullableProportion = (
  record: Readonly<Record<string, string>>,
  column: string,
  rowNumber: number,
  source: string,
): number | null => {
  const value = parseNullableNonNegative(record, column, rowNumber, source);
  if (value !== null && value > 1) {
    throw new AuditError(
      `Timeseries "${source}" row ${rowNumber} column "${column}" is not a proportion: ${value}`,
    );
  }
  return value;
};

/** Parses and validates a retained timeseries payload without touching the filesystem. */
export const parseTimeseries = (
  text: string,
  source = 'timeseries.csv',
  expectedRunId?: string,
): TimeseriesSample[] => {
  const firstLineEnd = text.search(/\r?\n/u);
  const headerLine = firstLineEnd === -1 ? text : text.slice(0, firstLineEnd);
  const header = new Set(headerLine.split(','));
  for (const column of REQUIRED_TIMESERIES_COLUMNS) {
    if (!header.has(column)) {
      throw new AuditError(`Timeseries "${source}" is missing required column "${column}"`);
    }
  }

  const records = parseCsv(text);
  let previousTick = -1;
  return records.map((record, index) => {
    const rowNumber = index + 2;
    const runId = requireCell(record, 'run_id', rowNumber, source);
    if (expectedRunId !== undefined && runId !== expectedRunId) {
      throw new AuditError(
        `Timeseries "${source}" row ${rowNumber} has run_id "${runId}", expected "${expectedRunId}"`,
      );
    }
    const tick = parseNonNegativeInteger(record, 'tick', rowNumber, source);
    if (tick <= previousTick) {
      throw new AuditError(
        `Timeseries "${source}" sample ticks are not strictly increasing at row ${rowNumber}: ${tick} follows ${previousTick}`,
      );
    }
    previousTick = tick;

    return {
      runId,
      tick,
      sampleKind: requireCell(record, 'sample_kind', rowNumber, source),
      populationTotal: parseNonNegativeInteger(record, 'population_total', rowNumber, source),
      hostPopulation: parseNonNegativeInteger(record, 'host_population', rowNumber, source),
      parasitePopulation: parseNonNegativeInteger(
        record,
        'parasite_population',
        rowNumber,
        source,
      ),
      minimumGenomeBoundCount: parseNonNegativeInteger(
        record,
        'minimum_genome_bound_count',
        rowNumber,
        source,
      ),
      maximumGenomeBoundCount: parseNonNegativeInteger(
        record,
        'maximum_genome_bound_count',
        rowNumber,
        source,
      ),
      hostParasiteContactEdges: parseNonNegativeInteger(
        record,
        'spatial_host_parasite_contact_edges',
        rowNumber,
        source,
      ),
      resourceStockProportion: parseNullableProportion(
        record,
        'resource_stock_proportion',
        rowNumber,
        source,
      ),
      resourceDepletedCells: parseNonNegativeInteger(
        record,
        'resource_depleted_cells',
        rowNumber,
        source,
      ),
      cumulativeBirths: parseNonNegativeInteger(record, 'cumulative_births', rowNumber, source),
      cumulativeDeaths: parseNonNegativeInteger(record, 'cumulative_deaths', rowNumber, source),
      cumulativeAutonomousAttempts: parseNonNegativeInteger(
        record,
        'cumulative_autonomous_attempts',
        rowNumber,
        source,
      ),
      cumulativeAutonomousSuccesses: parseNonNegativeInteger(
        record,
        'cumulative_autonomous_successes',
        rowNumber,
        source,
      ),
      cumulativeExploitativeAttempts: parseNonNegativeInteger(
        record,
        'cumulative_exploitative_attempts',
        rowNumber,
        source,
      ),
      cumulativeExploitativeSuccesses: parseNonNegativeInteger(
        record,
        'cumulative_exploitative_successes',
        rowNumber,
        source,
      ),
      cumulativeHgtAttempts: parseNonNegativeInteger(
        record,
        'cumulative_hgt_attempts',
        rowNumber,
        source,
      ),
      cumulativeHgtSuccesses: parseNonNegativeInteger(
        record,
        'cumulative_hgt_successes',
        rowNumber,
        source,
      ),
      intervalAutonomousSuccesses: parseNonNegativeInteger(
        record,
        'interval_autonomous_successes',
        rowNumber,
        source,
      ),
      intervalExploitativeSuccesses: parseNonNegativeInteger(
        record,
        'interval_exploitative_successes',
        rowNumber,
        source,
      ),
      intervalHgtAttempts: parseNonNegativeInteger(
        record,
        'interval_hgt_attempts',
        rowNumber,
        source,
      ),
      intervalHgtSuccesses: parseNonNegativeInteger(
        record,
        'interval_hgt_successes',
        rowNumber,
        source,
      ),
      totalEligibleProportion: parseNullableProportion(
        record,
        'total_eligible_proportion',
        rowNumber,
        source,
      ),
      intervalHostSpliceNoNeighbour: parseNonNegativeInteger(
        record,
        'interval_host_splice_no_neighbour',
        rowNumber,
        source,
      ),
      intervalParasiteSpliceNoNeighbour: parseNonNegativeInteger(
        record,
        'interval_parasite_splice_no_neighbour',
        rowNumber,
        source,
      ),
    };
  });
};

export const readTimeseries = (path: string, expectedRunId?: string): TimeseriesSample[] =>
  parseTimeseries(readFileSync(path, 'utf8'), path, expectedRunId);
