import { describe, expect, it } from "vitest";

import { Lineage } from "../src/domain/organism.js";
import { SimulationEngine } from "../src/engine/simulation.js";
import { Opcode } from "../src/vm/opcodes.js";
import { fixedFixture, lifecycleConfig } from "./helpers/lifecycle-fixture.js";

describe("deterministic integrated ecology", () => {
  it("preserves accounting and state equality through a mutation/HGT stress trajectory", () => {
    const configuration = lifecycleConfig();
    configuration.duration = {
      completed_ticks: 100,
      sample_every_ticks: 10,
      checkpoint_every_ticks: null,
      state_hash_every_ticks: 10,
    };
    configuration.world.width = 7;
    configuration.world.height = 7;
    configuration.world.exogenous_death_probability = { numerator: 1, denominator: 500 };
    configuration.energy.environmental_income = 5;
    configuration.energy.maximum_organism_energy = 1_000;
    configuration.energy.base_instruction_cost = 1;
    configuration.energy.genome_maintenance = {
      rule: "linear_floor",
      numerator: 1,
      denominator: 8,
    };
    configuration.energy.autonomous_reproduction_cost = 10;
    configuration.energy.offspring_endowment = 20;
    configuration.energy.exec_nbr_attempt_cost = 1;
    configuration.energy.exploit_levy = 5;
    configuration.energy.splice_attempt_cost = 1;
    configuration.energy.splice_success_cost = 2;
    configuration.reproduction.cooldown_ticks = 3;
    configuration.reproduction.max_genome_length = 32;
    configuration.reproduction.mutation_probability = { numerator: 1, denominator: 20 };
    configuration.reproduction.mutation_weights = { point: 6, insertion: 2, deletion: 2 };
    configuration.hgt.success_probability = { numerator: 1, denominator: 2 };
    configuration.hgt.min_chunk_length = 1;
    configuration.hgt.max_chunk_length = 3;
    configuration.measurement.bucket_count = 5;
    configuration.measurement.bucket_length_ticks = 10;

    const fixture = fixedFixture([
      {
        lineage: Lineage.Host,
        genome: [Opcode.COPY, Opcode.SPLICE, Opcode.NOP],
        initial_energy: 200,
        coordinates: [
          { x: 3, y: 3 },
          { x: 3, y: 4 },
          { x: 4, y: 3 },
        ],
      },
      {
        lineage: Lineage.Parasite,
        genome: [Opcode.EXEC_NBR, Opcode.SPLICE, Opcode.NOP],
        initial_energy: 200,
        coordinates: [
          { x: 3, y: 2 },
          { x: 2, y: 3 },
        ],
      },
    ]);

    const first = SimulationEngine.create(configuration, fixture);
    const second = SimulationEngine.create(configuration, fixture);
    const firstReports = first.runUntilTerminated();
    const secondReports = second.runUntilTerminated();

    expect(firstReports).toEqual(secondReports);
    expect(first.prngState).toEqual(second.prngState);
    expect(first.countersSnapshot()).toEqual(second.countersSnapshot());
    expect(first.organismIds()).toEqual(second.organismIds());
    for (const organismId of first.organismIds()) {
      expect(first.organismSnapshot(organismId)).toEqual(second.organismSnapshot(organismId));
    }

    const counters = first.countersSnapshot();
    expect(counters.activations).toBeGreaterThan(0);
    expect(counters.births).toBeGreaterThan(0);
    expect(counters.autonomous_attempts + counters.exploitative_attempts).toBeGreaterThan(0);
    expect(counters.hgt_attempts).toBeGreaterThan(0);
    first.assertInvariants();
  });
});
