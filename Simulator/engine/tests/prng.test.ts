import { describe, expect, it } from "vitest";

import { Xoshiro128StarStar } from "../src/random/prng.js";

const goldenSequences = new Map<number, readonly number[]>([
  [
    0,
    [
      1_789_933_344, 44_971_166, 2_521_387_044, 3_848_737_593, 1_138_324_114,
      749_234_105, 1_899_511_038, 1_995_189_375, 3_629_653_958, 19_166_872,
    ],
  ],
  [
    1,
    [
      393_288_148, 2_174_103_013, 3_814_759_091, 2_092_745_082, 1_865_176_206,
      2_179_171_167, 3_207_394_750, 2_858_353_069, 559_075_315, 3_395_495_274,
    ],
  ],
  [
    0xffff_ffff,
    [
      4_104_197_751, 1_825_856_343, 1_152_209_388, 2_427_537_429, 3_685_145_430,
      609_215_610, 4_161_674_276, 1_502_890_106, 904_255_344, 859_094_872,
    ],
  ],
]);

describe("xoshiro128** randomness contract", () => {
  it.each([...goldenSequences])("matches the normative seed %i sequence", (seed, expected) => {
    const generator = new Xoshiro128StarStar(seed);
    expect(expected.map(() => generator.nextUint32())).toEqual(expected);
  });

  it("serialises and restores without changing the continuation", () => {
    const uninterrupted = new Xoshiro128StarStar(123_456);
    for (let index = 0; index < 17; index += 1) {
      uninterrupted.nextUint32();
    }

    const restored = Xoshiro128StarStar.fromState(uninterrupted.getState());
    const expected = Array.from({ length: 20 }, () => uninterrupted.nextUint32());
    const actual = Array.from({ length: 20 }, () => restored.nextUint32());
    expect(actual).toEqual(expected);
  });

  it("uses the raw word when sampling the full uint32 range", () => {
    const raw = new Xoshiro128StarStar(9);
    const bounded = new Xoshiro128StarStar(9);
    expect(bounded.uniformInt(0x1_0000_0000)).toBe(raw.nextUint32());
  });

  it("handles exact zero and one rational probabilities", () => {
    const generator = new Xoshiro128StarStar(22);
    expect(generator.bernoulli({ numerator: 0, denominator: 1 })).toBe(false);
    expect(generator.bernoulli({ numerator: 1, denominator: 1 })).toBe(true);
  });

  it("shuffles deterministically without mutating the source copy", () => {
    const generator = new Xoshiro128StarStar(1);
    const source = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const shuffled = generator.shuffled(source);

    expect(source).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(shuffled).toEqual([5, 7, 6, 9, 2, 0, 1, 3, 4, 8]);
  });

  it("rejects invalid seeds, bounds, probabilities, and all-zero restored state", () => {
    expect(() => new Xoshiro128StarStar(-1)).toThrow(/unsigned 32-bit/i);
    expect(() => new Xoshiro128StarStar(0x1_0000_0000)).toThrow(/unsigned 32-bit/i);
    expect(() => new Xoshiro128StarStar(1).uniformInt(0)).toThrow(/boundExclusive/i);
    expect(() => new Xoshiro128StarStar(1).bernoulli({ numerator: 2, denominator: 1 })).toThrow(
      /invalid rational probability/i,
    );
    expect(() => Xoshiro128StarStar.fromState([0, 0, 0, 0])).toThrow(/must not be all zero/i);
  });
});
