import { Lineage, type OrganismState } from "../domain/organism.js";
import {
  cardinalCoordinates,
  Direction,
  neighbourCoordinate,
  toCellIndex,
} from "../world/coordinates.js";

export interface LineagePatchSummary {
  readonly population: number;
  readonly patch_count: number;
  readonly largest_patch_size: number;
  readonly largest_patch_proportion: number | null;
  readonly mean_patch_size: number | null;
  readonly singleton_patch_count: number;
}

export interface SpatialStructureMeasurement {
  readonly adjacency_definition: "unique_toroidal_von_neumann_edges";
  readonly occupied_occupied_edges: number;
  readonly same_lineage_edges: number;
  readonly host_host_edges: number;
  readonly parasite_parasite_edges: number;
  readonly host_parasite_contact_edges: number;
  readonly occupied_empty_boundary_edges: number;
  readonly same_lineage_edge_proportion: number | null;
  readonly host: LineagePatchSummary;
  readonly parasite: LineagePatchSummary;
}

function patchSummary(
  lineage: OrganismState["lineage"],
  occupied: ReadonlyMap<number, OrganismState["lineage"]>,
  width: number,
  height: number,
): LineagePatchSummary {
  const lineageCells = new Set(
    [...occupied.entries()]
      .filter(([, cellLineage]) => cellLineage === lineage)
      .map(([cellIndex]) => cellIndex),
  );
  const visited = new Set<number>();
  const patchSizes: number[] = [];

  for (const start of [...lineageCells].sort((left, right) => left - right)) {
    if (visited.has(start)) continue;
    let size = 0;
    const pending = [start];
    visited.add(start);
    while (pending.length > 0) {
      const current = pending.pop();
      if (current === undefined) break;
      size += 1;
      const coordinate = { x: current % width, y: Math.floor(current / width) };
      for (const neighbour of cardinalCoordinates(coordinate, width, height)) {
        const neighbourIndex = toCellIndex(neighbour, width, height);
        if (lineageCells.has(neighbourIndex) && !visited.has(neighbourIndex)) {
          visited.add(neighbourIndex);
          pending.push(neighbourIndex);
        }
      }
    }
    patchSizes.push(size);
  }

  const population = lineageCells.size;
  const largest = patchSizes.length === 0 ? 0 : Math.max(...patchSizes);
  return {
    population,
    patch_count: patchSizes.length,
    largest_patch_size: largest,
    largest_patch_proportion: population === 0 ? null : largest / population,
    mean_patch_size:
      patchSizes.length === 0
        ? null
        : patchSizes.reduce((total, size) => total + size, 0) / patchSizes.length,
    singleton_patch_count: patchSizes.filter((size) => size === 1).length,
  };
}

export function measureSpatialStructure(
  organisms: readonly Readonly<OrganismState>[],
  width: number,
  height: number,
): SpatialStructureMeasurement {
  const occupied = new Map<number, OrganismState["lineage"]>();
  for (const organism of organisms) {
    const cellIndex = toCellIndex(organism.coordinate, width, height);
    if (occupied.has(cellIndex)) {
      throw new Error("Spatial measurement received duplicate organism coordinates.");
    }
    occupied.set(cellIndex, organism.lineage);
  }

  let occupiedOccupiedEdges = 0;
  let sameLineageEdges = 0;
  let hostHostEdges = 0;
  let parasiteParasiteEdges = 0;
  let hostParasiteContactEdges = 0;
  let occupiedEmptyBoundaryEdges = 0;
  const observedEdges = new Set<string>();
  const capacity = width * height;

  for (let cellIndex = 0; cellIndex < capacity; cellIndex += 1) {
    const coordinate = { x: cellIndex % width, y: Math.floor(cellIndex / width) };
    for (const direction of [Direction.East, Direction.South] as const) {
      const neighbour = neighbourCoordinate(coordinate, direction, width, height);
      const neighbourIndex = toCellIndex(neighbour, width, height);
      if (neighbourIndex === cellIndex) continue;
      const lower = Math.min(cellIndex, neighbourIndex);
      const upper = Math.max(cellIndex, neighbourIndex);
      const edgeKey = `${lower}:${upper}`;
      if (observedEdges.has(edgeKey)) continue;
      observedEdges.add(edgeKey);

      const left = occupied.get(cellIndex);
      const right = occupied.get(neighbourIndex);
      if (left === undefined && right === undefined) continue;
      if (left === undefined || right === undefined) {
        occupiedEmptyBoundaryEdges += 1;
        continue;
      }
      occupiedOccupiedEdges += 1;
      if (left === right) {
        sameLineageEdges += 1;
        if (left === Lineage.Host) hostHostEdges += 1;
        else parasiteParasiteEdges += 1;
      } else {
        hostParasiteContactEdges += 1;
      }
    }
  }

  return {
    adjacency_definition: "unique_toroidal_von_neumann_edges",
    occupied_occupied_edges: occupiedOccupiedEdges,
    same_lineage_edges: sameLineageEdges,
    host_host_edges: hostHostEdges,
    parasite_parasite_edges: parasiteParasiteEdges,
    host_parasite_contact_edges: hostParasiteContactEdges,
    occupied_empty_boundary_edges: occupiedEmptyBoundaryEdges,
    same_lineage_edge_proportion:
      occupiedOccupiedEdges === 0 ? null : sameLineageEdges / occupiedOccupiedEdges,
    host: patchSummary(Lineage.Host, occupied, width, height),
    parasite: patchSummary(Lineage.Parasite, occupied, width, height),
  };
}
