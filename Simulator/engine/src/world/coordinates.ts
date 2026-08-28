export const Direction = {
  North: 0,
  East: 1,
  South: 2,
  West: 3,
} as const;

export type Direction = (typeof Direction)[keyof typeof Direction];

export interface Coordinate {
  readonly x: number;
  readonly y: number;
}

const directionOffsets: Readonly<Record<Direction, Coordinate>> = Object.freeze({
  [Direction.North]: Object.freeze({ x: 0, y: -1 }),
  [Direction.East]: Object.freeze({ x: 1, y: 0 }),
  [Direction.South]: Object.freeze({ x: 0, y: 1 }),
  [Direction.West]: Object.freeze({ x: -1, y: 0 }),
});

function assertDimension(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
}

export function directionFromRegister(value: number): Direction {
  if (!Number.isInteger(value)) {
    throw new RangeError("Direction register value must be an integer.");
  }
  return (((value % 4) + 4) % 4) as Direction;
}

export function rotateDirection(start: Direction, offset: number): Direction {
  return directionFromRegister(start + offset);
}

export function wrapAxis(value: number, size: number): number {
  assertDimension(size, "axis size");
  if (!Number.isSafeInteger(value)) {
    throw new RangeError("Coordinate axis value must be a safe integer.");
  }
  // Already in range is overwhelmingly the common case — neighbour offsets are +/-1 — so test for
  // it before doing any division. Otherwise one modulo and a conditional, rather than two modulos.
  if (value >= 0 && value < size) {
    return value;
  }
  const remainder = value % size;
  return remainder < 0 ? remainder + size : remainder;
}

export function wrapCoordinate(coordinate: Coordinate, width: number, height: number): Coordinate {
  // Not frozen. `Coordinate` is readonly in the type system, and this runs on the hottest path in
  // the engine — freezing a fresh object per call cost more than the wrapping arithmetic it
  // protects. Snapshots that leave the engine are still deep-frozen where they are produced.
  return {
    x: wrapAxis(coordinate.x, width),
    y: wrapAxis(coordinate.y, height),
  };
}

export function neighbourCoordinate(
  origin: Coordinate,
  direction: Direction,
  width: number,
  height: number,
): Coordinate {
  const offset = directionOffsets[direction];
  return wrapCoordinate({ x: origin.x + offset.x, y: origin.y + offset.y }, width, height);
}

export function toCellIndex(coordinate: Coordinate, width: number, height: number): number {
  const wrapped = wrapCoordinate(coordinate, width, height);
  return wrapped.y * width + wrapped.x;
}

export function fromCellIndex(index: number, width: number, height: number): Coordinate {
  assertDimension(width, "width");
  assertDimension(height, "height");
  const cellCount = width * height;
  if (!Number.isSafeInteger(index) || index < 0 || index >= cellCount) {
    throw new RangeError(`Cell index must be in [0, ${cellCount}).`);
  }
  return Object.freeze({ x: index % width, y: Math.floor(index / width) });
}

export function cardinalCoordinates(
  origin: Coordinate,
  width: number,
  height: number,
  start: Direction = Direction.North,
): readonly Coordinate[] {
  return Object.freeze(
    [0, 1, 2, 3].map((offset) =>
      neighbourCoordinate(origin, rotateDirection(start, offset), width, height),
    ),
  );
}
