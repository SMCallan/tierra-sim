import { describe, expect, it } from "vitest";

import { SimulationEngine } from "../src/engine/simulation.js";
import { Lineage } from "../src/domain/organism.js";
import { Opcode } from "../src/vm/opcodes.js";
import { fixedFixture, lifecycleConfig } from "./helpers/lifecycle-fixture.js";

/**
 * ENG-004b moved pedigree verification from a whole-history rescan on every tick to an incremental
 * check, with a full scan forced at terminal state. These tests exist to show the change is
 * behaviour-preserving and that the checks still run — a cheap invariant that stops catching
 * things is worse than an expensive one.
 *
 * Corruption of a pedigree record cannot be injected from outside the engine: `#lineageRecords` is
 * genuinely private and `lineageRecords()` returns deep-readonly copies. That is the correct
 * design, so these tests verify the properties that are observable — equivalence, completeness of
 * the registry, and the forced terminal scan — rather than reaching into internals.
 */

function twoAncestorEngine(): SimulationEngine {
  return SimulationEngine.create(
    lifecycleConfig(),
    fixedFixture([
      {
        lineage: Lineage.Host,
        genome: [Opcode.NOP],
        initial_energy: 50,
        coordinates: [
          { x: 1, y: 1 },
          { x: 2, y: 1 },
        ],
      },
    ]),
  );
}

function runToTerminal(engine: SimulationEngine, limit = 500): number {
  let ticks = 0;
  while (engine.terminalReason === null && ticks < limit) {
    engine.stepTick();
    ticks += 1;
  }
  return ticks;
}

describe("incremental pedigree verification", () => {
  it("reaches a terminal state with invariants asserted on every tick", () => {
    const engine = twoAncestorEngine();
    const ticks = runToTerminal(engine);
    expect(ticks).toBeGreaterThan(0);
    // A terminal state forces the full scan, including the independent recount of dead records
    // against the cumulative death counters.
    expect(engine.terminalReason).not.toBeNull();
    expect(() => engine.assertInvariants()).not.toThrow();
  });

  it("produces an identical state hash to the same run under repeated full assertions", () => {
    const incremental = twoAncestorEngine();
    runToTerminal(incremental);

    // Asserting again on every tick of a second engine exercises the assertion path far more
    // often. If incremental verification changed any state, the hashes would diverge.
    const repeated = twoAncestorEngine();
    let ticks = 0;
    while (repeated.terminalReason === null && ticks < 500) {
      repeated.stepTick();
      repeated.assertInvariants();
      repeated.assertInvariants();
      ticks += 1;
    }

    expect(repeated.stateHash()).toBe(incremental.stateHash());
  });

  it("keeps the pedigree registry complete and contiguous across many births", () => {
    const engine = twoAncestorEngine();
    runToTerminal(engine);
    const records = engine.lineageRecords();

    // The property the removed rescan existed to protect, checked here over the whole registry.
    records.forEach((record, index) => {
      expect(record.organism_id).toBe(index);
      expect(record.birth_tick).toBeLessThanOrEqual(engine.completedTick);
      expect(record.death_tick === null).toBe(record.death_cause === null);
    });

    const deaths = records.filter((record) => record.death_tick !== null).length;
    const counters = engine.countersSnapshot();
    expect(deaths).toBe(
      counters.deaths_exogenous + counters.deaths_energy + counters.deaths_exploitation,
    );
  });
});
