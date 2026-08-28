import { describe, expect, it } from "vitest";

import { SimulationEngine } from "../src/engine/simulation.js";
import { Lineage } from "../src/domain/organism.js";
import { Opcode } from "../src/vm/opcodes.js";
import { fixedFixture, lifecycleConfig } from "./helpers/lifecycle-fixture.js";

function checkpointEngine(): SimulationEngine {
  const configuration = lifecycleConfig();
  configuration.duration.completed_ticks = 12;
  configuration.duration.sample_every_ticks = 2;
  configuration.duration.state_hash_every_ticks = 2;
  configuration.measurement.bucket_length_ticks = 2;
  return SimulationEngine.create(
    configuration,
    fixedFixture([
      {
        lineage: Lineage.Host,
        genome: [Opcode.COPY, Opcode.NOP],
        initial_energy: 200,
        coordinates: [{ x: 2, y: 2 }],
      },
      {
        lineage: Lineage.Parasite,
        genome: [Opcode.EXEC_NBR, Opcode.NOP],
        initial_energy: 200,
        coordinates: [{ x: 2, y: 1 }],
      },
    ]),
  );
}

describe("scientific state hashes and checkpoints", () => {
  it("restores to the same state and remains identical to uninterrupted execution", () => {
    const uninterrupted = checkpointEngine();
    for (let tick = 0; tick < 4; tick += 1) {
      uninterrupted.stepTick();
    }
    const checkpoint = uninterrupted.checkpoint();
    const restored = SimulationEngine.restore(uninterrupted.configuration, checkpoint);

    expect(restored.stateHash()).toBe(uninterrupted.stateHash());
    expect(restored.lineageRecords()).toEqual(uninterrupted.lineageRecords());
    expect(restored.populationMeasurement("scheduled")).toEqual(
      uninterrupted.populationMeasurement("scheduled"),
    );

    while (uninterrupted.terminalReason === null) {
      expect(restored.stepTick()).toEqual(uninterrupted.stepTick());
      expect(restored.stateHash()).toBe(uninterrupted.stateHash());
    }
    expect(restored.checkpoint()).toEqual(uninterrupted.checkpoint());
  });

  it("rejects checkpoint tampering before restoring state", () => {
    const engine = checkpointEngine();
    engine.stepTick();
    const checkpoint = JSON.parse(JSON.stringify(engine.checkpoint())) as {
      state: { completed_tick: number };
    };
    checkpoint.state.completed_tick += 1;
    expect(() => SimulationEngine.restore(engine.configuration, checkpoint)).toThrow(
      /digest does not match/u,
    );
  });

  it("retains complete parentage after organisms die", () => {
    const engine = checkpointEngine();
    engine.runUntilTerminated();
    const records = engine.lineageRecords();
    expect(records.length).toBe(engine.countersSnapshot().births + 2);
    for (const record of records) {
      if (record.parent_id !== null) {
        const parent = records.find((candidate) => candidate.organism_id === record.parent_id);
        expect(parent).toBeDefined();
        expect(record.generation).toBe((parent?.generation as number) + 1);
        expect(record.lineage).toBe(parent?.lineage);
      }
    }
  });
});
