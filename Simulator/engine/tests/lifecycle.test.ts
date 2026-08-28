import { describe, expect, it } from "vitest";

import { DeathCause, EcologicalResultCode, EnergyEventKind } from "../src/domain/events.js";
import { Lineage } from "../src/domain/organism.js";
import { SimulationEngine } from "../src/engine/simulation.js";
import { Opcode } from "../src/vm/opcodes.js";
import { fixedFixture, lifecycleConfig } from "./helpers/lifecycle-fixture.js";

describe("initial state and seeded scheduling", () => {
  it("materialises fixed ancestors in fixture order with monotonic identifiers", () => {
    const engine = SimulationEngine.create(
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
        {
          lineage: Lineage.Parasite,
          genome: [Opcode.SPLICE],
          initial_energy: 40,
          coordinates: [{ x: 3, y: 1 }],
        },
      ]),
    );

    expect(engine.organismIds()).toEqual([0, 1, 2]);
    expect(engine.organismSnapshot(0)).toMatchObject({
      id: 0,
      parent_id: null,
      lineage: Lineage.Host,
      generation: 0,
      coordinate: { x: 1, y: 1 },
      age_ticks: 0,
    });
    expect(engine.organismSnapshot(2)).toMatchObject({
      lineage: Lineage.Parasite,
      coordinate: { x: 3, y: 1 },
    });
    expect(engine.countersSnapshot().initial_energy).toBe(140);
    expect(engine.lineageOf(0)).toBe(Lineage.Host);
    expect(engine.lineageOf(2)).toBe(Lineage.Parasite);
    expect(engine.lineageOf(999)).toBeNull();
    expect(Object.isFrozen(engine.organismSnapshot(0))).toBe(true);
  });

  it("produces identical activation orders and states from identical inputs", () => {
    const configuration = lifecycleConfig();
    configuration.duration.completed_ticks = 5;
    const fixture = fixedFixture([
      {
        lineage: Lineage.Host,
        genome: [Opcode.NOP],
        initial_energy: 50,
        coordinates: [
          { x: 1, y: 1 },
          { x: 2, y: 1 },
          { x: 3, y: 1 },
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
    expect(firstReports.map((report) => report.activation_order)).toEqual([
      [0, 2, 1],
      [2, 0, 1],
      [2, 1, 0],
      [2, 1, 0],
      [1, 0, 2],
    ]);
    expect(first.terminalReason).toBe("completed");
    expect(() => first.stepTick()).toThrow(/terminated run/i);
  });

  it("returns frozen tick reports without exposing mutable engine state", () => {
    const engine = SimulationEngine.create(
      lifecycleConfig(),
      fixedFixture([
        {
          lineage: Lineage.Host,
          genome: [Opcode.NOP],
          initial_energy: 50,
          coordinates: [{ x: 1, y: 1 }],
        },
      ]),
    );

    const report = engine.stepTick();
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.activation_order)).toBe(true);
    expect(Object.isFrozen(report.events)).toBe(true);
    expect(report.events.every((event) => Object.isFrozen(event))).toBe(true);
    expect(() => {
      (report.events[0] as { tick: number }).tick = 999;
    }).toThrow();
    expect(engine.completedTick).toBe(1);
  });

  it("places shuffled ancestors deterministically without accepting coordinates", () => {
    const configuration = lifecycleConfig();
    configuration.initial_population.placement_algorithm = "shuffled_cells";
    const fixture = {
      schema_version: "0.1.0",
      fixture_id: "shuffled",
      ancestors: [
        {
          lineage: Lineage.Host,
          genome: [Opcode.NOP],
          count: 2,
          initial_energy: 50,
        },
      ],
    } as const;
    const first = SimulationEngine.create(configuration, fixture);
    const second = SimulationEngine.create(configuration, fixture);

    expect(first.organismSnapshot(0)?.coordinate).toEqual(second.organismSnapshot(0)?.coordinate);
    expect(first.organismSnapshot(1)?.coordinate).toEqual(second.organismSnapshot(1)?.coordinate);
    expect(first.prngState).toEqual(second.prngState);
  });

  it("places a seeded focal ancestor group inside its declared local region", () => {
    const configuration = lifecycleConfig();
    configuration.identity.schema_version = "0.2.0";
    configuration.world.width = 8;
    configuration.world.height = 8;
    configuration.initial_population.placement_algorithm = "seeded_focal_region";
    const fixture = {
      schema_version: "0.2.0",
      fixture_id: "focal-region-validation",
      focal_region: {
        focal_ancestor_index: 1,
        origin: { x: 2, y: 2 },
        width: 4,
        height: 4,
      },
      ancestors: [
        {
          lineage: Lineage.Host,
          genome: [Opcode.NOP],
          count: 12,
          initial_energy: 50,
        },
        {
          lineage: Lineage.Parasite,
          genome: [Opcode.EXEC_NBR],
          count: 8,
          initial_energy: 50,
        },
      ],
    } as const;
    const first = SimulationEngine.create(configuration, fixture);
    const second = SimulationEngine.create(configuration, fixture);

    expect(first.stateHash()).toBe(second.stateHash());
    expect(first.prngState).toEqual(second.prngState);
    for (const organismId of first.organismIds().slice(12)) {
      const coordinate = first.organismSnapshot(organismId)?.coordinate;
      expect(coordinate?.x).toBeGreaterThanOrEqual(2);
      expect(coordinate?.x).toBeLessThan(6);
      expect(coordinate?.y).toBeGreaterThanOrEqual(2);
      expect(coordinate?.y).toBeLessThan(6);
    }
    expect(new Set(first.organismIds().map((id) => {
      const coordinate = first.organismSnapshot(id)?.coordinate;
      return `${coordinate?.x},${coordinate?.y}`;
    })).size).toBe(20);
  });

  it("rejects seed fixtures that conflict with placement or genome bounds", () => {
    const shuffled = lifecycleConfig();
    shuffled.initial_population.placement_algorithm = "shuffled_cells";
    expect(() =>
      SimulationEngine.create(
        shuffled,
        fixedFixture([
          {
            lineage: Lineage.Host,
            genome: [Opcode.NOP],
            initial_energy: 50,
            coordinates: [{ x: 1, y: 1 }],
          },
        ]),
      ),
    ).toThrow(/must not provide coordinates/i);

    const bounded = lifecycleConfig();
    bounded.reproduction.min_genome_length = 2;
    expect(() =>
      SimulationEngine.create(
        bounded,
        fixedFixture([
          {
            lineage: Lineage.Host,
            genome: [Opcode.NOP],
            initial_energy: 50,
            coordinates: [{ x: 1, y: 1 }],
          },
        ]),
      ),
    ).toThrow(/genome length is outside configured bounds/i);

    const focal = lifecycleConfig();
    focal.identity.schema_version = "0.2.0";
    focal.initial_population.placement_algorithm = "seeded_focal_region";
    expect(() =>
      SimulationEngine.create(focal, {
        schema_version: "0.2.0",
        fixture_id: "oversized-focal-region",
        focal_region: {
          focal_ancestor_index: 0,
          origin: { x: 0, y: 0 },
          width: 2,
          height: 2,
        },
        ancestors: [
          {
            lineage: Lineage.Parasite,
            genome: [Opcode.EXEC_NBR],
            count: 5,
            initial_energy: 50,
          },
        ],
      }),
    ).toThrow(/exceeds focal-region capacity/i);
  });
});

describe("tick energy lifecycle and death", () => {
  it("caps environmental income and charges base plus maintenance costs", () => {
    const configuration = lifecycleConfig();
    configuration.energy.maximum_organism_energy = 100;
    configuration.energy.environmental_income = 10;
    configuration.energy.base_instruction_cost = 3;
    configuration.energy.genome_maintenance = {
      rule: "linear_floor",
      numerator: 2,
      denominator: 1,
    };
    const engine = SimulationEngine.create(
      configuration,
      fixedFixture([
        {
          lineage: Lineage.Host,
          genome: [Opcode.NOP],
          initial_energy: 95,
          coordinates: [{ x: 2, y: 2 }],
        },
      ]),
    );

    const report = engine.stepTick();
    expect(engine.organismSnapshot(0)?.energy).toBe(95);
    expect(engine.organismSnapshot(0)?.age_ticks).toBe(1);
    expect(engine.countersSnapshot()).toMatchObject({
      energy_created: 5,
      energy_dissipated: 5,
      energy_discarded: 0,
    });
    expect(report.events.filter((event) => event.type === "energy")).toMatchObject([
      { kind: EnergyEventKind.EnvironmentalIncome, amount: 5 },
      { kind: EnergyEventKind.BaseExecutionCost, amount: 3 },
      { kind: EnergyEventKind.GenomeMaintenanceCost, amount: 2 },
    ]);
  });

  it("applies exogenous death before income or activation and discards stored energy", () => {
    const configuration = lifecycleConfig();
    configuration.world.exogenous_death_probability = { numerator: 1, denominator: 1 };
    configuration.energy.environmental_income = 100;
    const engine = SimulationEngine.create(
      configuration,
      fixedFixture([
        {
          lineage: Lineage.Host,
          genome: [Opcode.NOP],
          initial_energy: 50,
          coordinates: [{ x: 2, y: 2 }],
        },
      ]),
    );

    const report = engine.stepTick();
    expect(report.terminal_reason).toBe("extinction");
    expect(report.events).toContainEqual({
      type: "death",
      tick: 1,
      organism_id: 0,
      cause: DeathCause.Exogenous,
      energy_discarded: 50,
    });
    expect(engine.countersSnapshot()).toMatchObject({
      activations: 0,
      energy_created: 0,
      energy_discarded: 50,
      deaths_exogenous: 1,
    });
  });

  it("uses saturating costs and records energy death at exactly zero", () => {
    const configuration = lifecycleConfig();
    configuration.energy.base_instruction_cost = 3;
    configuration.energy.genome_maintenance = {
      rule: "linear_floor",
      numerator: 1,
      denominator: 1,
    };
    const engine = SimulationEngine.create(
      configuration,
      fixedFixture([
        {
          lineage: Lineage.Host,
          genome: [Opcode.NOP, Opcode.NOP],
          initial_energy: 5,
          coordinates: [{ x: 2, y: 2 }],
        },
      ]),
    );

    const report = engine.stepTick();
    expect(report.terminal_reason).toBe("extinction");
    expect(engine.countersSnapshot()).toMatchObject({
      activations: 1,
      energy_dissipated: 5,
      energy_discarded: 0,
      deaths_energy: 1,
    });
  });

  it("enforces Decision 0015: short genomes (L <= 7) incur minimum 1 maintenance cost per activation", () => {
    const configuration = lifecycleConfig();
    configuration.energy.environmental_income = 0;
    configuration.energy.base_instruction_cost = 0;
    configuration.energy.genome_maintenance = {
      rule: "linear_floor",
      numerator: 1,
      denominator: 8,
    };
    const engine = SimulationEngine.create(
      configuration,
      fixedFixture([
        {
          lineage: Lineage.Host,
          genome: [Opcode.NOP, Opcode.NOP, Opcode.NOP, Opcode.NOP, Opcode.NOP, Opcode.NOP],
          initial_energy: 10,
          coordinates: [{ x: 2, y: 2 }],
        },
      ]),
    );

    engine.stepTick();
    expect(engine.organismSnapshot(0)?.energy).toBe(9);
    expect(engine.countersSnapshot().energy_dissipated).toBe(1);
  });

  it("enforces Decision 0015: long genomes (L >= 8) incur floor(L / k) maintenance cost per activation", () => {
    const configuration = lifecycleConfig();
    configuration.energy.environmental_income = 0;
    configuration.energy.base_instruction_cost = 0;
    configuration.energy.genome_maintenance = {
      rule: "linear_floor",
      numerator: 1,
      denominator: 8,
    };
    const engine = SimulationEngine.create(
      configuration,
      fixedFixture([
        {
          lineage: Lineage.Host,
          genome: new Array(16).fill(Opcode.NOP),
          initial_energy: 20,
          coordinates: [{ x: 2, y: 2 }],
        },
      ]),
    );

    engine.stepTick();
    expect(engine.organismSnapshot(0)?.energy).toBe(18);
    expect(engine.countersSnapshot().energy_dissipated).toBe(2);
  });
});

describe("autonomous reproduction", () => {
  it("creates a vertically inherited child that cannot activate in its birth tick", () => {
    const engine = SimulationEngine.create(
      lifecycleConfig(),
      fixedFixture([
        {
          lineage: Lineage.Host,
          genome: [Opcode.COPY],
          initial_energy: 100,
          coordinates: [{ x: 2, y: 2 }],
        },
      ]),
    );

    const report = engine.stepTick();
    const parent = engine.organismSnapshot(0);
    const child = engine.organismSnapshot(1);

    expect(report.activation_order).toEqual([0]);
    expect(report.population_size).toBe(2);
    expect(parent).toMatchObject({
      energy: 70,
      age_ticks: 1,
      reproduction_cooldown: 2,
    });
    expect(child).toMatchObject({
      parent_id: 0,
      lineage: Lineage.Host,
      generation: 1,
      coordinate: { x: 2, y: 1 },
      genome: [Opcode.COPY],
      energy: 20,
      age_ticks: 0,
    });
    expect(parent?.vm.task.id).toBe(1);
    expect(child?.vm.task.id).toBe(2);
    expect(engine.countersSnapshot()).toMatchObject({
      births: 1,
      autonomous_attempts: 1,
      autonomous_successes: 1,
      energy_transferred: 20,
      energy_dissipated: 10,
    });
    expect(report.events).toContainEqual(
      expect.objectContaining({
        type: "ecological_attempt",
        operation: "copy",
        result: EcologicalResultCode.Success,
        child_id: 1,
      }),
    );
  });

  it("applies cooldown before the next autonomous attempt", () => {
    const engine = SimulationEngine.create(
      lifecycleConfig(),
      fixedFixture([
        {
          lineage: Lineage.Host,
          genome: [Opcode.COPY],
          initial_energy: 100,
          coordinates: [{ x: 2, y: 2 }],
        },
      ]),
    );
    engine.stepTick();
    const second = engine.stepTick();

    expect(second.events).toContainEqual(
      expect.objectContaining({
        type: "ecological_attempt",
        organism_id: 0,
        operation: "copy",
        result: EcologicalResultCode.Cooldown,
      }),
    );
    expect(engine.countersSnapshot().autonomous_successes).toBe(1);
  });

  it("reports insufficient energy without creating or partially funding a child", () => {
    const engine = SimulationEngine.create(
      lifecycleConfig(),
      fixedFixture([
        {
          lineage: Lineage.Host,
          genome: [Opcode.COPY],
          initial_energy: 29,
          coordinates: [{ x: 2, y: 2 }],
        },
      ]),
    );

    const report = engine.stepTick();
    expect(report.population_size).toBe(1);
    expect(engine.organismSnapshot(0)?.energy).toBe(29);
    expect(report.events).toContainEqual(
      expect.objectContaining({
        type: "ecological_attempt",
        result: EcologicalResultCode.InsufficientCallerEnergy,
      }),
    );
  });

  it("reports no empty cell when all four cardinal destinations are occupied", () => {
    const engine = SimulationEngine.create(
      lifecycleConfig(),
      fixedFixture([
        {
          lineage: Lineage.Host,
          genome: [Opcode.COPY],
          initial_energy: 100,
          coordinates: [{ x: 2, y: 2 }],
        },
        {
          lineage: Lineage.Host,
          genome: [Opcode.NOP],
          initial_energy: 50,
          coordinates: [
            { x: 2, y: 1 },
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
        type: "ecological_attempt",
        organism_id: 0,
        operation: "copy",
        result: EcologicalResultCode.NoEmptyCell,
      }),
    );
    expect(engine.populationSize).toBe(5);
  });

  it("rotates bounded behavioural buckets by global tick", () => {
    const configuration = lifecycleConfig();
    configuration.duration.completed_ticks = 4;
    configuration.measurement.bucket_count = 2;
    const engine = SimulationEngine.create(
      configuration,
      fixedFixture([
        {
          lineage: Lineage.Host,
          genome: [Opcode.COPY],
          initial_energy: 29,
          coordinates: [{ x: 2, y: 2 }],
        },
      ]),
    );

    engine.stepTick();
    engine.stepTick();
    engine.stepTick();
    const buckets = engine.organismSnapshot(0)?.behaviour_buckets;

    expect(buckets?.map((bucket) => bucket.bucket_number)).toEqual([2, 1]);
    expect(buckets?.map((bucket) => bucket.autonomous_attempts)).toEqual([1, 1]);
  });
});
