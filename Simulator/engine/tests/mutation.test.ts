import { describe, expect, it } from "vitest";

import { parseEngineConfig } from "../src/config/schema.js";
import { EcologicalResultCode, MutationClass } from "../src/domain/events.js";
import { mutateCopiedGenome } from "../src/genome/mutation.js";
import { Xoshiro128StarStar } from "../src/random/prng.js";
import { lifecycleConfig } from "./helpers/lifecycle-fixture.js";

function reproductionWith(
  mutationClass: "point" | "insertion" | "deletion",
  minimum: number,
  maximum: number,
) {
  const configuration = lifecycleConfig();
  configuration.reproduction.min_genome_length = minimum;
  configuration.reproduction.max_genome_length = maximum;
  configuration.reproduction.mutation_probability = { numerator: 1, denominator: 1 };
  configuration.reproduction.mutation_weights = {
    point: mutationClass === "point" ? 1 : 0,
    insertion: mutationClass === "insertion" ? 1 : 0,
    deletion: mutationClass === "deletion" ? 1 : 0,
  };
  return parseEngineConfig(configuration).reproduction;
}

describe("stable birth-mutation traversal", () => {
  it("substitutes every selected point with a different valid opcode", () => {
    const parent = [0, 1, 2, 3, 15];
    const outcome = mutateCopiedGenome(
      parent,
      reproductionWith("point", 1, 16),
      new Xoshiro128StarStar(7),
    );

    expect(outcome.genome).toHaveLength(parent.length);
    expect(outcome.genome.every((opcode, index) => opcode !== parent[index])).toBe(true);
    expect(outcome.genome.every((opcode) => opcode >= 0 && opcode <= 15)).toBe(true);
    expect(outcome.records).toHaveLength(parent.length);
    expect(outcome.records.every((record) => record.accepted)).toBe(true);
  });

  it("inserts immediately after each original locus and never mutates inserted loci", () => {
    const outcome = mutateCopiedGenome(
      [1, 2],
      reproductionWith("insertion", 1, 8),
      new Xoshiro128StarStar(11),
    );

    expect(outcome.genome).toHaveLength(4);
    expect(outcome.genome[0]).toBe(1);
    expect(outcome.genome[2]).toBe(2);
    expect(outcome.records.map((record) => record.original_locus)).toEqual([0, 1]);
  });

  it("rejects insertions at the configured maximum without changing class", () => {
    const outcome = mutateCopiedGenome(
      [1, 2],
      reproductionWith("insertion", 1, 3),
      new Xoshiro128StarStar(11),
    );

    expect(outcome.genome).toHaveLength(3);
    expect(outcome.records).toMatchObject([
      { mutation_class: MutationClass.Insertion, accepted: true },
      {
        mutation_class: MutationClass.Insertion,
        accepted: false,
        result: EcologicalResultCode.GenomeCapacity,
      },
    ]);
  });

  it("processes original loci after deletions and rejects at the minimum", () => {
    const outcome = mutateCopiedGenome(
      [1, 2, 3],
      reproductionWith("deletion", 1, 8),
      new Xoshiro128StarStar(12),
    );

    expect(outcome.genome).toEqual([3]);
    expect(outcome.records).toMatchObject([
      { original_locus: 0, accepted: true, previous_opcode: 1 },
      { original_locus: 1, accepted: true, previous_opcode: 2 },
      {
        original_locus: 2,
        accepted: false,
        previous_opcode: 3,
        result: EcologicalResultCode.GenomeMinimum,
      },
    ]);
  });

  it("preserves the parent exactly when mutation probability is zero", () => {
    const configuration = parseEngineConfig(lifecycleConfig());
    const parent = [1, 2, 3];
    const outcome = mutateCopiedGenome(
      parent,
      configuration.reproduction,
      new Xoshiro128StarStar(99),
    );

    expect(outcome.genome).toEqual(parent);
    expect(outcome.genome).not.toBe(parent);
    expect(outcome.records).toEqual([]);
  });
});
