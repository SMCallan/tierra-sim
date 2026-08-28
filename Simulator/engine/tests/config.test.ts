import { describe, expect, it } from "vitest";

import { canonicalJson } from "../src/config/canonical-json.js";
import { parseEngineConfig } from "../src/config/schema.js";
import { validEngineConfig } from "./helpers/config-fixture.js";

describe("engine configuration", () => {
  it("parses a complete configuration and freezes the parsed copy", () => {
    const input = validEngineConfig();
    const parsed = parseEngineConfig(input);

    expect(parsed).toEqual(input);
    expect(parsed).not.toBe(input);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.energy)).toBe(true);
    expect(Object.isFrozen(parsed.measurement.sensitivity_thresholds)).toBe(true);
  });

  it("rejects unknown fields instead of accepting configuration drift", () => {
    const input = { ...validEngineConfig(), hidden_default: 42 };
    expect(() => parseEngineConfig(input)).toThrow(/unrecognized key/i);
  });

  it("enforces aligned sample, bucket, and state-hash intervals", () => {
    const input = validEngineConfig();
    input.duration.sample_every_ticks = 100;

    expect(() => parseEngineConfig(input)).toThrow(/sample interval must equal behavioural bucket/i);
  });

  it("rejects an invalid rational probability", () => {
    const input = validEngineConfig();
    input.reproduction.mutation_probability = { numerator: 2, denominator: 1 };

    expect(() => parseEngineConfig(input)).toThrow(/numerator must not exceed denominator/i);
  });

  it("caps mutation-class weight totals at the PRNG bounded-sampling range", () => {
    const input = validEngineConfig();
    input.reproduction.mutation_weights = {
      point: 0x1_0000_0000,
      insertion: 1,
      deletion: 0,
    };

    expect(() => parseEngineConfig(input)).toThrow(/weights must sum to at most 2\^32/i);
  });

  it("rejects overlapping functional-class boundaries without unsafe multiplication", () => {
    const input = validEngineConfig();
    input.measurement.functional_class_boundaries = {
      autonomous_max: { numerator: 4_294_967_295, denominator: 4_294_967_296 },
      exploitative_min: { numerator: 4_294_967_294, denominator: 4_294_967_295 },
    };

    expect(() => parseEngineConfig(input)).toThrow(/autonomous boundary must be below/i);
  });

  it("versions the seeded focal-region placement contract", () => {
    const input = validEngineConfig();
    input.initial_population.placement_algorithm = "seeded_focal_region";
    expect(() => parseEngineConfig(input)).toThrow(/requires configuration schema 0\.2\.0 or later/i);

    input.identity.schema_version = "0.2.0";
    expect(parseEngineConfig(input).initial_population.placement_algorithm).toBe(
      "seeded_focal_region",
    );
  });

  it("requires an explicit donor-COPY rule in schema 0.3.0 only", () => {
    const input = validEngineConfig();
    input.identity.schema_version = "0.3.0";
    expect(() => parseEngineConfig(input)).toThrow(/requires an explicit exploitation policy/i);

    input.exploitation = { donor_copy_rule: "cyclic_copy_search" };
    expect(parseEngineConfig(input).exploitation?.donor_copy_rule).toBe(
      "cyclic_copy_search",
    );

    input.identity.schema_version = "0.2.0";
    expect(() => parseEngineConfig(input)).toThrow(
      /explicit exploitation policy requires configuration schema 0\.3\.0/i,
    );
  });

  it("requires the governed local-resource contract in schema 0.4.0", () => {
    const input = validEngineConfig();
    input.identity.schema_version = "0.4.0";
    input.identity.engine_specification = "0.2";
    input.energy.environmental_income = 0;
    input.exploitation = { donor_copy_rule: "cyclic_copy_search" };
    expect(() => parseEngineConfig(input)).toThrow(/requires local renewable resources/i);

    input.resources = {
      mode: "local_renewable",
      cell_capacity: 20,
      initial_stock: 10,
      regeneration_per_tick: 2,
      harvest_per_activation: 4,
      regeneration_timing: "before_scheduler_snapshot",
      harvest_timing: "after_exogenous_before_instruction",
    };
    expect(parseEngineConfig(input).resources?.initial_stock).toBe(10);

    input.energy.environmental_income = 1;
    expect(() => parseEngineConfig(input)).toThrow(/passive environmental income/i);
    input.energy.environmental_income = 0;
    input.resources.initial_stock = 21;
    expect(() => parseEngineConfig(input)).toThrow(/initial_stock must not exceed/i);
  });
});

describe("canonical scientific JSON", () => {
  it("sorts object keys recursively and retains array order", () => {
    expect(canonicalJson({ z: 1, a: { y: 2, x: [3, 1] } })).toBe(
      '{"a":{"x":[3,1],"y":2},"z":1}',
    );
  });

  it("sorts numeric-looking and delimiter-containing keys lexicographically", () => {
    expect(
      canonicalJson({
        "2": 2,
        "10": 10,
        "a\u0000b": { c: 1 },
        a: { "b\u0000c": 2 },
      }),
    ).toBe('{"10":10,"2":2,"a":{"b\\u0000c":2},"a\\u0000b":{"c":1}}');
  });

  it("rejects floating-point and undefined values", () => {
    expect(() => canonicalJson({ value: 0.1 })).toThrow(/safe integers only/i);
    expect(() => canonicalJson({ value: undefined })).toThrow(/unsupported canonical JSON value/i);
  });

  it("produces identical output for differently ordered equivalent configs", () => {
    const configuration = validEngineConfig();
    const { seed, ...identityWithoutSeed } = configuration.identity;
    const reorderedIdentity = {
      seed,
      ...identityWithoutSeed,
    };

    expect(canonicalJson({ ...configuration, identity: reorderedIdentity })).toBe(
      canonicalJson(configuration),
    );
  });
});
