import { describe, expect, it } from "vitest";

import {
  definedMean,
  definedObservationDuration,
  normalisedAuc,
  onsetTick,
  runOutcomes,
  SAP_V1_PARAMETERS,
} from "../../src/formal/run-outcomes.ts";

describe("defined-only aggregation", () => {
  it("ignores undefined values rather than coercing them to zero", () => {
    expect(definedMean([1, null, 3])).toBe(2);
  });

  it("returns undefined when nothing is defined, never zero", () => {
    expect(definedMean([null, null])).toBeNull();
    expect(definedMean([])).toBeNull();
  });
});

describe("normalised area under the divergence curve", () => {
  it("integrates a flat series to its own value", () => {
    expect(
      normalisedAuc([
        { tick: 0, value: 0.5 },
        { tick: 200, value: 0.5 },
        { tick: 400, value: 0.5 },
      ]),
    ).toBeCloseTo(0.5, 12);
  });

  it("weights by tick span, not by sample count", () => {
    // A long segment at 0 and a short one at 1 must not average to 0.5.
    const auc = normalisedAuc([
      { tick: 0, value: 0 },
      { tick: 900, value: 0 },
      { tick: 1000, value: 1 },
    ]);
    expect(auc).toBeLessThan(0.1);
  });

  it("breaks integration at undefined points instead of interpolating across them", () => {
    // Δ_D undefined is not Δ_D zero; the gap must be skipped, leaving the defined segment's value.
    expect(
      normalisedAuc([
        { tick: 0, value: 1 },
        { tick: 200, value: 1 },
        { tick: 400, value: null },
        { tick: 600, value: null },
      ]),
    ).toBeCloseTo(1, 12);
  });

  it("returns undefined when no defined segment exists", () => {
    expect(normalisedAuc([{ tick: 0, value: null }, { tick: 200, value: null }])).toBeNull();
  });
});

function sample(tick: number, mean: number | null, defined = true) {
  const summary = {
    mean_divergence: mean,
    median_divergence: mean,
    q25_divergence: mean,
    q75_divergence: mean,
    eligible_count: mean === null ? 0 : 10,
    eligible_proportion: mean === null ? null : 0.5,
    inactive_count: 10,
    inactive_proportion: 0.5,
    population_count: 20,
  };
  return {
    tick,
    divergence: { host: summary, parasite: summary, total: summary },
    functional_classes: null,
    lineage_information: {
      defined,
      theil_u_function_given_lineage: defined ? 0.25 : null,
      decoupling_score: defined ? 0.75 : null,
      mutual_information_bits: defined ? 0.5 : null,
      function_entropy_bits: defined ? 2 : null,
      undefined_reason: defined ? null : "single_lineage_degenerate",
    },
    state: { host_population: 10, parasite_population: 10 },
  };
}

describe("run-level reduction", () => {
  const manifest = {
    run_id: "r", condition_id: "c", replicate_id: 0, seed: 1,
    completed_ticks: 1000, requested_ticks: 1000, terminal_reason: "completed",
  };

  it("excludes samples before the declared burn-in", () => {
    const outcomes = runOutcomes(
      { manifest, samples: [sample(0, 0), sample(200, 0), sample(600, 1), sample(800, 1)] },
      { ...SAP_V1_PARAMETERS, burnInTicks: 600 },
    );
    // Only the post-burn-in samples, both 1.
    expect(outcomes.mean_divergence_after_burn_in).toBe(1);
  });

  it("excludes the burn-in boundary sample itself", () => {
    // SAP section 2.1 averages strictly after the burn-in tick, and section 1 fixes the first
    // included sample at 10,200 for a 10,000-tick burn-in sampled every 200 ticks. The boundary
    // value is deliberately unlike its successors: a `>=` selector would average 0, 1, 1 and
    // return two thirds rather than one.
    const outcomes = runOutcomes(
      { manifest, samples: [sample(400, 0), sample(600, 0), sample(800, 1), sample(1000, 1)] },
      { ...SAP_V1_PARAMETERS, burnInTicks: 600 },
    );
    expect(outcomes.mean_divergence_after_burn_in).toBe(1);
  });

  it("takes the late window from requested ticks, not completed ticks", () => {
    const short = { ...manifest, completed_ticks: 400 };
    const outcomes = runOutcomes(
      { manifest: short, samples: [sample(0, 0), sample(400, 0), sample(800, 0), sample(950, 1)] },
      { ...SAP_V1_PARAMETERS, burnInTicks: 0 },
    );
    // Late window is the trailing tenth of the *requested* 1000, so it starts at 900 and only
    // the tick-950 sample qualifies. The window comes from requested ticks, so a run that stopped
    // at 400 is not silently given a longer window than the plan declared.
    expect(outcomes.late_window_mean_divergence).toBe(1);
  });

  it("counts degenerate lineage-information samples rather than dropping them silently", () => {
    const outcomes = runOutcomes(
      { manifest, samples: [sample(0, 1, true), sample(200, 1, false), sample(400, 1, false)] },
      { ...SAP_V1_PARAMETERS, burnInTicks: 0 },
    );
    expect(outcomes.lineage_information_defined_samples).toBe(1);
    expect(outcomes.lineage_information_undefined_samples).toBe(2);
    expect(outcomes.undefined_reason).toBe("single_lineage_degenerate");
    // Theil's U comes from the last *defined* sample, never from a degenerate one.
    expect(outcomes.final_defined_theil_u).toBe(0.25);
  });

  it("reports undefined divergence as undefined, not zero", () => {
    const outcomes = runOutcomes(
      { manifest, samples: [sample(0, null), sample(200, null)] },
      { ...SAP_V1_PARAMETERS, burnInTicks: 0 },
    );
    expect(outcomes.mean_divergence_after_burn_in).toBeNull();
    expect(outcomes.samples_with_defined_divergence).toBe(0);
  });
});

describe("onset detection", () => {
  const series = [
    { tick: 0, value: 0.0 },
    { tick: 200, value: 0.2 },
    { tick: 400, value: 0.5 },
    { tick: 600, value: 0.85 },
    { tick: 800, value: 0.9 },
  ];

  it("finds the first crossing of a fraction of the asymptote", () => {
    expect(onsetTick(series, 0.9, 0.5)).toBe(400);
    expect(onsetTick(series, 0.9, 0.9)).toBe(600);
  });

  it("returns null rather than a tick when there is no asymptote to reach", () => {
    expect(onsetTick(series, null, 0.5)).toBeNull();
    expect(onsetTick(series, 0, 0.5)).toBeNull();
  });

  it("skips undefined samples instead of treating them as zero", () => {
    const gappy = [
      { tick: 0, value: null },
      { tick: 200, value: null },
      { tick: 400, value: 0.8 },
    ];
    expect(onsetTick(gappy, 0.9, 0.5)).toBe(400);
  });

  it("returns null when the series never reaches the target", () => {
    expect(onsetTick([{ tick: 0, value: 0.1 }], 0.9, 0.9)).toBeNull();
  });
});

describe("SAP-required run-level fields", () => {
  const manifest = {
    run_id: "r", condition_id: "c", replicate_id: 0, seed: 1,
    completed_ticks: 1000, requested_ticks: 1000, terminal_reason: "completed",
  };
  // The reducer selects samples *strictly after* the burn-in tick, per SAP section 2.1. These
  // fixtures start at tick 0 and mean to exercise every sample, so the burn-in sits below the
  // first tick rather than on it.
  const parameters = { ...SAP_V1_PARAMETERS, burnInTicks: -1 };

  function withParasites(tick: number, parasites: number) {
    const base = sample(tick, 0.9, true);
    return { ...base, state: { host_population: 100, parasite_population: parasites } };
  }

  it("records the first tick at which parasites reached zero, not merely the end state", () => {
    const outcomes = runOutcomes(
      { manifest, samples: [withParasites(0, 10), withParasites(200, 0), withParasites(400, 0)] },
      parameters,
    );
    expect(outcomes.parasite_extinction_tick).toBe(200);
    expect(outcomes.parasite_extant_at_end).toBe(false);
  });

  it("reports a surviving parasite lineage with no extinction tick", () => {
    const outcomes = runOutcomes(
      { manifest, samples: [withParasites(0, 10), withParasites(200, 4)] },
      parameters,
    );
    expect(outcomes.parasite_extinction_tick).toBeNull();
    expect(outcomes.parasite_extant_at_end).toBe(true);
  });

  it("applies the Decision 0007 coverage floor", () => {
    // The fixture reports an eligible proportion of 0.5, comfortably above the 0.25 floor.
    const above = runOutcomes({ manifest, samples: [sample(0, 0.9)] }, parameters);
    expect(above.divergence_reliably_estimable).toBe(true);
    // A floor above the fixture's coverage must exclude it.
    const below = runOutcomes({ manifest, samples: [sample(0, 0.9)] }, { ...parameters, coverageFloor: 0.75 });
    expect(below.divergence_reliably_estimable).toBe(false);
  });

  it("treats undefined coverage as failing the floor rather than passing it", () => {
    const outcomes = runOutcomes({ manifest, samples: [sample(0, null)] }, parameters);
    expect(outcomes.mean_eligible_proportion_after_burn_in).toBeNull();
    expect(outcomes.divergence_reliably_estimable).toBe(false);
  });

  it("reports the degenerate-sample proportion required by SAP section 7", () => {
    const outcomes = runOutcomes(
      {
        manifest,
        samples: [sample(0, 0.9, true), sample(200, 0.9, false), sample(400, 0.9, false), sample(600, 0.9, false)],
      },
      parameters,
    );
    expect(outcomes.degenerate_sample_proportion).toBeCloseTo(0.75, 12);
  });

  it("carries host-lineage divergence as the primary outcome", () => {
    const outcomes = runOutcomes({ manifest, samples: [sample(0, 0.88), sample(200, 0.9)] }, parameters);
    expect(outcomes.host_mean_divergence_after_burn_in).toBeCloseTo(0.89, 12);
  });
});

describe("total population extinction", () => {
  it("survives a sample with null divergence and lineage information", () => {
    // Regression for D051. The engine emits nulls in the final sample of a run that reaches total
    // population extinction; four of sixty formal runs did, and the pipeline crashed on the first
    // one it read. A null sample must contribute nothing — never a zero, which would record a
    // divergence for a population that does not exist.
    const manifest = {
      run_id: "extinct", condition_id: "control-no-evolution", replicate_id: 0, seed: 1,
      completed_ticks: 8426, requested_ticks: 100_000, terminal_reason: "extinction",
    };
    const dead = {
      tick: 8426,
      divergence: null,
      lineage_information: null,
      state: { host_population: 0, parasite_population: 0 },
    } as unknown as Parameters<typeof runOutcomes>[0]["samples"][number];

    const outcomes = runOutcomes(
      { manifest, samples: [sample(0, 0.5, true), dead] },
      { ...SAP_V1_PARAMETERS, burnInTicks: -1 },
    );
    expect(outcomes.terminal_reason).toBe("extinction");
    expect(outcomes.host_mean_divergence_after_burn_in).toBeCloseTo(0.5, 12);
    expect(outcomes.parasite_extant_at_end).toBe(false);
    expect(outcomes.lineage_information_defined_samples).toBe(1);
    expect(outcomes.lineage_information_undefined_samples).toBe(1);
  });
});


describe("SAP §2.4 observation duration", () => {
  it("sums only the intervals where the series is defined", () => {
    expect(
      definedObservationDuration([
        { tick: 0, value: 0.5 },
        { tick: 200, value: 0.6 },
        { tick: 400, value: null },
        { tick: 600, value: 0.7 },
        { tick: 800, value: 0.8 },
      ]),
    ).toBe(400);
  });

  it("does not bridge an undefined gap, because undefined is not zero", () => {
    expect(
      definedObservationDuration([
        { tick: 0, value: 0.5 },
        { tick: 200, value: null },
        { tick: 400, value: 0.9 },
      ]),
    ).toBe(0);
  });

  it("gives the plan's area when multiplied by the primary mean", () => {
    const points = [
      { tick: 0, value: 0.8 },
      { tick: 200, value: 0.9 },
      { tick: 400, value: 1.0 },
    ];
    const duration = definedObservationDuration(points);
    expect(duration).toBe(400);
    // primary mean × defined duration, in Δ_D·ticks — not a normalised average
    expect(0.9 * duration).toBeCloseTo(360, 6);
  });
});
