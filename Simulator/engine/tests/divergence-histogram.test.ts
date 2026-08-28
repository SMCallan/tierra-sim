import { describe, expect, it } from "vitest";

import {
  DIVERGENCE_HISTOGRAM_BINS,
  divergenceBin,
  summariseDivergence,
  type OrganismBehaviourMeasurement,
} from "../src/measurement/divergence.js";

/**
 * D039: quartiles cannot establish multimodality, which D019 requires before any clustering claim.
 * These tests pin the binning contract the histogram relies on.
 */

function measurement(divergence: number | null): OrganismBehaviourMeasurement {
  return {
    organism_id: 0,
    lineage: "host",
    autonomous_successes: divergence === null ? 0 : 1,
    exploitative_successes: 0,
    divergence,
    exploitative_tendency: divergence,
    functional_class: "autonomous",
  } as unknown as OrganismBehaviourMeasurement;
}

describe("divergence binning", () => {
  it("places 0 in the first bin and 1 in the last, not out of range", () => {
    expect(divergenceBin(0)).toBe(0);
    expect(divergenceBin(1)).toBe(DIVERGENCE_HISTOGRAM_BINS - 1);
  });

  it("keeps a value just below a boundary in the lower bin", () => {
    expect(divergenceBin(0.049999)).toBe(0);
    expect(divergenceBin(0.05)).toBe(1);
  });

  it("never returns an index outside the histogram", () => {
    for (const value of [-0.1, 0, 0.5, 0.999999, 1, 1.1]) {
      const bin = divergenceBin(value);
      expect(bin).toBeGreaterThanOrEqual(0);
      expect(bin).toBeLessThan(DIVERGENCE_HISTOGRAM_BINS);
    }
  });
});

describe("histogram in the divergence summary", () => {
  it("counts every eligible organism exactly once", () => {
    const summary = summariseDivergence([
      measurement(0),
      measurement(0),
      measurement(1),
      measurement(0.5),
    ]);
    expect(summary.divergence_histogram).toHaveLength(DIVERGENCE_HISTOGRAM_BINS);
    expect(summary.divergence_histogram.reduce((a, b) => a + b, 0)).toBe(summary.eligible_count);
    expect(summary.divergence_histogram[0]).toBe(2);
    expect(summary.divergence_histogram[DIVERGENCE_HISTOGRAM_BINS - 1]).toBe(1);
    expect(summary.divergence_histogram[10]).toBe(1);
  });

  it("excludes ineligible organisms, matching mean_divergence", () => {
    const summary = summariseDivergence([measurement(1), measurement(null), measurement(null)]);
    expect(summary.eligible_count).toBe(1);
    expect(summary.divergence_histogram.reduce((a, b) => a + b, 0)).toBe(1);
    expect(summary.inactive_count).toBe(2);
  });

  it("is all zeros rather than absent when nothing is eligible", () => {
    const summary = summariseDivergence([measurement(null)]);
    expect(summary.divergence_histogram).toHaveLength(DIVERGENCE_HISTOGRAM_BINS);
    expect(summary.divergence_histogram.every((count) => count === 0)).toBe(true);
    expect(summary.mean_divergence).toBeNull();
  });

  it("distinguishes a bimodal population from a mid-valued one, which quartiles cannot", () => {
    const bimodal = summariseDivergence([...Array(50).fill(measurement(0)), ...Array(50).fill(measurement(1))]);
    const middling = summariseDivergence(Array(100).fill(measurement(0.5)));
    expect(bimodal.mean_divergence).toBeCloseTo(0.5, 12);
    expect(middling.mean_divergence).toBeCloseTo(0.5, 12);
    // Identical means; the histograms are what tell them apart.
    expect(bimodal.divergence_histogram[0]).toBe(50);
    expect(bimodal.divergence_histogram[DIVERGENCE_HISTOGRAM_BINS - 1]).toBe(50);
    expect(middling.divergence_histogram[10]).toBe(100);
  });
});
