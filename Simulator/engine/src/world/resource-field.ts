import type { LocalResourceConfig } from "../config/schema.js";
import type { Coordinate } from "./coordinates.js";
import { cardinalCoordinates, toCellIndex } from "./coordinates.js";

export interface LocalResourceCounters {
  readonly initial_total: number;
  regenerated_total: number;
  harvested_total: number;
  harvest_requested_total: number;
  harvest_opportunities: number;
  zero_harvests: number;
  partial_harvests: number;
}

export interface LocalResourceStateSnapshot {
  readonly cell_capacity: number;
  readonly stocks: readonly number[];
  readonly counters: LocalResourceCounters;
}

function safeAdd(current: number, amount: number, label: string): number {
  const result = current + amount;
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new RangeError(`${label} exceeded the safe-integer range.`);
  }
  return result;
}

function cloneCounters(counters: Readonly<LocalResourceCounters>): LocalResourceCounters {
  return { ...counters };
}

export class LocalResourceField {
  readonly width: number;
  readonly height: number;
  readonly cellCapacity: number;
  readonly neighbourhoodRadius: number;

  #stocks: number[];
  #counters: LocalResourceCounters;

  constructor(width: number, height: number, configuration: Readonly<LocalResourceConfig>) {
    this.width = width;
    this.height = height;
    this.cellCapacity = configuration.cell_capacity;
    this.neighbourhoodRadius = configuration.harvest_neighbourhood_radius ?? 0;
    const cellCount = width * height;
    const initialTotal = cellCount * configuration.initial_stock;
    if (!Number.isSafeInteger(initialTotal)) {
      throw new RangeError("Initial resource stock exceeds the safe-integer range.");
    }
    this.#stocks = Array.from({ length: cellCount }, () => configuration.initial_stock);
    this.#counters = {
      initial_total: initialTotal,
      regenerated_total: 0,
      harvested_total: 0,
      harvest_requested_total: 0,
      harvest_opportunities: 0,
      zero_harvests: 0,
      partial_harvests: 0,
    };
  }

  static restore(
    width: number,
    height: number,
    configuration: Readonly<LocalResourceConfig>,
    snapshot: LocalResourceStateSnapshot,
  ): LocalResourceField {
    const field = new LocalResourceField(width, height, configuration);
    if (
      snapshot.cell_capacity !== configuration.cell_capacity ||
      snapshot.stocks.length !== width * height
    ) {
      throw new RangeError("Resource checkpoint dimensions or capacity do not match configuration.");
    }
    field.#stocks = [...snapshot.stocks];
    field.#counters = cloneCounters(snapshot.counters);
    const expectedInitialTotal = width * height * configuration.initial_stock;
    if (field.#counters.initial_total !== expectedInitialTotal) {
      throw new RangeError("Resource checkpoint initial total does not match configuration.");
    }
    field.assertValid();
    return field;
  }

  get cellCount(): number {
    return this.#stocks.length;
  }

  totalStock(): number {
    return this.#stocks.reduce((total, stock) => safeAdd(total, stock, "resource stock"), 0);
  }

  stockAtIndex(cellIndex: number): number {
    const stock = this.#stocks[cellIndex];
    if (stock === undefined) {
      throw new RangeError(`Resource cell index ${cellIndex} is outside the world.`);
    }
    return stock;
  }

  stockAt(coordinate: Coordinate): number {
    return this.stockAtIndex(toCellIndex(coordinate, this.width, this.height));
  }

  regenerate(amountPerCell: number): { amount: number; replenished_cells: number } {
    let amount = 0;
    let replenishedCells = 0;
    for (let index = 0; index < this.#stocks.length; index += 1) {
      const current = this.#stocks[index] as number;
      const added = Math.min(amountPerCell, this.cellCapacity - current);
      if (added > 0) {
        this.#stocks[index] = current + added;
        amount = safeAdd(amount, added, "tick resource regeneration");
        replenishedCells += 1;
      }
    }
    this.#counters.regenerated_total = safeAdd(
      this.#counters.regenerated_total,
      amount,
      "cumulative resource regeneration",
    );
    return { amount, replenished_cells: replenishedCells };
  }

  harvest(
    coordinate: Coordinate,
    requested: number,
    radius: number = this.neighbourhoodRadius,
  ): number {
    if (!Number.isSafeInteger(requested) || requested < 0) {
      throw new RangeError("Requested resource harvest must be a non-negative safe integer.");
    }
    if (requested === 0) {
      return 0;
    }
    const index = toCellIndex(coordinate, this.width, this.height);
    const homeStock = this.#stocks[index] as number;
    let harvested = Math.min(requested, homeStock);
    this.#stocks[index] = homeStock - harvested;

    let remaining = requested - harvested;
    if (remaining > 0 && radius > 0) {
      const neighbours = cardinalCoordinates(coordinate, this.width, this.height);
      for (const neighbour of neighbours) {
        const nIndex = toCellIndex(neighbour, this.width, this.height);
        const nStock = this.#stocks[nIndex] as number;
        const nHarvest = Math.min(remaining, nStock);
        if (nHarvest > 0) {
          this.#stocks[nIndex] = nStock - nHarvest;
          harvested += nHarvest;
          remaining -= nHarvest;
          if (remaining === 0) {
            break;
          }
        }
      }
    }

    this.#counters.harvest_opportunities = safeAdd(
      this.#counters.harvest_opportunities,
      1,
      "resource harvest opportunities",
    );
    this.#counters.harvest_requested_total = safeAdd(
      this.#counters.harvest_requested_total,
      requested,
      "requested resource harvest",
    );
    this.#counters.harvested_total = safeAdd(
      this.#counters.harvested_total,
      harvested,
      "harvested resource",
    );
    if (harvested === 0) {
      this.#counters.zero_harvests = safeAdd(
        this.#counters.zero_harvests,
        1,
        "zero resource harvests",
      );
    } else if (harvested < requested) {
      this.#counters.partial_harvests = safeAdd(
        this.#counters.partial_harvests,
        1,
        "partial resource harvests",
      );
    }
    return harvested;
  }

  snapshot(): LocalResourceStateSnapshot {
    return {
      cell_capacity: this.cellCapacity,
      stocks: [...this.#stocks],
      counters: cloneCounters(this.#counters),
    };
  }

  assertValid(): void {
    for (const stock of this.#stocks) {
      if (!Number.isSafeInteger(stock) || stock < 0 || stock > this.cellCapacity) {
        throw new RangeError("Resource stock is outside configured bounds.");
      }
    }
    for (const [name, value] of Object.entries(this.#counters)) {
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new RangeError(`Resource counter ${name} is invalid.`);
      }
    }
    if (this.#counters.harvested_total > this.#counters.harvest_requested_total) {
      throw new RangeError("Harvested resource exceeds requested resource.");
    }
    if (
      this.#counters.zero_harvests + this.#counters.partial_harvests >
      this.#counters.harvest_opportunities
    ) {
      throw new RangeError("Resource harvest outcomes exceed recorded opportunities.");
    }
  }
}
