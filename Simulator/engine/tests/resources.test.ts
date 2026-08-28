import { describe, expect, it } from "vitest";

import { EnergyEventKind } from "../src/domain/events.js";
import { Lineage } from "../src/domain/organism.js";
import { SimulationEngine } from "../src/engine/simulation.js";
import { Opcode } from "../src/vm/opcodes.js";
import { fixedFixture, lifecycleConfig } from "./helpers/lifecycle-fixture.js";

function resourceEngine(): SimulationEngine {
  const configuration = lifecycleConfig();
  configuration.identity.schema_version = "0.4.0";
  configuration.identity.engine_specification = "0.2";
  configuration.exploitation = { donor_copy_rule: "cyclic_copy_search" };
  configuration.duration.completed_ticks = 3;
  configuration.world.width = 1;
  configuration.world.height = 1;
  configuration.energy.maximum_organism_energy = 10;
  configuration.energy.offspring_endowment = 5;
  configuration.resources = {
    mode: "local_renewable",
    cell_capacity: 4,
    initial_stock: 1,
    regeneration_per_tick: 2,
    harvest_per_activation: 3,
    regeneration_timing: "before_scheduler_snapshot",
    harvest_timing: "after_exogenous_before_instruction",
  };
  return SimulationEngine.create(
    configuration,
    fixedFixture([
      {
        lineage: Lineage.Host,
        genome: [Opcode.NOP],
        initial_energy: 5,
        coordinates: [{ x: 0, y: 0 }],
      },
    ]),
  );
}

describe("local renewable resources", () => {
  it("regenerates before scheduling, harvests internally, and preserves exact energy", () => {
    const engine = resourceEngine();
    expect(engine.resourceSnapshot()).toMatchObject({
      stocks: [1],
      counters: { initial_total: 1, regenerated_total: 0, harvested_total: 0 },
    });

    const first = engine.stepTick();
    expect(first.events[0]).toMatchObject({
      type: "resource_regeneration",
      amount: 2,
      replenished_cells: 1,
      total_stock_after: 3,
    });
    expect(first.events).toContainEqual(
      expect.objectContaining({
        type: "energy",
        kind: EnergyEventKind.ResourceHarvest,
        amount: 3,
      }),
    );
    expect(engine.organismSnapshot(0)?.energy).toBe(8);
    expect(engine.resourceSnapshot()?.stocks).toEqual([0]);

    engine.stepTick();
    const third = engine.stepTick();
    expect(engine.organismSnapshot(0)?.energy).toBe(10);
    expect(engine.resourceSnapshot()).toMatchObject({
      stocks: [2],
      counters: {
        initial_total: 1,
        regenerated_total: 6,
        harvested_total: 5,
        harvest_requested_total: 5,
        harvest_opportunities: 2,
        zero_harvests: 0,
        partial_harvests: 0,
      },
    });
    expect(third.events.some((event) => event.type === "energy")).toBe(false);

    const measurement = engine.populationMeasurement("scheduled");
    expect(measurement.resources).toMatchObject({
      total_capacity: 4,
      total_stock: 2,
      stock_proportion: 0.5,
      occupied_total_stock: 2,
      cumulative_harvest_shortfall: 0,
    });
  });

  it("round-trips resource stocks and counters through a versioned checkpoint", () => {
    const engine = resourceEngine();
    engine.stepTick();
    const checkpoint = engine.checkpoint();
    expect(checkpoint.checkpoint_format).toBe("0.3.0");
    // Decision 0018: resource-bearing runs hash pedigree incrementally, so they emit v4.
    // Legacy resource-free configurations keep v2, verified in checkpoint.test.ts.
    expect(checkpoint.state_hash_algorithm).toBe(
      "sha256/canonical-scientific-state-v4",
    );
    const restored = SimulationEngine.restore(engine.configuration, checkpoint);
    expect(restored.resourceSnapshot()).toEqual(engine.resourceSnapshot());
    expect(restored.stateHash()).toBe(engine.stateHash());
    expect(restored.stepTick()).toEqual(engine.stepTick());
  });

  it("keeps legacy state and checkpoint versions resource-free", () => {
    const configuration = lifecycleConfig();
    configuration.duration.completed_ticks = 1;
    const engine = SimulationEngine.create(
      configuration,
      fixedFixture([
        {
          lineage: Lineage.Host,
          genome: [Opcode.NOP],
          initial_energy: 5,
          coordinates: [{ x: 0, y: 0 }],
        },
      ]),
    );
    expect(engine.resourceSnapshot()).toBeNull();
    expect(engine.scientificStateSnapshot()).not.toHaveProperty("local_resources");
    expect(engine.checkpoint()).toMatchObject({
      checkpoint_format: "0.2.0",
      engine_state_version: "0.2.0",
      state_hash_algorithm: "sha256/canonical-scientific-state-v2",
    });
  });

  it("enforces Decision 0016: LocalResourceField harvests from home cell first, then cardinal neighbours", async () => {
    const { LocalResourceField } = await import("../src/world/resource-field.js");
    const config = {
      mode: "local_renewable" as const,
      cell_capacity: 10,
      initial_stock: 0,
      regeneration_per_tick: 0,
      harvest_per_activation: 5,
      harvest_neighbourhood_radius: 1,
      regeneration_timing: "before_scheduler_snapshot" as const,
      harvest_timing: "after_exogenous_before_instruction" as const,
    };
    const field = new LocalResourceField(3, 3, config);
    field.regenerate(2); // All 9 cells now have stock 2
    // Home cell (1,1) has 2. Request 5.
    // Draws 2 from home (1,1), 2 from North (1,0), 1 from East (2,1).
    const harvested = field.harvest({ x: 1, y: 1 }, 5, 1);
    expect(harvested).toBe(5);
    expect(field.stockAt({ x: 1, y: 1 })).toBe(0);
    expect(field.stockAt({ x: 1, y: 0 })).toBe(0);
    expect(field.stockAt({ x: 2, y: 1 })).toBe(1);
    expect(field.totalStock()).toBe(18 - 5);
  });
});
