import { FunctionalClass, Lineage } from "@tierra-sim/engine";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";

import type { BrowserOrganism, BrowserSnapshot } from "../simulation/session.js";

export type ColourMode =
  | "genome"
  | "lineage"
  | "behaviour"
  | "energy"
  | "resource"
  | "age"
  | "generation"
  | "hgt";

interface WorldGridProps {
  readonly snapshot: BrowserSnapshot;
  readonly colourMode: ColourMode;
  readonly selectedId: number | null;
  readonly onColourModeChange: (mode: ColourMode) => void;
  readonly onSelect: (organismId: number | null) => void;
}

/**
 * The canvas is sized from the largest whole-pixel cell that fits both budgets, rather than from a
 * fixed width. A fixed width made taller worlds overflow the stage, and `max-height: 100%` then
 * scaled the whole canvas down — so a 64x64 world rendered with smaller cells than 48x32 and
 * looked sparser rather than grander. Deriving the cell size instead keeps cells as large as the
 * space allows at every world shape, and keeps them on whole pixels so `image-rendering: pixelated`
 * stays crisp.
 */
const MAX_CANVAS_WIDTH = 1100;
const MAX_CANVAS_HEIGHT = 760;
const MIN_CELL_PX = 3;

function canvasGeometry(
  worldWidth: number,
  worldHeight: number,
): { readonly cell: number; readonly width: number; readonly height: number } {
  const fit = Math.min(MAX_CANVAS_WIDTH / worldWidth, MAX_CANVAS_HEIGHT / worldHeight);
  const cell = Math.max(MIN_CELL_PX, Math.floor(fit));
  return { cell, width: cell * worldWidth, height: cell * worldHeight };
}

const lensOptions: readonly { key: ColourMode; label: string }[] = [
  { key: "genome", label: "Genome" },
  { key: "lineage", label: "Lineage" },
  { key: "behaviour", label: "Function" },
  { key: "energy", label: "Energy" },
  { key: "resource", label: "Resource" },
  { key: "age", label: "Age" },
  { key: "generation", label: "Generation" },
  { key: "hgt", label: "HGT" },
];

function organismMap(organisms: readonly BrowserOrganism[]): ReadonlyMap<number, BrowserOrganism> {
  return new Map(organisms.map((organism) => [organism.state.id, organism]));
}

function boundedLevel(value: number, maximum: number): number {
  return Math.max(0, Math.min(1, value / Math.max(1, maximum)));
}

function genomeHash(genome: readonly number[]): number {
  return genome.reduce((hash, opcode, index) => (
    Math.imul(hash ^ (opcode + index * 17), 16_777_619) >>> 0
  ), 2_166_136_261);
}

function cellColour(
  organism: BrowserOrganism,
  snapshot: BrowserSnapshot,
  colourMode: ColourMode,
  maxima: Readonly<{ age: number; generation: number; hgt: number }>,
): string {
  const energyLevel = boundedLevel(
    organism.state.energy,
    snapshot.maximum_organism_energy,
  );
  switch (colourMode) {
    case "genome": {
      const fingerprint = genomeHash(organism.state.genome);
      const lineageHue = organism.state.lineage === Lineage.Host ? 150 : 350;
      const hue = (lineageHue + (fingerprint % 78)) % 360;
      const saturation = 58 + (fingerprint % 25);
      const lightness = 24 + energyLevel * 54;
      return `hsl(${hue} ${saturation}% ${lightness}%)`;
    }
    case "lineage":
      return organism.state.lineage === Lineage.Host
        ? `hsl(177 62% ${30 + energyLevel * 28}%)`
        : `hsl(7 76% ${34 + energyLevel * 26}%)`;
    case "behaviour": {
      const hue = {
        [FunctionalClass.Autonomous]: 164,
        [FunctionalClass.Mixed]: 42,
        [FunctionalClass.Exploitative]: 4,
        [FunctionalClass.Inactive]: 205,
      }[organism.functional_class];
      const saturation = organism.functional_class === FunctionalClass.Inactive ? 16 : 72;
      return `hsl(${hue} ${saturation}% ${29 + energyLevel * 31}%)`;
    }
    case "energy":
      return `hsl(${198 - energyLevel * 142} ${62 + energyLevel * 18}% ${22 + energyLevel * 44}%)`;
    case "resource":
      return "hsl(168 70% 45%)";
    case "age": {
      const level = boundedLevel(organism.state.age_ticks, maxima.age);
      return `hsl(${225 + level * 80} 68% ${22 + level * 46}%)`;
    }
    case "generation": {
      const level = boundedLevel(organism.state.generation, maxima.generation);
      return `hsl(${175 + level * 112} 72% ${23 + level * 43}%)`;
    }
    case "hgt": {
      if (organism.hgt_successes > 0) {
        const level = boundedLevel(organism.hgt_successes, maxima.hgt);
        return `hsl(${52 - level * 18} 90% ${48 + level * 26}%)`;
      }
      if (organism.hgt_attempts > 0) {
        return "hsl(188 58% 36%)";
      }
      return "hsl(205 14% 22%)";
    }
  }
}

function legend(colourMode: ColourMode): readonly { label: string; colour: string }[] {
  switch (colourMode) {
    case "genome":
      return [
        { label: "Host-lineage genotype", colour: "hsl(177 66% 50%)" },
        { label: "Parasite-lineage genotype", colour: "hsl(7 78% 54%)" },
        { label: "Hue varies with genome; brightness with energy", colour: "hsl(52 82% 72%)" },
      ];
    case "lineage":
      return [
        { label: "Host ancestry", colour: "hsl(177 66% 50%)" },
        { label: "Parasite ancestry", colour: "hsl(7 78% 54%)" },
      ];
    case "behaviour":
      return [
        { label: "Autonomous", colour: "hsl(164 72% 48%)" },
        { label: "Mixed", colour: "hsl(42 82% 59%)" },
        { label: "Exploitative", colour: "hsl(4 76% 55%)" },
        { label: "Inactive", colour: "hsl(205 16% 43%)" },
      ];
    case "energy":
      return [
        { label: "Lower energy", colour: "hsl(198 62% 28%)" },
        { label: "Higher energy", colour: "hsl(56 80% 66%)" },
      ];
    case "resource":
      return [
        { label: "Depleted", colour: "hsl(218 48% 10%)" },
        { label: "Recharging", colour: "hsl(184 66% 32%)" },
        { label: "Resource-rich", colour: "hsl(118 72% 66%)" },
        { label: "Outline marks an organism", colour: "hsl(42 86% 68%)" },
      ];
    case "age":
      return [
        { label: "Younger", colour: "hsl(225 68% 28%)" },
        { label: "Older", colour: "hsl(305 68% 65%)" },
      ];
    case "generation":
      return [
        { label: "Earlier generation", colour: "hsl(175 72% 28%)" },
        { label: "Later generation", colour: "hsl(287 72% 65%)" },
      ];
    case "hgt":
      return [
        { label: "No recent exposure", colour: "hsl(205 14% 22%)" },
        { label: "Attempted", colour: "hsl(188 58% 36%)" },
        { label: "Successful transfer", colour: "hsl(43 90% 63%)" },
      ];
  }
}

function organismSummary(organism: BrowserOrganism): string {
  return `Organism ${organism.state.id} · ${organism.state.lineage} lineage · ${organism.functional_class} · energy ${organism.state.energy}`;
}

export function WorldGrid({
  snapshot,
  colourMode,
  selectedId,
  onColourModeChange,
  onSelect,
}: WorldGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const byId = useMemo(() => organismMap(snapshot.organisms), [snapshot.organisms]);
  const geometry = canvasGeometry(snapshot.width, snapshot.height);
  const maxima = useMemo(() => ({
    age: Math.max(1, ...snapshot.organisms.map((organism) => organism.state.age_ticks)),
    generation: Math.max(1, ...snapshot.organisms.map((organism) => organism.state.generation)),
    hgt: Math.max(1, ...snapshot.organisms.map((organism) => organism.hgt_successes)),
  }), [snapshot.organisms]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }
    const context = canvas.getContext("2d");
    if (context === null) {
      return;
    }
    const cellWidth = canvas.width / snapshot.width;
    const cellHeight = canvas.height / snapshot.height;
    const gap = Math.max(1, Math.min(cellWidth, cellHeight) * 0.072);
    context.fillStyle = "#071015";
    context.fillRect(0, 0, canvas.width, canvas.height);

    snapshot.occupancy.forEach((organismId, cellIndex) => {
      const x = cellIndex % snapshot.width;
      const y = Math.floor(cellIndex / snapshot.width);
      const inset = gap / 2;
      context.fillStyle = "#0d1d23";
      if (
        colourMode === "resource" &&
        snapshot.resource_stocks !== null &&
        snapshot.resource_cell_capacity !== null
      ) {
        const level = boundedLevel(
          snapshot.resource_stocks[cellIndex] ?? 0,
          snapshot.resource_cell_capacity,
        );
        const hue = 218 - level * 100;
        const lightness = 10 + level * 56;
        context.fillStyle = `hsl(${hue} ${48 + level * 28}% ${lightness}%)`;
      } else if (organismId !== null) {
        const organism = byId.get(organismId);
        if (organism === undefined) {
          throw new Error(`World references missing organism ${organismId}.`);
        }
        context.fillStyle = cellColour(organism, snapshot, colourMode, maxima);
      }
      context.fillRect(
        x * cellWidth + inset,
        y * cellHeight + inset,
        Math.max(1, cellWidth - gap),
        Math.max(1, cellHeight - gap),
      );
      if (colourMode === "resource" && organismId !== null) {
        const organism = byId.get(organismId);
        if (organism === undefined) {
          throw new Error(`World references missing organism ${organismId}.`);
        }
        context.strokeStyle =
          organism.state.lineage === Lineage.Host ? "#59f0d2" : "#ff806f";
        context.lineWidth = Math.max(1, Math.min(cellWidth, cellHeight) * 0.08);
        context.strokeRect(
          x * cellWidth + inset,
          y * cellHeight + inset,
          Math.max(1, cellWidth - gap),
          Math.max(1, cellHeight - gap),
        );
      }
    });

    const highlightedId = hoveredId ?? selectedId;
    if (highlightedId !== null) {
      const highlighted = byId.get(highlightedId);
      if (highlighted !== undefined) {
        const { x, y } = highlighted.state.coordinate;
        context.strokeStyle = hoveredId === null ? "#f5c85b" : "#f5f7f2";
        context.lineWidth = Math.max(2, Math.min(cellWidth, cellHeight) * 0.13);
        context.strokeRect(
          x * cellWidth + gap / 3,
          y * cellHeight + gap / 3,
          cellWidth - (gap * 2) / 3,
          cellHeight - (gap * 2) / 3,
        );
      }
    }
  }, [byId, colourMode, hoveredId, maxima, selectedId, snapshot]);

  const organismAtPointer = (
    event: PointerEvent<HTMLCanvasElement> | MouseEvent<HTMLCanvasElement>,
  ): number | null => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * snapshot.width);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * snapshot.height);
    if (x < 0 || x >= snapshot.width || y < 0 || y >= snapshot.height) {
      return null;
    }
    return snapshot.occupancy[y * snapshot.width + x] ?? null;
  };

  const moveSelection = (event: KeyboardEvent<HTMLCanvasElement>) => {
    const direction = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    }[event.key];
    if (direction === undefined) {
      return;
    }
    event.preventDefault();
    const selected = selectedId === null ? null : byId.get(selectedId);
    let x = selected?.state.coordinate.x ?? 0;
    let y = selected?.state.coordinate.y ?? 0;
    for (let index = 0; index < snapshot.occupancy.length; index += 1) {
      x = (x + direction.x + snapshot.width) % snapshot.width;
      y = (y + direction.y + snapshot.height) % snapshot.height;
      const organismId = snapshot.occupancy[y * snapshot.width + x] ?? null;
      if (organismId !== null) {
        onSelect(organismId);
        return;
      }
    }
  };

  const highlighted = byId.get(hoveredId ?? selectedId ?? -1) ?? null;

  return (
    <section className="world-section" aria-labelledby="world-heading">
      <div className="section-heading-row world-heading-row">
        <div>
          <p className="eyebrow">Toroidal Von Neumann ecology</p>
          <h2 id="world-heading">Living world</h2>
        </div>
        <span className="world-dimensions">
          {snapshot.width} × {snapshot.height} · {snapshot.population_total} occupied
        </span>
      </div>

      <div className="world-stage">
        <canvas
          ref={canvasRef}
          className="world-canvas"
          width={geometry.width}
          height={geometry.height}
          role="grid"
          tabIndex={0}
          aria-label={`${snapshot.width} by ${snapshot.height} world at tick ${snapshot.completed_tick} with ${snapshot.population_total} living organisms. Use arrow keys to move between occupied cells.`}
          onClick={(event) => onSelect(organismAtPointer(event))}
          onPointerMove={(event) => setHoveredId(organismAtPointer(event))}
          onPointerLeave={() => setHoveredId(null)}
          onKeyDown={moveSelection}
        >
          The simulation world contains {snapshot.population_total} living organisms.
        </canvas>
      </div>

      <div className="lens-bar" aria-label="World visual lens">
        {lensOptions.map((option) => (
          <button
            className="lens-button"
            type="button"
            aria-pressed={colourMode === option.key}
            disabled={option.key === "resource" && snapshot.resource_stocks === null}
            onClick={() => onColourModeChange(option.key)}
            key={option.key}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="world-context" aria-live="polite">
        {highlighted === null
          ? "Hover or select an occupied cell to connect the spatial pattern to an organism."
          : organismSummary(highlighted)}
      </div>

      <div className="world-legend" aria-label={`${colourMode} colour legend`}>
        {legend(colourMode).map((item) => (
          <span className="legend-item" key={item.label}>
            <span
              className="legend-swatch"
              style={{ backgroundColor: item.colour }}
              aria-hidden="true"
            />
            {item.label}
          </span>
        ))}
      </div>
    </section>
  );
}
