import type {
  LocalResourceCounters,
  LocalResourceStateSnapshot,
} from "../world/resource-field.js";

export interface LocalResourceMeasurement {
  readonly cell_capacity: number;
  readonly total_capacity: number;
  readonly total_stock: number;
  readonly stock_proportion: number;
  readonly mean_stock: number;
  readonly depleted_cells: number;
  readonly saturated_cells: number;
  readonly occupied_cells: number;
  readonly occupied_total_stock: number;
  readonly occupied_mean_stock: number | null;
  readonly empty_cells: number;
  readonly empty_total_stock: number;
  readonly empty_mean_stock: number | null;
  readonly cumulative_regenerated: number;
  readonly cumulative_harvested: number;
  readonly cumulative_harvest_requested: number;
  readonly cumulative_harvest_shortfall: number;
  readonly cumulative_harvest_opportunities: number;
  readonly cumulative_zero_harvests: number;
  readonly cumulative_partial_harvests: number;
}

function safeSum(values: readonly number[], label: string): number {
  let total = 0;
  for (const value of values) {
    total += value;
    if (!Number.isSafeInteger(total)) {
      throw new RangeError(`${label} exceeds the safe-integer range.`);
    }
  }
  return total;
}

export function measureLocalResources(
  snapshot: Readonly<LocalResourceStateSnapshot>,
  occupancy: readonly (number | null)[],
): LocalResourceMeasurement {
  if (snapshot.stocks.length !== occupancy.length) {
    throw new RangeError("Resource and occupancy arrays must have identical lengths.");
  }
  const totalCapacity = snapshot.cell_capacity * snapshot.stocks.length;
  if (!Number.isSafeInteger(totalCapacity) || totalCapacity <= 0) {
    throw new RangeError("Total resource capacity must be a positive safe integer.");
  }
  const totalStock = safeSum(snapshot.stocks, "total resource stock");
  const occupiedStocks = snapshot.stocks.filter((_, index) => occupancy[index] !== null);
  const emptyStocks = snapshot.stocks.filter((_, index) => occupancy[index] === null);
  const occupiedTotal = safeSum(occupiedStocks, "occupied resource stock");
  const emptyTotal = safeSum(emptyStocks, "empty resource stock");
  const counters: Readonly<LocalResourceCounters> = snapshot.counters;
  return {
    cell_capacity: snapshot.cell_capacity,
    total_capacity: totalCapacity,
    total_stock: totalStock,
    stock_proportion: totalStock / totalCapacity,
    mean_stock: totalStock / snapshot.stocks.length,
    depleted_cells: snapshot.stocks.filter((stock) => stock === 0).length,
    saturated_cells: snapshot.stocks.filter((stock) => stock === snapshot.cell_capacity).length,
    occupied_cells: occupiedStocks.length,
    occupied_total_stock: occupiedTotal,
    occupied_mean_stock:
      occupiedStocks.length === 0 ? null : occupiedTotal / occupiedStocks.length,
    empty_cells: emptyStocks.length,
    empty_total_stock: emptyTotal,
    empty_mean_stock: emptyStocks.length === 0 ? null : emptyTotal / emptyStocks.length,
    cumulative_regenerated: counters.regenerated_total,
    cumulative_harvested: counters.harvested_total,
    cumulative_harvest_requested: counters.harvest_requested_total,
    cumulative_harvest_shortfall:
      counters.harvest_requested_total - counters.harvested_total,
    cumulative_harvest_opportunities: counters.harvest_opportunities,
    cumulative_zero_harvests: counters.zero_harvests,
    cumulative_partial_harvests: counters.partial_harvests,
  };
}
