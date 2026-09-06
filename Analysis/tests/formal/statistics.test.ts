import { describe, expect, it } from "vitest";

import {
  blockBootstrap,
  bootstrapPartialEtaSquared,
  createRandom,
  fitAdditive,
  holmAdjust,
  mean,
  permutationTest,
  quantile,
  standardDeviation,
  twoWayAnova,
  type FactorialObservation,
} from "../../src/formal/statistics.ts";

/**
 * A balanced 2 x 2 with two runs per cell, chosen so every sum of squares is exact in binary
 * floating point and can be checked by hand:
 *
 *   cell means 1.5, 3.5, 5.5, 7.5; grand mean 4.5
 *   SS_A = 4((2.5-4.5)^2 + (6.5-4.5)^2) = 32      SS_B = 4((3.5-4.5)^2 + (5.5-4.5)^2) = 8
 *   SS_cells = 40, so SS_AB = 40 - 32 - 8 = 0     SS_residual = 4 x 0.5 = 2, df 4, MS 0.5
 */
const HAND_CHECKED: FactorialObservation[] = [
  { factorA: "a1", factorB: "b1", response: 1 },
  { factorA: "a1", factorB: "b1", response: 2 },
  { factorA: "a1", factorB: "b2", response: 3 },
  { factorA: "a1", factorB: "b2", response: 4 },
  { factorA: "a2", factorB: "b1", response: 5 },
  { factorA: "a2", factorB: "b1", response: 6 },
  { factorA: "a2", factorB: "b2", response: 7 },
  { factorA: "a2", factorB: "b2", response: 8 },
];

function synthesise(
  levelsA: readonly string[],
  levelsB: readonly string[],
  perCell: number,
  response: (a: number, b: number, replicate: number) => number,
): FactorialObservation[] {
  const rows: FactorialObservation[] = [];
  levelsA.forEach((factorA, indexA) => {
    levelsB.forEach((factorB, indexB) => {
      for (let replicate = 0; replicate < perCell; replicate += 1) {
        rows.push({ factorA, factorB, response: response(indexA, indexB, replicate) });
      }
    });
  });
  return rows;
}

describe("deterministic pseudo-randomness", () => {
  it("reproduces a stream from a seed", () => {
    const first = Array.from({ length: 8 }, createRandom(20260802));
    const second = Array.from({ length: 8 }, createRandom(20260802));
    expect(first).toEqual(second);
  });

  it("gives different streams for different seeds", () => {
    const first = Array.from({ length: 8 }, createRandom(1));
    const second = Array.from({ length: 8 }, createRandom(2));
    expect(first).not.toEqual(second);
  });

  it("stays within the unit interval", () => {
    const random = createRandom(7);
    for (let draw = 0; draw < 5000; draw += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("refuses a negative or fractional seed", () => {
    expect(() => createRandom(-1)).toThrow(RangeError);
    expect(() => createRandom(1.5)).toThrow(RangeError);
  });

  it("decorrelates adjacent seeds", () => {
    // Regression. Without the seed-avalanche step, consecutive seeds produced correlated streams:
    // seeds 77, 78 and 79 gave byte-identical permutation counts over 199 permutations of the same
    // data. Consecutive seeds are exactly what a per-effect seed schedule uses, so this must hold.
    const first = Array.from({ length: 16 }, createRandom(77));
    const second = Array.from({ length: 16 }, createRandom(78));
    const agreeing = first.filter((value, index) => value === second[index]).length;
    expect(agreeing).toBe(0);
    // A one-bit change in the seed should move the first draw substantially, not nudge it.
    expect(Math.abs((first[0] as number) - (second[0] as number))).toBeGreaterThan(0.01);
  });
});

describe("descriptive helpers", () => {
  it("computes the mean and sample standard deviation", () => {
    expect(mean([2, 4, 4, 4, 5, 5, 7, 9])).toBe(5);
    expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.13809, 5);
  });

  it("returns null rather than zero for a single observation", () => {
    expect(standardDeviation([3])).toBeNull();
  });

  it("refuses the mean of an empty sample instead of returning NaN", () => {
    expect(() => mean([])).toThrow(RangeError);
  });

  it("interpolates quantiles between order statistics", () => {
    expect(quantile([1, 2, 3, 4], 0)).toBe(1);
    expect(quantile([1, 2, 3, 4], 1)).toBe(4);
    expect(quantile([1, 2, 3, 4], 0.5)).toBeCloseTo(2.5, 12);
  });
});

describe("two-way decomposition", () => {
  it("matches the hand-computed sums of squares", () => {
    const result = twoWayAnova(HAND_CHECKED);
    expect(result.a.sumOfSquares).toBeCloseTo(32, 10);
    expect(result.b.sumOfSquares).toBeCloseTo(8, 10);
    expect(result.interaction.sumOfSquares).toBeCloseTo(0, 10);
    expect(result.residualSumOfSquares).toBeCloseTo(2, 10);
    expect(result.residualDegreesOfFreedom).toBe(4);
    expect(result.residualMeanSquare).toBeCloseTo(0.5, 10);
    expect(result.a.fStatistic).toBeCloseTo(64, 10);
    expect(result.b.fStatistic).toBeCloseTo(16, 10);
    expect(result.interaction.fStatistic).toBeCloseTo(0, 10);
    expect(result.grandMean).toBeCloseTo(4.5, 10);
    expect(result.balanced).toBe(true);
  });

  it("reports partial eta-squared against residual, not total, variance", () => {
    const result = twoWayAnova(HAND_CHECKED);
    expect(result.a.partialEtaSquared).toBeCloseTo(32 / 34, 10);
    expect(result.b.partialEtaSquared).toBeCloseTo(8 / 10, 10);
  });

  it("recovers a pure interaction with both main effects at zero", () => {
    // Cell means +1, -1, -1, +1: every marginal mean is zero, so all the signal is interaction.
    const rows = synthesise(["a1", "a2"], ["b1", "b2"], 3, (a, b, replicate) => {
      const sign = a === b ? 1 : -1;
      return sign + (replicate - 1) * 0.01;
    });
    const result = twoWayAnova(rows);
    expect(result.a.sumOfSquares).toBeCloseTo(0, 8);
    expect(result.b.sumOfSquares).toBeCloseTo(0, 8);
    expect(result.interaction.sumOfSquares).toBeGreaterThan(10);
  });

  it("fits the additive model to the balanced closed form", () => {
    const fitted = fitAdditive(HAND_CHECKED);
    // grand + (mean_A - grand) + (mean_B - grand) = mean_A + mean_B - grand
    expect(fitted[0]).toBeCloseTo(2.5 + 3.5 - 4.5, 10);
    expect(fitted[7]).toBeCloseTo(6.5 + 5.5 - 4.5, 10);
  });

  it("keeps main effects orthogonal when the design is balanced", () => {
    // Type I, II and III agree under balance: SS_A must not change when B's effect grows.
    const weak = synthesise(["a1", "a2"], ["b1", "b2"], 4, (a, b, r) => a * 2 + b * 0.1 + r * 0.01);
    const strong = synthesise(["a1", "a2"], ["b1", "b2"], 4, (a, b, r) => a * 2 + b * 50 + r * 0.01);
    expect(twoWayAnova(weak).a.sumOfSquares).toBeCloseTo(twoWayAnova(strong).a.sumOfSquares, 8);
  });

  it("handles an unbalanced design and marks it as such", () => {
    const rows = [...HAND_CHECKED, { factorA: "a1", factorB: "b1", response: 1.5 }];
    const result = twoWayAnova(rows);
    expect(result.balanced).toBe(false);
    expect(result.observations).toBe(9);
    expect(result.residualDegreesOfFreedom).toBe(5);
  });

  it("refuses an empty cell rather than returning an unidentifiable fit", () => {
    const rows = HAND_CHECKED.filter(
      (row) => !(row.factorA === "a2" && row.factorB === "b2"),
    );
    expect(() => twoWayAnova(rows)).toThrow(/empty cell/i);
  });

  it("refuses a design with no residual degrees of freedom", () => {
    const rows = synthesise(["a1", "a2"], ["b1", "b2"], 1, (a, b) => a + b);
    expect(() => twoWayAnova(rows)).toThrow(/residual degrees of freedom/i);
  });
});

describe("permutation tests", () => {
  it("finds a strong main effect", () => {
    const rows = synthesise(["a1", "a2", "a3"], ["b1", "b2", "b3"], 4, (a, _b, r) => a * 5 + r * 0.1);
    const result = permutationTest(rows, "a", 999, 20260802);
    expect(result.pValue).toBeLessThan(0.01);
    expect(result.observedF).toBeGreaterThan(50);
  });

  it("does not manufacture an effect from noise", () => {
    const random = createRandom(4242);
    const rows = synthesise(["a1", "a2", "a3"], ["b1", "b2", "b3"], 4, () => random());
    expect(permutationTest(rows, "a", 999, 11).pValue).toBeGreaterThan(0.05);
  });

  it("is not fooled into significance by a large effect of the other factor", () => {
    // Freedman-Lane holds B's structure fixed. Permuting the raw response instead would let B's
    // enormous effect leak into A's null distribution and make A look significant.
    const random = createRandom(99);
    const rows = synthesise(["a1", "a2", "a3"], ["b1", "b2", "b3"], 4, (_a, b) => b * 100 + random());
    expect(permutationTest(rows, "a", 999, 5).pValue).toBeGreaterThan(0.05);
    expect(permutationTest(rows, "b", 999, 5).pValue).toBeLessThan(0.01);
  });

  it("detects an interaction that leaves both marginals flat", () => {
    const rows = synthesise(["a1", "a2"], ["b1", "b2"], 5, (a, b, r) =>
      (a === b ? 6 : -6) + (r - 2) * 0.1,
    );
    expect(permutationTest(rows, "interaction", 999, 3).pValue).toBeLessThan(0.01);
  });

  it("never reports a p-value of zero", () => {
    const rows = synthesise(["a1", "a2"], ["b1", "b2"], 4, (a, _b, r) => a * 1000 + r * 0.001);
    const result = permutationTest(rows, "a", 199, 1);
    expect(result.pValue).toBeGreaterThan(0);
    expect(result.pValue).toBeCloseTo(1 / 200, 10);
  });

  it("reproduces exactly from a seed and moves with the seed", () => {
    // The fixture must be *noise*. Under a strong effect no permutation ever reaches the observed
    // F, so the count is zero for every seed and the second assertion would pass vacuously while
    // telling us nothing about whether the seed is wired through at all.
    const random = createRandom(555);
    const rows = synthesise(["a1", "a2", "a3"], ["b1", "b2"], 4, () => random());
    expect(permutationTest(rows, "a", 199, 77)).toEqual(permutationTest(rows, "a", 199, 77));
    expect(permutationTest(rows, "a", 199, 77).atLeastAsExtreme).not.toBe(
      permutationTest(rows, "a", 199, 78).atLeastAsExtreme,
    );
  });

  it("refuses a non-positive permutation count", () => {
    expect(() => permutationTest(HAND_CHECKED, "a", 0, 1)).toThrow(RangeError);
  });
});

describe("bootstrap intervals", () => {
  it("brackets the point estimate and reproduces from a seed", () => {
    const rows = synthesise(["a1", "a2", "a3"], ["b1", "b2", "b3"], 4, (a, _b, r) => a * 3 + r * 0.5);
    const interval = bootstrapPartialEtaSquared(rows, "a", 500, 20260802);
    expect(interval.lower).toBeLessThanOrEqual(interval.point);
    expect(interval.upper).toBeGreaterThanOrEqual(interval.point);
    expect(interval.discarded).toBe(0);
    expect(bootstrapPartialEtaSquared(rows, "a", 500, 20260802)).toEqual(interval);
  });

  it("puts a null effect's interval near zero and a strong one near one", () => {
    const random = createRandom(31);
    const noisy = synthesise(["a1", "a2", "a3"], ["b1", "b2", "b3"], 4, () => random());
    const strong = synthesise(["a1", "a2", "a3"], ["b1", "b2", "b3"], 4, (a, _b, r) => a * 20 + r * 0.1);
    expect(bootstrapPartialEtaSquared(noisy, "a", 400, 8).upper).toBeLessThan(0.6);
    expect(bootstrapPartialEtaSquared(strong, "a", 400, 8).lower).toBeGreaterThan(0.9);
  });

  it("rejects a confidence level outside the open unit interval", () => {
    expect(() => bootstrapPartialEtaSquared(HAND_CHECKED, "a", 10, 1, 1)).toThrow(RangeError);
  });

  it("widens a block-bootstrap interval as the block length grows", () => {
    // An autocorrelated series: longer blocks preserve more dependence, so the interval should
    // not shrink towards the naive independent-sampling width.
    const random = createRandom(2024);
    const series: number[] = [];
    let value = 0;
    for (let index = 0; index < 400; index += 1) {
      value = 0.95 * value + (random() - 0.5);
      series.push(value);
    }
    const short = blockBootstrap(series, mean, 1, 400, 9);
    const long = blockBootstrap(series, mean, 25, 400, 9);
    expect(long.upper - long.lower).toBeGreaterThan(short.upper - short.lower);
    expect(long.point).toBeCloseTo(mean(series), 12);
  });

  it("refuses a block longer than the series", () => {
    expect(() => blockBootstrap([1, 2, 3], mean, 5, 10, 1)).toThrow(RangeError);
  });
});

describe("Holm correction", () => {
  it("matches the worked step-down values", () => {
    // Raw 0.01, 0.02, 0.03, 0.04 with m = 4: multipliers 4, 3, 2, 1 give 0.04, 0.06, 0.06, 0.06
    // after the monotonicity constraint lifts the third and fourth to the running maximum.
    const adjusted = holmAdjust([
      { label: "H1", p: 0.01 },
      { label: "H2", p: 0.02 },
      { label: "H3", p: 0.03 },
      { label: "H4", p: 0.04 },
    ]);
    expect(adjusted.map((entry) => entry.adjusted)).toEqual([0.04, 0.06, 0.06, 0.06]);
    expect(adjusted.map((entry) => entry.label)).toEqual(["H1", "H2", "H3", "H4"]);
    expect(adjusted.map((entry) => entry.rank)).toEqual([1, 2, 3, 4]);
  });

  it("is never anti-conservative relative to the raw value", () => {
    const adjusted = holmAdjust([
      { label: "a", p: 0.5 },
      { label: "b", p: 0.001 },
      { label: "c", p: 0.2 },
    ]);
    for (const entry of adjusted) {
      expect(entry.adjusted).toBeGreaterThanOrEqual(entry.raw);
    }
  });

  it("is uniformly no more conservative than Bonferroni", () => {
    const raw = [0.004, 0.01, 0.03, 0.049];
    const adjusted = holmAdjust(raw.map((p, index) => ({ label: `h${String(index)}`, p })));
    adjusted.forEach((entry, index) => {
      expect(entry.adjusted).toBeLessThanOrEqual(Math.min(1, (raw[index] as number) * raw.length) + 1e-12);
    });
  });

  it("clamps at one and preserves input order", () => {
    const adjusted = holmAdjust([
      { label: "x", p: 0.9 },
      { label: "y", p: 0.95 },
    ]);
    expect(adjusted.every((entry) => entry.adjusted <= 1)).toBe(true);
    expect(adjusted.map((entry) => entry.label)).toEqual(["x", "y"]);
  });

  it("returns an empty list unchanged", () => {
    expect(holmAdjust([])).toEqual([]);
  });
});

describe("median on even-sized samples", () => {
  it("averages the middle two rather than taking the upper of them", () => {
    // The onset medians were briefly wrong because sorted[floor(n/2)] takes the third of four.
    expect(quantile([500, 700, 900, 1100], 0.5)).toBeCloseTo(800, 9);
    expect(quantile([1200, 1600, 1800, 2000], 0.5)).toBeCloseTo(1700, 9);
  });

  it("still returns the middle value for odd-sized samples", () => {
    expect(quantile([600, 800, 1900], 0.5)).toBeCloseTo(800, 9);
  });
});
