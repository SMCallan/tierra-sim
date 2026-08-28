import { z } from "zod";

import type { ImmutableEngineConfig } from "../config/schema.js";
import { Lineage } from "../domain/organism.js";
import { validateGenome } from "../vm/opcodes.js";

const coordinateSchema = z.strictObject({
  x: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  y: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});

const ancestorSchema = z.strictObject({
  lineage: z.enum([Lineage.Host, Lineage.Parasite]),
  genome: z.array(z.number().int().min(0).max(0xf)).min(1),
  count: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  initial_energy: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  coordinates: z.array(coordinateSchema).optional(),
});

const focalRegionSchema = z.strictObject({
  focal_ancestor_index: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  origin: coordinateSchema,
  width: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  height: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

export const ancestorFixtureSchema = z.strictObject({
  schema_version: z.enum(["0.1.0", "0.2.0"]),
  fixture_id: z.string().trim().min(1),
  ancestors: z.array(ancestorSchema).min(1),
  focal_region: focalRegionSchema.optional(),
});

export type AncestorFixture = z.infer<typeof ancestorFixtureSchema>;

export function parseAncestorFixture(
  input: unknown,
  configuration: ImmutableEngineConfig,
): AncestorFixture {
  const fixture = ancestorFixtureSchema.parse(input);
  let totalCount = 0;
  const fixedCoordinates = new Set<string>();

  fixture.ancestors.forEach((ancestor, index) => {
    validateGenome(ancestor.genome);
    if (
      ancestor.genome.length < configuration.reproduction.min_genome_length ||
      ancestor.genome.length > configuration.reproduction.max_genome_length
    ) {
      throw new RangeError(`Ancestor ${index} genome length is outside configured bounds.`);
    }
    if (ancestor.initial_energy > configuration.energy.maximum_organism_energy) {
      throw new RangeError(`Ancestor ${index} energy exceeds configured maximum.`);
    }
    if (!Number.isSafeInteger(totalCount + ancestor.count)) {
      throw new RangeError("Total ancestor count must be a safe integer.");
    }
    totalCount += ancestor.count;

    if (configuration.initial_population.placement_algorithm === "fixed") {
      if (ancestor.coordinates?.length !== ancestor.count) {
        throw new RangeError(
          `Ancestor ${index} must provide exactly one coordinate per organism under fixed placement.`,
        );
      }
      ancestor.coordinates.forEach((coordinate) => {
        if (coordinate.x >= configuration.world.width || coordinate.y >= configuration.world.height) {
          throw new RangeError(`Ancestor ${index} contains a coordinate outside the configured world.`);
        }
        const key = `${coordinate.x},${coordinate.y}`;
        if (fixedCoordinates.has(key)) {
          throw new RangeError(`Ancestor ${index} reuses an occupied fixed coordinate.`);
        }
        fixedCoordinates.add(key);
      });
    } else if (ancestor.coordinates !== undefined) {
      throw new RangeError(
        `Ancestor ${index} must not provide coordinates under ${configuration.initial_population.placement_algorithm} placement.`,
      );
    }
  });

  const worldCapacity = configuration.world.width * configuration.world.height;
  if (!Number.isSafeInteger(worldCapacity) || totalCount > worldCapacity) {
    throw new RangeError("Initial population exceeds world capacity.");
  }

  const placement = configuration.initial_population.placement_algorithm;
  if (placement === "seeded_focal_region") {
    if (fixture.schema_version !== "0.2.0" || fixture.focal_region === undefined) {
      throw new RangeError(
        "Seeded focal-region placement requires a schema 0.2.0 fixture with focal_region.",
      );
    }
    const region = fixture.focal_region;
    if (region.focal_ancestor_index >= fixture.ancestors.length) {
      throw new RangeError("Focal ancestor index is outside the fixture ancestor list.");
    }
    if (
      region.origin.x >= configuration.world.width ||
      region.origin.y >= configuration.world.height
    ) {
      throw new RangeError("Focal-region origin is outside the configured world.");
    }
    if (
      region.width > configuration.world.width ||
      region.height > configuration.world.height
    ) {
      throw new RangeError("Focal region cannot exceed the configured world dimensions.");
    }
    const focalAncestor = fixture.ancestors[region.focal_ancestor_index];
    if (focalAncestor === undefined || focalAncestor.count > region.width * region.height) {
      throw new RangeError("Focal ancestor count exceeds focal-region capacity.");
    }
  } else if (fixture.focal_region !== undefined) {
    throw new RangeError(`Fixture focal_region is invalid under ${placement} placement.`);
  }
  return fixture;
}
