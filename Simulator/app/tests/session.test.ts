import {
  parseEngineConfig,
  SimulationEngine,
  type EngineConfig,
} from "@tierra-sim/engine";
import { describe, expect, it } from "vitest";

import demoConfigurationJson from "../../runner/presets/demo-config.json" with { type: "json" };
import demoFixture from "../../runner/presets/demo-fixture.json" with { type: "json" };
import { createDemoSession, createExploreSession } from "../src/simulation/demo.js";

const demoConfiguration = demoConfigurationJson as unknown as EngineConfig;

describe("browser simulation adapter", () => {
  it("matches uninterrupted direct-engine execution exactly", () => {
    const browser = createDemoSession();
    const direct = SimulationEngine.create(parseEngineConfig(demoConfiguration), demoFixture);

    const browserFinal = browser.runUntilTerminated();
    direct.runUntilTerminated();

    expect(browserFinal.state_hash).toBe(direct.stateHash());
    expect(browserFinal.state_hash).toBe(
      "302d5e593419ea69b7ed367d435e47d560b8311080da8a5a116af96855f785aa",
    );
    expect(browserFinal.counters).toEqual(direct.countersSnapshot());
    expect(browserFinal.population_total).toBe(direct.populationSize);
    expect(browserFinal.organisms_ever_born).toBe(direct.lineageRecords().length);
  });

  it("is invariant to presentation batch size", () => {
    const singleStep = createDemoSession({ completed_ticks: 80 });
    const accelerated = createDemoSession({ completed_ticks: 80 });

    while (singleStep.terminalReason === null) {
      singleStep.step(1);
    }
    while (accelerated.terminalReason === null) {
      accelerated.step(17);
    }

    expect(accelerated.snapshot()).toEqual(singleStep.snapshot());
  });

  it("records formal samples and preserves undefined eligibility without imputation", () => {
    const browser = createDemoSession({ completed_ticks: 40 });
    browser.step(20);
    const first = browser.snapshot();
    expect(first.samples).toHaveLength(1);
    expect(first.samples[0]).toMatchObject({
      tick: 20,
      population_total: 29,
      eligible_count: 0,
      mean_divergence: null,
    });

    const final = browser.step(20);
    expect(final.samples[1]).toMatchObject({
      tick: 40,
      population_total: 34,
      eligible_count: 0,
      mean_divergence: null,
    });
  });

  it("labels an off-boundary terminal sample as non-formal", () => {
    const browser = createDemoSession({ completed_ticks: 25 });
    const final = browser.runUntilTerminated();

    expect(final.samples.map((sample) => sample.tick)).toEqual([20, 25]);
    expect(final.samples[1]?.mean_divergence).toBeNull();
    expect(final.latest_formal_measurement?.tick).toBe(20);
  });

  it("provides a deterministic dense exploration ecology without changing the audited demo", () => {
    const first = createExploreSession({ completed_ticks: 40 });
    const second = createExploreSession({ completed_ticks: 40 });

    expect(first.snapshot()).toMatchObject({
      width: 48,
      height: 32,
      population_total: 256,
      ancestor_count: 256,
      terminal_reason: null,
      resource_cell_capacity: 120,
      resource_stock_proportion: 0.5,
    });

    const firstFinal = first.runUntilTerminated();
    const secondFinal = second.runUntilTerminated();
    expect(secondFinal.state_hash).toBe(firstFinal.state_hash);
    expect(secondFinal.population_total).toBe(firstFinal.population_total);
    expect(secondFinal.recent_events).toEqual(firstFinal.recent_events);
    expect(firstFinal.resource_counters?.regenerated_total).toBeGreaterThan(0);
    expect(firstFinal.resource_counters?.harvested_total).toBeGreaterThan(0);
  });

  it("retains deterministic presentation events without including them in scientific state", () => {
    const session = createDemoSession({ completed_ticks: 40 });
    const initial = session.snapshot();
    const final = session.runUntilTerminated();

    expect(initial.recent_events[0]).toMatchObject({
      tick: 0,
      category: "system",
      discovery: false,
    });
    expect(final.recent_events.some((event) => event.discovery)).toBe(true);
    expect(final.state_hash).toBe(
      "7c8067d2a6e735305485b09335775bbf95e751e8a83fa4992cd4fa18328d7f83",
    );
  });
});
