import { describe, expect, it } from "vitest";

import { createBehaviourWindow, Lineage, type OrganismState } from "../src/domain/organism.js";
import { measureSpatialStructure } from "../src/measurement/spatial.js";
import { createVmState } from "../src/vm/machine.js";
import { Opcode } from "../src/vm/opcodes.js";

function organism(
  id: number,
  lineage: OrganismState["lineage"],
  x: number,
  y: number,
): OrganismState {
  return {
    id,
    parent_id: null,
    lineage,
    generation: 0,
    coordinate: { x, y },
    genome: [Opcode.NOP],
    vm: createVmState({ id, input_a: 1, input_b: 2 }),
    energy: 1,
    age_ticks: 0,
    reproduction_cooldown: 0,
    behaviour_buckets: createBehaviourWindow(1),
  };
}

describe("spatial patch measurement", () => {
  it("counts unique contacts, boundaries, and lineage-connected components", () => {
    const measurement = measureSpatialStructure(
      [
        organism(0, Lineage.Host, 0, 0),
        organism(1, Lineage.Host, 1, 0),
        organism(2, Lineage.Parasite, 2, 0),
      ],
      4,
      4,
    );

    expect(measurement).toMatchObject({
      occupied_occupied_edges: 2,
      same_lineage_edges: 1,
      host_host_edges: 1,
      parasite_parasite_edges: 0,
      host_parasite_contact_edges: 1,
      occupied_empty_boundary_edges: 8,
      same_lineage_edge_proportion: 0.5,
      host: {
        population: 2,
        patch_count: 1,
        largest_patch_size: 2,
        largest_patch_proportion: 1,
      },
      parasite: {
        population: 1,
        patch_count: 1,
        singleton_patch_count: 1,
      },
    });
  });

  it("handles extinction without inventing patches or proportions", () => {
    expect(measureSpatialStructure([], 4, 4)).toMatchObject({
      occupied_occupied_edges: 0,
      same_lineage_edge_proportion: null,
      host: { population: 0, patch_count: 0, largest_patch_proportion: null },
      parasite: { population: 0, patch_count: 0, largest_patch_proportion: null },
    });
  });

  it("rejects duplicate coordinates instead of silently merging organisms", () => {
    expect(() =>
      measureSpatialStructure(
        [organism(0, Lineage.Host, 1, 1), organism(1, Lineage.Parasite, 1, 1)],
        4,
        4,
      ),
    ).toThrow(/duplicate organism coordinates/i);
  });
});
