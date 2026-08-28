import { describe, expect, it } from "vitest";

import {
  cardinalCoordinates,
  Direction,
  directionFromRegister,
  fromCellIndex,
  neighbourCoordinate,
  toCellIndex,
  wrapAxis,
} from "../src/world/coordinates.js";
import { WorldGrid } from "../src/world/grid.js";

describe("toroidal coordinates", () => {
  it("wraps axes and all four cardinal boundaries", () => {
    expect(wrapAxis(-1, 4)).toBe(3);
    expect(wrapAxis(4, 4)).toBe(0);
    expect(neighbourCoordinate({ x: 0, y: 0 }, Direction.North, 4, 3)).toEqual({ x: 0, y: 2 });
    expect(neighbourCoordinate({ x: 0, y: 0 }, Direction.West, 4, 3)).toEqual({ x: 3, y: 0 });
    expect(neighbourCoordinate({ x: 3, y: 2 }, Direction.East, 4, 3)).toEqual({ x: 0, y: 2 });
    expect(neighbourCoordinate({ x: 3, y: 2 }, Direction.South, 4, 3)).toEqual({ x: 3, y: 0 });
  });

  it("uses stable row-major indices and direction numbering", () => {
    expect([0, 1, 2, 3, 4, 5].map((index) => fromCellIndex(index, 3, 2))).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ]);
    expect(toCellIndex({ x: -1, y: -1 }, 3, 2)).toBe(5);
    expect([0, 1, 2, 3, 4, 255].map(directionFromRegister)).toEqual([0, 1, 2, 3, 0, 3]);
  });

  it("rotates neighbour enumeration from a declared start", () => {
    expect(cardinalCoordinates({ x: 1, y: 1 }, 4, 4, Direction.East)).toEqual([
      { x: 2, y: 1 },
      { x: 1, y: 2 },
      { x: 0, y: 1 },
      { x: 1, y: 0 },
    ]);
  });
});

describe("capacity-one world grid", () => {
  it("places and removes unique organisms", () => {
    const grid = new WorldGrid(4, 4);
    grid.place(7, { x: 1, y: 2 });

    expect(grid.occupantAt({ x: 1, y: 2 })).toBe(7);
    expect(grid.coordinateOf(7)).toEqual({ x: 1, y: 2 });
    expect(grid.populationSize).toBe(1);
    expect(grid.removeOrganism(7)).toEqual({ x: 1, y: 2 });
    expect(grid.populationSize).toBe(0);
  });

  it("rejects cell and organism duplication", () => {
    const grid = new WorldGrid(4, 4);
    grid.place(1, { x: 0, y: 0 });

    expect(() => grid.place(2, { x: 0, y: 0 })).toThrow(/already occupied/i);
    expect(() => grid.place(1, { x: 1, y: 0 })).toThrow(/already placed/i);
  });

  it("counts occupied neighbours and finds first occupied or empty cells in cyclic order", () => {
    const grid = new WorldGrid(5, 5);
    const origin = { x: 2, y: 2 };
    grid.place(1, origin);
    grid.place(2, { x: 2, y: 1 });
    grid.place(3, { x: 3, y: 2 });

    expect(grid.occupiedNeighbourCount(origin)).toBe(2);
    expect(grid.firstOccupiedCardinal(origin, Direction.North)).toEqual({
      organism_id: 2,
      direction: Direction.North,
    });
    expect(grid.firstOccupiedCardinal(origin, Direction.West)).toEqual({
      organism_id: 2,
      direction: Direction.North,
    });
    expect(grid.firstEmptyCardinal(origin, Direction.North)).toEqual({ x: 2, y: 3 });
    expect(grid.firstEmptyCardinal(origin, Direction.West)).toEqual({ x: 1, y: 2 });
  });

  it("returns null when cardinal donor search finds no occupied neighbour", () => {
    const grid = new WorldGrid(5, 5);
    const origin = { x: 2, y: 2 };
    grid.place(1, origin);
    expect(grid.firstOccupiedCardinal(origin, Direction.East)).toBeNull();
  });

  it("returns immutable copies of identifiers and occupancy", () => {
    const grid = new WorldGrid(2, 2);
    grid.place(9, { x: 0, y: 0 });
    const identifiers = grid.organismIds();
    const occupancy = grid.occupancySnapshot();

    expect(identifiers).toEqual([9]);
    expect(occupancy).toEqual([9, null, null, null]);
    expect(Object.isFrozen(identifiers)).toBe(true);
    expect(Object.isFrozen(occupancy)).toBe(true);
  });
});
