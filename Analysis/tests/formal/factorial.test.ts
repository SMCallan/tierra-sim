import { describe, expect, it } from "vitest";

import {
  analyseFactorial,
  classifyRun,
  persistenceByHgt,
  SAP_V1_SEEDS,
  selectFactorialRuns,
  summariseCells,
  summariseDecoupling,
  testH4,
  type ClassifiedRun,
} from "../../src/formal/factorial.ts";
import type { RunOutcomes } from "../../src/formal/run-outcomes.ts";

function outcomes(overrides: Partial<RunOutcomes> & { condition_id: string; run_id: string }): RunOutcomes {
  return {
    replicate_id: 0,
    seed: 1,
    completed_ticks: 100_000,
    terminal_reason: "completed",
    burn_in_ticks: 10_000,
    host_mean_divergence_after_burn_in: 0.89,
    late_window_host_mean_divergence: 0.89,
    post_burn_in_decoupling: 0.99,
    parasite_extant_at_end: true,
    parasite_extinction_tick: null,
    mean_divergence_after_burn_in: 0.85,
    sap_auc_host_delta_ticks: 76_500,
    late_window_mean_divergence: 0.85,
    parasite_mean_divergence_after_burn_in: 0.01,
    mean_eligible_proportion_after_burn_in: 0.42,
    mean_inactive_proportion_after_burn_in: 0.58,
    divergence_reliably_estimable: true,
    onset_tick_50: 800,
    onset_tick_90: 1600,
    final_defined_theil_u: 0.004,
    final_defined_decoupling_score: 0.996,
    lineage_information_defined_samples: 450,
    lineage_information_undefined_samples: 50,
    degenerate_sample_proportion: 0.1,
    samples_total: 500,
    samples_with_defined_divergence: 500,
    undefined_reason: null,
    ...overrides,
  };
}

/** A full 3 x 3 x 4 factorial with a mutation effect and no HGT effect, mirroring calibration. */
function factorialRuns(
  response: (mutation: number, hgt: number, replicate: number) => number,
): ClassifiedRun[] {
  const mutations = ["0.01", "0.02", "0.04"];
  const hgts = ["0.25", "0.5", "0.75"];
  const runs: ClassifiedRun[] = [];
  mutations.forEach((mutation, indexM) => {
    hgts.forEach((hgt, indexH) => {
      for (let replicate = 0; replicate < 4; replicate += 1) {
        runs.push(
          classifyRun(
            outcomes({
              run_id: `factorial__mut-${mutation}__hgt-${hgt}__r${String(replicate)}`,
              condition_id: `factorial__mut-${mutation}__hgt-${hgt}`,
              replicate_id: replicate,
              host_mean_divergence_after_burn_in: response(indexM, indexH, replicate),
            }),
          ),
        );
      }
    });
  });
  return runs;
}

describe("design classification", () => {
  it("reads factor levels and block from the condition identifier", () => {
    const run = classifyRun(
      outcomes({ run_id: "r", condition_id: "factorial__mut-0.01__hgt-0.75" }),
    );
    expect(run.block).toBe("factorial");
    expect(run.mutation).toBe("0.01");
    expect(run.hgt).toBe("0.75");
  });

  it("separates the default series and the mechanism controls", () => {
    expect(classifyRun(outcomes({ run_id: "r", condition_id: "default-series__mut-0.02__hgt-0.5" })).block)
      .toBe("default-series");
    expect(classifyRun(outcomes({ run_id: "r", condition_id: "control-no-evolution" })).block).toBe("control");
    expect(classifyRun(outcomes({ run_id: "r", condition_id: "control-hgt-only" })).mutation).toBeNull();
  });

  it("keeps levels as strings so 0.5 does not become a number", () => {
    const run = classifyRun(outcomes({ run_id: "r", condition_id: "factorial__mut-0.01__hgt-0.5" }));
    expect(run.hgt).toBe("0.5");
    expect(typeof run.hgt).toBe("string");
  });
});

describe("eligibility", () => {
  it("excludes runs below the coverage floor and names them", () => {
    const runs = [
      classifyRun(outcomes({ run_id: "keep", condition_id: "factorial__mut-0.01__hgt-0.25" })),
      classifyRun(
        outcomes({
          run_id: "drop",
          condition_id: "factorial__mut-0.01__hgt-0.25",
          divergence_reliably_estimable: false,
        }),
      ),
    ];
    const { eligible, report } = selectFactorialRuns(runs);
    expect(eligible).toHaveLength(1);
    expect(report.excludedForCoverage).toEqual(["drop"]);
    expect(report.total).toBe(2);
  });

  it("excludes a run whose primary outcome is undefined", () => {
    const runs = [
      classifyRun(
        outcomes({
          run_id: "nothing-to-measure",
          condition_id: "factorial__mut-0.01__hgt-0.25",
          host_mean_divergence_after_burn_in: null,
        }),
      ),
    ];
    const { eligible, report } = selectFactorialRuns(runs);
    expect(eligible).toHaveLength(0);
    expect(report.excludedForUndefinedOutcome).toEqual(["nothing-to-measure"]);
  });

  it("ignores controls and the default series", () => {
    const runs = [
      classifyRun(outcomes({ run_id: "c", condition_id: "control-no-evolution" })),
      classifyRun(outcomes({ run_id: "d", condition_id: "default-series__mut-0.02__hgt-0.5" })),
    ];
    expect(selectFactorialRuns(runs).report.total).toBe(0);
  });
});

describe("cell summaries", () => {
  it("carries extinction and degeneracy alongside the primary outcome", () => {
    const runs = factorialRuns((m) => 0.9 - m * 0.01).map((run, index) =>
      index % 2 === 0
        ? run
        : classifyRun(
            outcomes({
              ...run.outcomes,
              parasite_extant_at_end: false,
              parasite_extinction_tick: 40_000,
              degenerate_sample_proportion: 0.6,
            }),
          ),
    );
    const cells = summariseCells(runs);
    expect(cells).toHaveLength(9);
    for (const cell of cells) {
      expect(cell.runs).toBe(4);
      expect(cell.parasiteExtinctRuns).toBe(2);
      expect(cell.meanDegenerateSampleProportion).toBeCloseTo(0.35, 10);
      expect(cell.populationDivergenceMean).not.toBeNull();
    }
  });

  it("reports a null standard deviation for a single-run cell rather than zero", () => {
    const runs = [classifyRun(outcomes({ run_id: "r", condition_id: "factorial__mut-0.01__hgt-0.25" }))];
    expect(summariseCells(runs)[0]?.hostDivergenceSd).toBeNull();
  });
});

describe("the SAP section 4 analysis", () => {
  const options = { permutations: 499, resamples: 200, seeds: SAP_V1_SEEDS };

  it("finds the mutation effect and returns the HGT null, as calibration expects", () => {
    // Host Delta_D declines with mutation and is flat in HGT — the calibration pattern in D043.
    const runs = factorialRuns((m, _h, r) => 0.9 - m * 0.01 + (r - 1.5) * 0.0015);
    const analysis = analyseFactorial(runs, options);

    const h1 = analysis.hypotheses.find((entry) => entry.hypothesis === "H1");
    const h2 = analysis.hypotheses.find((entry) => entry.hypothesis === "H2");
    expect(h1?.permutation.pValue).toBeLessThan(0.01);
    expect(h2?.permutation.pValue).toBeGreaterThan(0.05);
    expect(h1?.partialEtaSquared.lower).toBeGreaterThan(0.5);
    expect(h2?.partialEtaSquared.upper).toBeLessThan(0.6);
  });

  it("applies Holm across the three tested hypotheses", () => {
    const runs = factorialRuns((m, _h, r) => 0.9 - m * 0.01 + (r - 1.5) * 0.0015);
    const analysis = analyseFactorial(runs, options);
    for (const hypothesis of analysis.hypotheses) {
      expect(hypothesis.adjustedP).toBeGreaterThanOrEqual(hypothesis.permutation.pValue);
      expect(hypothesis.adjustedP).toBeLessThanOrEqual(1);
    }
  });

  it("records the seeds it used", () => {
    const analysis = analyseFactorial(factorialRuns((m) => 0.9 - m * 0.01), options);
    expect(analysis.seeds).toEqual(SAP_V1_SEEDS);
    for (const hypothesis of analysis.hypotheses) {
      expect(hypothesis.permutation.seed).toBe(SAP_V1_SEEDS.permutation[hypothesis.effect]);
    }
  });

  it("reproduces exactly on a second run", () => {
    const runs = factorialRuns((m, h, r) => 0.9 - m * 0.01 + h * 0.001 + (r - 1.5) * 0.002);
    expect(analyseFactorial(runs, options)).toEqual(analyseFactorial(runs, options));
  });

  it("warns rather than proceeding silently when the design is unbalanced", () => {
    const runs = factorialRuns((m, _h, r) => 0.9 - m * 0.01 + (r - 1.5) * 0.002);
    const excluded = runs.map((run, index) =>
      index === 0
        ? classifyRun(outcomes({ ...run.outcomes, divergence_reliably_estimable: false }))
        : run,
    );
    const analysis = analyseFactorial(excluded, options);
    expect(analysis.anova.balanced).toBe(false);
    expect(analysis.warnings.join(" ")).toMatch(/unbalanced/i);
    expect(analysis.warnings.join(" ")).toMatch(/coverage floor/i);
    expect(analysis.eligibility.included).toBe(35);
  });

  it("does not test H4, which the plan leaves under-specified", () => {
    const analysis = analyseFactorial(factorialRuns((m) => 0.9 - m * 0.01), options);
    expect(analysis.hypotheses.map((entry) => entry.hypothesis)).toEqual(["H1", "H2", "H3"]);
  });
});

describe("persistence and decoupling", () => {
  it("counts extinctions per HGT level and medians only over extinct runs", () => {
    const runs = [
      classifyRun(outcomes({ run_id: "a", condition_id: "factorial__mut-0.01__hgt-0.25", parasite_extant_at_end: false, parasite_extinction_tick: 10_000 })),
      classifyRun(outcomes({ run_id: "b", condition_id: "factorial__mut-0.01__hgt-0.25", parasite_extant_at_end: false, parasite_extinction_tick: 30_000 })),
      classifyRun(outcomes({ run_id: "c", condition_id: "factorial__mut-0.01__hgt-0.25" })),
      classifyRun(outcomes({ run_id: "d", condition_id: "factorial__mut-0.01__hgt-0.75" })),
    ];
    const levels = persistenceByHgt(runs);
    const low = levels.find((entry) => entry.level === "0.25");
    expect(low?.runs).toBe(3);
    expect(low?.extinct).toBe(2);
    // The median must not be pulled towards the horizon by the surviving run.
    expect(low?.medianExtinctionTick).toBe(20_000);
    expect(levels.find((entry) => entry.level === "0.75")?.medianExtinctionTick).toBeNull();
  });

  it("reports decoupling with the degeneracy that qualifies it", () => {
    const runs = [
      classifyRun(outcomes({ run_id: "a", condition_id: "factorial__mut-0.01__hgt-0.25", post_burn_in_decoupling: 0.99, degenerate_sample_proportion: 0.2 })),
      classifyRun(outcomes({ run_id: "b", condition_id: "factorial__mut-0.01__hgt-0.25", post_burn_in_decoupling: null, degenerate_sample_proportion: 1 })),
    ];
    const summary = summariseDecoupling(runs);
    expect(summary.runsWithDefinedDecoupling).toBe(1);
    expect(summary.runsWithNoDefinedSample).toBe(1);
    expect(summary.meanDecoupling).toBeCloseTo(0.99, 10);
    expect(summary.meanDegenerateSampleProportion).toBeCloseTo(0.6, 10);
  });

  it("buckets on the HGT token alone, so callers must filter to the factorial block first", () => {
    // Regression for a defect found when the SAP entry point was built. `persistenceByHgt`
    // buckets purely on the level in the condition identifier and does not filter by block, so
    // handing it every run pools the twelve default-series runs — which also sit at HGT 0.5 —
    // into the 0.5 cell and shifts its median away from the value SAP section 2.2 defines over
    // the factorial block. The behaviour is deliberate; this test pins it so the next caller
    // meets it here rather than in a results table.
    const runs = [
      classifyRun(outcomes({ run_id: "f1", condition_id: "factorial__mut-0.02__hgt-0.5", parasite_extant_at_end: false, parasite_extinction_tick: 10_000 })),
      classifyRun(outcomes({ run_id: "f2", condition_id: "factorial__mut-0.02__hgt-0.5", parasite_extant_at_end: false, parasite_extinction_tick: 20_000 })),
      classifyRun(outcomes({ run_id: "d1", condition_id: "default-series__mut-0.02__hgt-0.5", parasite_extant_at_end: false, parasite_extinction_tick: 80_000 })),
      classifyRun(outcomes({ run_id: "d2", condition_id: "default-series__mut-0.02__hgt-0.5", parasite_extant_at_end: false, parasite_extinction_tick: 90_000 })),
    ];

    const pooled = persistenceByHgt(runs).find((entry) => entry.level === "0.5");
    expect(pooled?.runs).toBe(4);
    expect(pooled?.medianExtinctionTick).toBe(50_000);

    const factorialOnly = persistenceByHgt(runs.filter((run) => run.block === "factorial")).find(
      (entry) => entry.level === "0.5",
    );
    expect(factorialOnly?.runs).toBe(2);
    expect(factorialOnly?.medianExtinctionTick).toBe(15_000);
  });
});

describe("H4 under SAP v1.0 Amendment 1", () => {
  /**
   * Spread is centred on `decoupling`, so a group's mean is exactly `decoupling`. An asymmetric
   * offset would give two nominally equal groups slightly different means, and the "no difference"
   * test would then be asserting against a real difference the fixture had invented.
   */
  function group(condition: string, count: number, decoupling: number | null): ClassifiedRun[] {
    return Array.from({ length: count }, (_unused, index) =>
      classifyRun(
        outcomes({
          run_id: `${condition}__r${String(index)}`,
          condition_id: condition,
          post_burn_in_decoupling:
            decoupling === null ? null : decoupling + (index - (count - 1) / 2) * 0.001,
        }),
      ),
    );
  }

  it("supports H4 when the factorial block decouples more than the no-evolution control", () => {
    const runs = [
      ...group("factorial__mut-0.01__hgt-0.25", 12, 0.99),
      ...group("factorial__mut-0.04__hgt-0.75", 12, 0.98),
      ...group("control-no-evolution", 4, 0.10),
    ];
    const result = testH4(runs, 4999, 20260824);
    expect(result.tested).toBe(true);
    expect(result.difference).toBeGreaterThan(0.8);
    expect(result.pValue).toBeLessThan(0.01);
  });

  it("does not support H4 when the control decouples just as much", () => {
    const runs = [...group("factorial__mut-0.02__hgt-0.5", 12, 0.5), ...group("control-no-evolution", 4, 0.5)];
    const result = testH4(runs, 4999, 20260824);
    expect(result.tested).toBe(true);
    expect(result.pValue).toBeGreaterThan(0.05);
  });

  it("refuses to test when extinction has emptied the control group", () => {
    // D_info is undefined once a lineage goes extinct; calibration found that in most runs.
    const runs = [
      ...group("factorial__mut-0.02__hgt-0.5", 12, 0.99),
      ...group("control-no-evolution", 4, null),
    ];
    const result = testH4(runs, 999, 1);
    expect(result.tested).toBe(false);
    expect(result.pValue).toBeNull();
    expect(result.controlRuns).toBe(0);
    expect(result.notTestedReason).toMatch(/undefined once a lineage goes extinct/i);
  });

  it("refuses to test on two control runs rather than reporting a difference from two points", () => {
    const runs = [
      ...group("factorial__mut-0.02__hgt-0.5", 12, 0.99),
      ...group("control-no-evolution", 2, 0.1),
    ];
    expect(testH4(runs, 999, 1).tested).toBe(false);
  });

  it("excludes the other mechanism controls from the baseline", () => {
    // Only control-no-evolution is the declared baseline; mutation-only and HGT-only are not.
    const runs = [
      ...group("factorial__mut-0.02__hgt-0.5", 12, 0.99),
      ...group("control-mutation-only", 4, 0.5),
      ...group("control-hgt-only", 4, 0.5),
      ...group("control-no-evolution", 4, 0.1),
    ];
    const result = testH4(runs, 999, 1);
    expect(result.controlRuns).toBe(4);
    expect(result.controlMeanDecoupling).toBeLessThan(0.2);
  });

  it("reproduces exactly from a seed", () => {
    const runs = [...group("factorial__mut-0.02__hgt-0.5", 12, 0.9), ...group("control-no-evolution", 4, 0.4)];
    expect(testH4(runs, 999, 7)).toEqual(testH4(runs, 999, 7));
  });
});

describe("bootstrap degeneracy reporting", () => {
  it("warns when a meaningful share of bootstrap resamples was discarded", () => {
    // Two runs per cell makes many within-cell resamples degenerate, so the discard rate rises.
    const runs: ClassifiedRun[] = [];
    ["0.01", "0.02", "0.04"].forEach((mutation, indexM) => {
      ["0.25", "0.5", "0.75"].forEach((hgt) => {
        for (let replicate = 0; replicate < 2; replicate += 1) {
          runs.push(
            classifyRun(
              outcomes({
                run_id: `factorial__mut-${mutation}__hgt-${hgt}__r${String(replicate)}`,
                condition_id: `factorial__mut-${mutation}__hgt-${hgt}`,
                host_mean_divergence_after_burn_in: 0.9 - indexM * 0.01 + replicate * 0.002,
              }),
            ),
          );
        }
      });
    });
    const analysis = analyseFactorial(runs, {
      permutations: 99,
      resamples: 200,
      seeds: SAP_V1_SEEDS,
    });
    const totalDiscarded = analysis.hypotheses.reduce(
      (total, entry) => total + entry.partialEtaSquared.discarded,
      0,
    );
    // Either nothing was discarded, or the analysis said so rather than reporting a clean interval.
    if (totalDiscarded / (200 * 3) > 0.05) {
      expect(analysis.warnings.join(" ")).toMatch(/degenerate and discarded/i);
    }
    expect(analysis.warnings.every((warning) => typeof warning === "string")).toBe(true);
  });

  it("stays silent when no resample was discarded", () => {
    const runs = factorialRuns((m, _h, r) => 0.9 - m * 0.01 + (r - 1.5) * 0.002);
    const analysis = analyseFactorial(runs, { permutations: 99, resamples: 200, seeds: SAP_V1_SEEDS });
    expect(analysis.warnings.join(" ")).not.toMatch(/degenerate and discarded/i);
  });
});
