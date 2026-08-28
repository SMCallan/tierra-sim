import { describe, expect, it } from "vitest";

import { sha256 } from "../src/hash/sha256.js";
import { SimulationEngine } from "../src/engine/simulation.js";
import { fixedFixture, lifecycleConfig } from "./helpers/lifecycle-fixture.js";
import { Lineage } from "../src/domain/organism.js";
import { Opcode } from "../src/vm/opcodes.js";

describe("browser-safe SHA-256", () => {
  it.each([
    ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
    ["hello", "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"],
  ])("matches the normative digest for %j", (input, expected) => {
    expect(sha256(input)).toBe(expected);
  });

  it("rejects a non-conformant injected runtime implementation", () => {
    expect(() =>
      SimulationEngine.create(
        lifecycleConfig(),
        fixedFixture([
          {
            lineage: Lineage.Host,
            genome: [Opcode.NOP],
            initial_energy: 50,
            coordinates: [{ x: 1, y: 1 }],
          },
        ]),
        { sha256: () => "0".repeat(64) },
      ),
    ).toThrow(/conformance vectors/u);
  });
});

describe("state-hash algorithm reporting", () => {
  it("reports the algorithm that stateHash actually used", () => {
    // Regression for D053. After Decision 0018 introduced the pedigree-digest algorithm,
    // stateHash() emitted v4 for every resource-bearing configuration while this getter still
    // returned v3. All sixty formal runs therefore recorded a manifest naming an algorithm that
    // did not produce their hashes. The hashes were correct; only the label was wrong — which is
    // worse than an absent label, because a reproduction attempt would compare against the wrong
    // baseline and misdiagnose the mismatch.
    const configuration = lifecycleConfig();
    configuration.identity.schema_version = "0.4.0";
    configuration.identity.engine_specification = "0.2";
    configuration.exploitation = { donor_copy_rule: "cyclic_copy_search" };
    configuration.resources = {
      mode: "local_renewable",
      cell_capacity: 4,
      initial_stock: 1,
      regeneration_per_tick: 1,
      harvest_per_activation: 1,
      harvest_neighbourhood_radius: 1,
      regeneration_timing: "before_scheduler_snapshot",
      harvest_timing: "after_exogenous_before_instruction",
    };
    const engine = SimulationEngine.create(
      configuration,
      fixedFixture([
        {
          lineage: Lineage.Host,
          genome: [Opcode.COPY, Opcode.NOP],
          initial_energy: 5,
          coordinates: [{ x: 1, y: 1 }],
        },
      ]),
    );
    engine.stepTick();

    expect(engine.stateHashAlgorithm).toBe("sha256/canonical-scientific-state-v4");
  });
});
