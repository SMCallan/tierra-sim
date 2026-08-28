import {
  cardinalCoordinates,
  rotateDirection,
  type Coordinate,
  type Direction,
  fromCellIndex,
  neighbourCoordinate,
  toCellIndex,
} from "./coordinates.js";

export class WorldGrid {
  readonly width: number;
  readonly height: number;

  #cells: (number | null)[];
  #organismCells = new Map<number, number>();

  constructor(width: number, height: number) {
    if (!Number.isSafeInteger(width) || width <= 0) {
      throw new RangeError("World width must be a positive safe integer.");
    }
    if (!Number.isSafeInteger(height) || height <= 0) {
      throw new RangeError("World height must be a positive safe integer.");
    }
    if (!Number.isSafeInteger(width * height)) {
      throw new RangeError("World cell count must be a safe integer.");
    }

    this.width = width;
    this.height = height;
    this.#cells = Array.from({ length: width * height }, () => null);
  }

  get cellCount(): number {
    return this.#cells.length;
  }

  get populationSize(): number {
    return this.#organismCells.size;
  }

  occupantAt(coordinate: Coordinate): number | null {
    return this.#cells[toCellIndex(coordinate, this.width, this.height)] ?? null;
  }

  occupantInDirection(origin: Coordinate, direction: Direction): number | null {
    return this.occupantAt(neighbourCoordinate(origin, direction, this.width, this.height));
  }

  firstOccupiedCardinal(
    origin: Coordinate,
    start: Direction,
  ): { readonly organism_id: number; readonly direction: Direction } | null {
    for (let offset = 0; offset < 4; offset += 1) {
      const direction = rotateDirection(start, offset);
      const organismId = this.occupantInDirection(origin, direction);
      if (organismId !== null) {
        return Object.freeze({ organism_id: organismId, direction });
      }
    }
    return null;
  }

  coordinateOf(organismId: number): Coordinate | null {
    const cellIndex = this.#organismCells.get(organismId);
    return cellIndex === undefined ? null : fromCellIndex(cellIndex, this.width, this.height);
  }

  place(organismId: number, coordinate: Coordinate): void {
    if (!Number.isSafeInteger(organismId) || organismId < 0) {
      throw new RangeError("Organism identifier must be a non-negative safe integer.");
    }
    if (this.#organismCells.has(organismId)) {
      throw new Error(`Organism ${organismId} is already placed.`);
    }

    const cellIndex = toCellIndex(coordinate, this.width, this.height);
    if (this.#cells[cellIndex] !== null) {
      throw new Error(`Cell ${cellIndex} is already occupied.`);
    }
    this.#cells[cellIndex] = organismId;
    this.#organismCells.set(organismId, cellIndex);
  }

  removeAt(coordinate: Coordinate): number | null {
    const cellIndex = toCellIndex(coordinate, this.width, this.height);
    const organismId = this.#cells[cellIndex] ?? null;
    if (organismId === null) {
      return null;
    }

    this.#cells[cellIndex] = null;
    this.#organismCells.delete(organismId);
    return organismId;
  }

  removeOrganism(organismId: number): Coordinate | null {
    const coordinate = this.coordinateOf(organismId);
    if (coordinate === null) {
      return null;
    }
    this.removeAt(coordinate);
    return coordinate;
  }

  occupiedNeighbourCount(origin: Coordinate): number {
    return cardinalCoordinates(origin, this.width, this.height).reduce(
      (count, coordinate) => count + (this.occupantAt(coordinate) === null ? 0 : 1),
      0,
    );
  }

  firstEmptyCardinal(origin: Coordinate, start: Direction): Coordinate | null {
    for (const coordinate of cardinalCoordinates(origin, this.width, this.height, start)) {
      if (this.occupantAt(coordinate) === null) {
        return coordinate;
      }
    }
    return null;
  }

  organismIds(): readonly number[] {
    return Object.freeze([...this.#organismCells.keys()].sort((left, right) => left - right));
  }

  occupancySnapshot(): readonly (number | null)[] {
    return Object.freeze([...this.#cells]);
  }
}
