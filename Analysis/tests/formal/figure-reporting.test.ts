import { describe, expect, it } from "vitest";

import { figureDivergenceTrajectories, type PanelReport } from "../../src/formal/figures.ts";

/**
 * SAP section 7 requires the runs contributing, the runs excluded by the coverage floor, the
 * parasite extinctions and the mean degenerate proportion to accompany every table *or figure*
 * carrying the primary outcome. Table 4.1 has always carried them; the trajectory figure did not,
 * and the gap was previously recorded as a deviation rather than closed. These tests exist so that
 * it cannot silently reopen.
 */

const MUTATIONS = ["0.01", "0.02", "0.04"] as const;
const HGTS = ["0.25", "0.5", "0.75"] as const;

const reportsFor = (excluded: number): PanelReport[] =>
  MUTATIONS.flatMap((mutation, m) =>
    HGTS.map((hgt, h) => ({
      mutation,
      hgt,
      runs: 4,
      excludedRuns: excluded,
      parasiteExtinctRuns: (m + h) % 5,
      meanDegenerateSampleProportion: 0.082 + m * 0.1 + h * 0.01,
    })),
  );

describe("Figure 4.4 reporting annotations", () => {
  it("annotates all nine factorial conditions with the four required quantities", () => {
    const svg = figureDivergenceTrajectories([], 10_000, reportsFor(0));
    for (const report of reportsFor(0)) {
      const expected =
        `extinct=${String(report.parasiteExtinctRuns)}/4 · deg=${(report.meanDegenerateSampleProportion * 100).toFixed(1)}%`;
      expect(svg).toContain(expected);
    }
    expect(svg.match(/n=4 of 4 · excl=0/g)).toHaveLength(9);
  });

  it("reports a non-zero coverage exclusion rather than folding it into extinction", () => {
    const svg = figureDivergenceTrajectories([], 10_000, reportsFor(2));
    // two of four excluded leaves two contributing, while extinction keeps the total denominator
    expect(svg).toContain("n=2 of 4 · excl=2");
    expect(svg).toContain("extinct=0/4");
  });

  it("omits annotations entirely when no reports are supplied", () => {
    expect(figureDivergenceTrajectories([], 10_000)).not.toContain("excl=");
  });

  it("no longer draws its own numbered title, which the Word caption supplies", () => {
    expect(figureDivergenceTrajectories([], 10_000, reportsFor(0))).not.toContain("Figure 4.4");
  });
});
