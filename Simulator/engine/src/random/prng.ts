import type { RationalProbability } from "../config/schema.js";

const UINT32_RANGE = 0x1_0000_0000;
const UINT32_MAX = 0xffff_ffff;
const SEED_INCREMENT = 0x9e37_79b9;
const NON_ZERO_FALLBACK = 0x9e37_79b9;

export type PrngState = readonly [number, number, number, number];

function rotateLeft(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function assertUint32(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value > UINT32_MAX) {
    throw new RangeError(`${name} must be an unsigned 32-bit integer.`);
  }
}

function expandSeed(masterSeed: number): [number, number, number, number] {
  let cursor = masterSeed >>> 0;
  const state: number[] = [];

  for (let index = 0; index < 4; index += 1) {
    cursor = (cursor + SEED_INCREMENT) >>> 0;
    let word = cursor;
    word = Math.imul(word ^ (word >>> 16), 0x21f0_aaad) >>> 0;
    word = Math.imul(word ^ (word >>> 15), 0x735a_2d97) >>> 0;
    state.push((word ^ (word >>> 15)) >>> 0);
  }

  const expanded = state as [number, number, number, number];
  if ((expanded[0] | expanded[1] | expanded[2] | expanded[3]) === 0) {
    expanded[0] = NON_ZERO_FALLBACK;
  }
  return expanded;
}

export class Xoshiro128StarStar {
  readonly algorithm = "xoshiro128**/tierra-splitmix32-v1" as const;

  #state: [number, number, number, number];

  constructor(masterSeed: number) {
    assertUint32(masterSeed, "masterSeed");
    this.#state = expandSeed(masterSeed);
  }

  static fromState(state: PrngState): Xoshiro128StarStar {
    if (state.length !== 4) {
      throw new RangeError("PRNG state must contain exactly four words.");
    }
    state.forEach((word, index) => assertUint32(word, `state[${index}]`));
    if ((state[0] | state[1] | state[2] | state[3]) === 0) {
      throw new RangeError("xoshiro128** state must not be all zero.");
    }

    const generator = new Xoshiro128StarStar(0);
    generator.#state = [...state];
    return generator;
  }

  getState(): PrngState {
    return Object.freeze([...this.#state]) as PrngState;
  }

  nextUint32(): number {
    const [state0, state1, state2, state3] = this.#state;
    const result = Math.imul(rotateLeft(Math.imul(state1, 5) >>> 0, 7), 9) >>> 0;
    const shifted = (state1 << 9) >>> 0;

    let next2 = (state2 ^ state0) >>> 0;
    let next3 = (state3 ^ state1) >>> 0;
    const next1 = (state1 ^ next2) >>> 0;
    const next0 = (state0 ^ next3) >>> 0;
    next2 = (next2 ^ shifted) >>> 0;
    next3 = rotateLeft(next3, 11);

    this.#state = [next0, next1, next2, next3];
    return result;
  }

  uniformInt(boundExclusive: number): number {
    if (
      !Number.isInteger(boundExclusive) ||
      boundExclusive < 1 ||
      boundExclusive > UINT32_RANGE
    ) {
      throw new RangeError("boundExclusive must be an integer in [1, 2^32].");
    }

    const limit = Math.floor(UINT32_RANGE / boundExclusive) * boundExclusive;
    let word: number;
    do {
      word = this.nextUint32();
    } while (word >= limit);
    return word % boundExclusive;
  }

  bernoulli(probability: RationalProbability): boolean {
    const { numerator, denominator } = probability;
    if (
      !Number.isInteger(numerator) ||
      !Number.isInteger(denominator) ||
      numerator < 0 ||
      denominator < 1 ||
      denominator > UINT32_RANGE ||
      numerator > denominator
    ) {
      throw new RangeError("Invalid rational probability.");
    }

    return this.uniformInt(denominator) < numerator;
  }

  shuffleInPlace<Item>(items: Item[]): void {
    for (let index = items.length - 1; index >= 1; index -= 1) {
      const selected = this.uniformInt(index + 1);
      [items[index], items[selected]] = [items[selected] as Item, items[index] as Item];
    }
  }

  shuffled<Item>(items: readonly Item[]): Item[] {
    const result = [...items];
    this.shuffleInPlace(result);
    return result;
  }
}
