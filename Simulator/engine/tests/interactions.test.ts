import { describe, expect, it } from "vitest";

import { DeathCause, EcologicalResultCode, MutationClass } from "../src/domain/events.js";
import { Lineage } from "../src/domain/organism.js";
import { SimulationEngine } from "../src/engine/simulation.js";
import { Opcode } from "../src/vm/opcodes.js";
import { fixedFixture, lifecycleConfig } from "./helpers/lifecycle-fixture.js";

describe("costly exploitative reproduction", () => {
  it("creates the caller's child using donor energy and kills an exhausted donor", () => {
    const configuration = lifecycleConfig();
    configuration.energy.autonomous_reproduction_cost = 1_000;
    const engine = SimulationEngine.create(
      configuration,
      fixedFixture([
        {
          lineage: Lineage.Parasite,
          genome: [Opcode.EXEC_NBR],
          initial_energy: 50,
          coordinates: [{ x: 2, y: 2 }],
        },
        {
          lineage: Lineage.Host,
          genome: [Opcode.COPY],
          initial_energy: 30,
          coordinates: [{ x: 2, y: 1 }],
        },
      ]),
    );

    const report = engine.stepTick();
    const caller = engine.organismSnapshot(0);
    const child = engine.organismSnapshot(2);

    expect(engine.organismSnapshot(1)).toBeNull();
    expect(caller).toMatchObject({ energy: 45, reproduction_cooldown: 2 });
    expect(child).toMatchObject({
      parent_id: 0,
      lineage: Lineage.Parasite,
      genome: [Opcode.EXEC_NBR],
      energy: 20,
      coordinate: { x: 3, y: 2 },
    });
    expect(engine.countersSnapshot()).toMatchObject({
      births: 1,
      exploitative_attempts: 1,
      exploitative_successes: 1,
      energy_transferred: 20,
      energy_dissipated: 15,
      deaths_exploitation: 1,
    });
    expect(report.events).toContainEqual(
      expect.objectContaining({
        type: "death",
        organism_id: 1,
        cause: DeathCause.Exploitation,
      }),
    );
    expect(report.events).toContainEqual(
      expect.objectContaining({
        type: "ecological_attempt",
        operation: "exec_nbr",
        result: EcologicalResultCode.Success,
        donor_id: 1,
        child_id: 2,
      }),
    );

    const callerBucket = caller?.behaviour_buckets.find((bucket) => bucket.bucket_number === 0);
    expect(callerBucket).toMatchObject({
      exploitative_attempts: 1,
      exploitative_successes: 1,
      exploit_energy_obtained: 20,
    });
  });

  it("records no-neighbour and donor-locus failures after paying the attempt cost", () => {
    const noNeighbour = SimulationEngine.create(
      lifecycleConfig(),
      fixedFixture([
        {
          lineage: Lineage.Parasite,
          genome: [Opcode.EXEC_NBR],
          initial_energy: 50,
          coordinates: [{ x: 2, y: 2 }],
        },
      ]),
    );
    const noNeighbourReport = noNeighbour.stepTick();
    expect(noNeighbour.organismSnapshot(0)?.energy).toBe(45);
    expect(noNeighbourReport.events).toContainEqual(
      expect.objectContaining({ result: EcologicalResultCode.NoNeighbour }),
    );

    const wrongLocus = SimulationEngine.create(
      lifecycleConfig(),
      fixedFixture([
        {
          lineage: Lineage.Parasite,
          genome: [Opcode.EXEC_NBR],
          initial_energy: 50,
          coordinates: [{ x: 2, y: 2 }],
        },
        {
          lineage: Lineage.Host,
          genome: [Opcode.NOP],
          initial_energy: 50,
          coordinates: [{ x: 2, y: 1 }],
        },
      ]),
    );
    const wrongLocusReport = wrongLocus.stepTick();
    expect(wrongLocusReport.events).toContainEqual(
      expect.objectContaining({
        operation: "exec_nbr",
        result: EcologicalResultCode.DonorLocusNotCopy,
        donor_id: 1,
      }),
    );
    expect(wrongLocus.countersSnapshot().exploitative_successes).toBe(0);
  });

  it("controls exact donor addressing against deterministic cyclic COPY search", () => {
    const fixture = fixedFixture([
      {
        lineage: Lineage.Parasite,
        genome: [Opcode.EXEC_NBR],
        initial_energy: 50,
        coordinates: [{ x: 2, y: 2 }],
      },
      {
        lineage: Lineage.Host,
        genome: [Opcode.NOP, Opcode.COPY],
        initial_energy: 50,
        coordinates: [{ x: 2, y: 1 }],
      },
    ]);
    const addressedConfiguration = lifecycleConfig();
    addressedConfiguration.energy.autonomous_reproduction_cost = 1_000;
    addressedConfiguration.identity.schema_version = "0.3.0";
    addressedConfiguration.exploitation = { donor_copy_rule: "addressed_locus" };
    const addressed = SimulationEngine.create(addressedConfiguration, fixture);
    expect(addressed.stepTick().events).toContainEqual(
      expect.objectContaining({
        organism_id: 0,
        operation: "exec_nbr",
        result: EcologicalResultCode.DonorLocusNotCopy,
        donor_id: 1,
      }),
    );

    const searchConfiguration = lifecycleConfig();
    searchConfiguration.energy.autonomous_reproduction_cost = 1_000;
    searchConfiguration.identity.schema_version = "0.3.0";
    searchConfiguration.exploitation = { donor_copy_rule: "cyclic_copy_search" };
    const search = SimulationEngine.create(searchConfiguration, fixture);
    expect(search.stepTick().events).toContainEqual(
      expect.objectContaining({
        organism_id: 0,
        operation: "exec_nbr",
        result: EcologicalResultCode.Success,
        donor_id: 1,
        child_id: 2,
      }),
    );
    expect(search.organismSnapshot(2)).toMatchObject({
      parent_id: 0,
      lineage: Lineage.Parasite,
    });

    const absent = SimulationEngine.create(
      searchConfiguration,
      fixedFixture([
        {
          lineage: Lineage.Parasite,
          genome: [Opcode.EXEC_NBR],
          initial_energy: 50,
          coordinates: [{ x: 2, y: 2 }],
        },
        {
          lineage: Lineage.Host,
          genome: [Opcode.NOP, Opcode.XOR],
          initial_energy: 50,
          coordinates: [{ x: 2, y: 1 }],
        },
      ]),
    );
    expect(absent.stepTick().events).toContainEqual(
      expect.objectContaining({
        organism_id: 0,
        operation: "exec_nbr",
        result: EcologicalResultCode.DonorCopyAbsent,
        donor_id: 1,
      }),
    );
  });

  it("finds the first occupied cardinal donor from the register-selected orientation", () => {
    const configuration = lifecycleConfig();
    configuration.energy.autonomous_reproduction_cost = 1_000;
    const engine = SimulationEngine.create(
      configuration,
      fixedFixture([
        {
          lineage: Lineage.Parasite,
          genome: [Opcode.EXEC_NBR],
          initial_energy: 50,
          coordinates: [{ x: 2, y: 2 }],
        },
        {
          lineage: Lineage.Host,
          genome: [Opcode.COPY],
          initial_energy: 50,
          coordinates: [{ x: 3, y: 2 }],
        },
      ]),
    );

    const report = engine.stepTick();
    expect(report.events).toContainEqual(
      expect.objectContaining({
        organism_id: 0,
        operation: "exec_nbr",
        result: EcologicalResultCode.Success,
        donor_id: 1,
      }),
    );
    expect(engine.organismSnapshot(2)?.coordinate).toEqual({ x: 2, y: 3 });
  });

  it("rejects a donor that cannot fully fund endowment plus levy", () => {
    const configuration = lifecycleConfig();
    configuration.energy.autonomous_reproduction_cost = 1_000;
    const engine = SimulationEngine.create(
      configuration,
      fixedFixture([
        {
          lineage: Lineage.Parasite,
          genome: [Opcode.EXEC_NBR],
          initial_energy: 50,
          coordinates: [{ x: 2, y: 2 }],
        },
        {
          lineage: Lineage.Host,
          genome: [Opcode.COPY],
          initial_energy: 29,
          coordinates: [{ x: 2, y: 1 }],
        },
      ]),
    );

    const report = engine.stepTick();
    expect(report.events).toContainEqual(
      expect.objectContaining({
        operation: "exec_nbr",
        result: EcologicalResultCode.InsufficientDonorEnergy,
      }),
    );
    expect(engine.populationSize).toBe(2);
    expect(engine.countersSnapshot().energy_transferred).toBe(0);
  });

  it("requires an empty caller destination after identifying a valid donor", () => {
    const configuration = lifecycleConfig();
    configuration.energy.autonomous_reproduction_cost = 1_000;
    const engine = SimulationEngine.create(
      configuration,
      fixedFixture([
        {
          lineage: Lineage.Parasite,
          genome: [Opcode.EXEC_NBR],
          initial_energy: 50,
          coordinates: [{ x: 2, y: 2 }],
        },
        {
          lineage: Lineage.Host,
          genome: [Opcode.COPY],
          initial_energy: 50,
          coordinates: [{ x: 2, y: 1 }],
        },
        {
          lineage: Lineage.Host,
          genome: [Opcode.NOP],
          initial_energy: 50,
          coordinates: [
            { x: 3, y: 2 },
            { x: 2, y: 3 },
            { x: 1, y: 2 },
          ],
        },
      ]),
    );

    const report = engine.stepTick();
    expect(report.events).toContainEqual(
      expect.objectContaining({
        organism_id: 0,
        operation: "exec_nbr",
        result: EcologicalResultCode.NoEmptyCell,
        donor_id: 1,
      }),
    );
    expect(engine.countersSnapshot().exploitative_successes).toBe(0);
  });

  it("terminates an exploit attempt when its mandatory cost exhausts the caller", () => {
    const engine = SimulationEngine.create(
      lifecycleConfig(),
      fixedFixture([
        {
          lineage: Lineage.Parasite,
          genome: [Opcode.EXEC_NBR],
          initial_energy: 5,
          coordinates: [{ x: 2, y: 2 }],
        },
      ]),
    );

    const report = engine.stepTick();
    expect(report.events).toContainEqual(
      expect.objectContaining({
        operation: "exec_nbr",
        result: EcologicalResultCode.InsufficientCallerEnergy,
      }),
    );
    expect(report.events).toContainEqual(
      expect.objectContaining({ type: "death", cause: DeathCause.Energy }),
    );
    expect(report.terminal_reason).toBe("extinction");
  });
});

describe("horizontal transfer", () => {
  it("inserts a circular donor chunk without changing donor or lineage", () => {
    const configuration = lifecycleConfig();
    configuration.hgt.min_chunk_length = 2;
    configuration.hgt.max_chunk_length = 2;
    const originalCallerGenome: number[] = [Opcode.SPLICE, Opcode.NOP];
    const donorGenome: number[] = [Opcode.AND, Opcode.XOR, Opcode.COPY];
    const engine = SimulationEngine.create(
      configuration,
      fixedFixture([
        {
          lineage: Lineage.Parasite,
          genome: originalCallerGenome,
          initial_energy: 50,
          coordinates: [{ x: 2, y: 2 }],
        },
        {
          lineage: Lineage.Host,
          genome: donorGenome,
          initial_energy: 50,
          coordinates: [{ x: 2, y: 1 }],
        },
      ]),
    );

    const report = engine.stepTick();
    const transfer = report.events.find((event) => event.type === "hgt_transfer");
    expect(transfer?.type).toBe("hgt_transfer");
    if (transfer?.type !== "hgt_transfer") {
      throw new Error("Expected an HGT transfer event.");
    }
    const expectedGenome = [...originalCallerGenome];
    expectedGenome.splice(transfer.insertion_boundary, 0, ...transfer.chunk);

    const caller = engine.organismSnapshot(0);
    expect(caller?.genome).toEqual(expectedGenome);
    expect(caller?.lineage).toBe(Lineage.Parasite);
    expect(caller?.energy).toBe(45);
    expect(caller?.vm.instruction_pointer).toBe(
      transfer.insertion_boundary <= 1 ? 1 + transfer.chunk.length : 1,
    );
    expect(engine.organismSnapshot(1)?.genome).toEqual(donorGenome);
    expect(engine.countersSnapshot()).toMatchObject({
      hgt_attempts: 1,
      hgt_successes: 1,
      energy_dissipated: 5,
    });
  });

  it("distinguishes trial, capacity, and success-cost failures", () => {
    const fixture = fixedFixture([
      {
        lineage: Lineage.Parasite,
        genome: [Opcode.SPLICE, Opcode.NOP],
        initial_energy: 50,
        coordinates: [{ x: 2, y: 2 }],
      },
      {
        lineage: Lineage.Host,
        genome: [Opcode.AND],
        initial_energy: 50,
        coordinates: [{ x: 2, y: 1 }],
      },
    ]);

    const failedTrialConfig = lifecycleConfig();
    failedTrialConfig.hgt.success_probability = { numerator: 0, denominator: 1 };
    const failedTrial = SimulationEngine.create(failedTrialConfig, fixture);
    expect(failedTrial.stepTick().events).toContainEqual(
      expect.objectContaining({ result: EcologicalResultCode.HgtTrialFailed }),
    );

    const capacityConfig = lifecycleConfig();
    capacityConfig.reproduction.max_genome_length = 2;
    const capacity = SimulationEngine.create(capacityConfig, fixture);
    expect(capacity.stepTick().events).toContainEqual(
      expect.objectContaining({ result: EcologicalResultCode.GenomeCapacity }),
    );
    expect(capacity.organismSnapshot(0)?.energy).toBe(48);

    const energyConfig = lifecycleConfig();
    const lowEnergyFixture = fixedFixture([
      {
        lineage: Lineage.Parasite,
        genome: [Opcode.SPLICE, Opcode.NOP],
        initial_energy: 4,
        coordinates: [{ x: 2, y: 2 }],
      },
      {
        lineage: Lineage.Host,
        genome: [Opcode.AND],
        initial_energy: 50,
        coordinates: [{ x: 2, y: 1 }],
      },
    ]);
    const lowEnergy = SimulationEngine.create(energyConfig, lowEnergyFixture);
    expect(lowEnergy.stepTick().events).toContainEqual(
      expect.objectContaining({ result: EcologicalResultCode.InsufficientCallerEnergy }),
    );
    expect(lowEnergy.organismSnapshot(0)?.energy).toBe(2);
  });
});

describe("mutation and computation integration", () => {
  it("birth-mutates only the child and audits accepted and rejected deletions", () => {
    const configuration = lifecycleConfig();
    configuration.reproduction.mutation_probability = { numerator: 1, denominator: 1 };
    configuration.reproduction.mutation_weights = { point: 0, insertion: 0, deletion: 1 };
    configuration.reproduction.min_genome_length = 1;
    const engine = SimulationEngine.create(
      configuration,
      fixedFixture([
        {
          lineage: Lineage.Host,
          genome: [Opcode.COPY, Opcode.NOP],
          initial_energy: 100,
          coordinates: [{ x: 2, y: 2 }],
        },
      ]),
    );

    const report = engine.stepTick();
    expect(engine.organismSnapshot(0)?.genome).toEqual([Opcode.COPY, Opcode.NOP]);
    expect(engine.organismSnapshot(1)?.genome).toEqual([Opcode.NOP]);
    expect(engine.countersSnapshot()).toMatchObject({
      mutation_attempted: { deletion: 2 },
      mutation_accepted: { deletion: 1 },
      mutation_rejected: { deletion: 1 },
    });
    expect(report.events.filter((event) => event.type === "mutation")).toMatchObject([
      { mutation_class: MutationClass.Deletion, accepted: true },
      {
        mutation_class: MutationClass.Deletion,
        accepted: false,
        result: EcologicalResultCode.GenomeMinimum,
      },
    ]);
  });

  it("credits a validated OUTPUT reward before normal instruction costs", () => {
    const configuration = lifecycleConfig();
    configuration.duration.completed_ticks = 4;
    const engine = SimulationEngine.create(
      configuration,
      fixedFixture([
        {
          lineage: Lineage.Host,
          genome: [Opcode.INPUT_A, Opcode.INPUT_B, Opcode.AND, Opcode.OUTPUT],
          initial_energy: 50,
          coordinates: [{ x: 2, y: 2 }],
        },
      ]),
    );

    const reports = engine.runUntilTerminated();
    expect(engine.organismSnapshot(0)?.energy).toBe(61);
    expect(engine.countersSnapshot()).toMatchObject({
      computation_rewards: 1,
      energy_created: 11,
    });
    expect(reports[3]?.events).toContainEqual(
      expect.objectContaining({
        type: "computation_reward",
        operation: "and",
        requested_energy: 11,
        credited_energy: 11,
      }),
    );
  });
});
