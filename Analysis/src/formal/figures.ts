/**
 * Figures 4.1 to 4.3, emitted as standalone SVG.
 *
 * SVG rather than a plotting library because the `Analysis` package has no runtime dependencies and
 * should not acquire one to draw three figures. It is also the right format for a dissertation: it
 * scales to any print size without resampling, and the output is a text file that diffs, so a
 * regenerated figure shows what changed rather than appearing as an opaque new binary.
 *
 * Two design constraints, both for the printed thesis:
 *
 * - **Colour is never the only channel.** The host and parasite series use the Okabe–Ito
 *   colourblind-safe blue and orange, and are additionally distinguished by line weight and dash,
 *   so the figures survive greyscale printing and the eight percent of male readers with a colour
 *   vision deficiency.
 * - **Individual runs stay visible.** Condition means are drawn over the runs that produced them,
 *   never instead of them. A mean that conceals its spread is the same failure as a population
 *   statistic that conceals its composition (`D042`), one level up.
 *
 * Read-only with respect to every bundle.
 */

import type { BundleInputs } from "./run-outcomes.ts";

/* ---------------------------------------------------------------------------------------------
 * Minimal SVG scaffolding
 * ------------------------------------------------------------------------------------------- */

const INK = "#1a1a1a";
const MUTED = "#6b6b6b";
const GRID = "#d8d8d8";
const RUN_TRACE = "#b9c6d1";
const HOST = "#0072B2";
const PARASITE = "#E69F00";
const MARK = "#8c4a9c";

/** Escapes the five XML metacharacters. Labels come from condition identifiers, so this matters. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function round(value: number): string {
  return (Math.round(value * 100) / 100).toString();
}

interface Scale {
  readonly toX: (value: number) => number;
  readonly toY: (value: number) => number;
}

function makeScale(
  xDomain: readonly [number, number],
  yDomain: readonly [number, number],
  box: { x: number; y: number; width: number; height: number },
): Scale {
  const [x0, x1] = xDomain;
  const [y0, y1] = yDomain;
  return {
    toX: (value) => box.x + ((value - x0) / (x1 - x0 || 1)) * box.width,
    toY: (value) => box.y + box.height - ((value - y0) / (y1 - y0 || 1)) * box.height,
  };
}

function polyline(
  points: readonly (readonly [number, number])[],
  scale: Scale,
  attributes: string,
): string {
  // Undefined points break the line rather than being bridged, so a gap in the data reads as a gap.
  const segments: string[] = [];
  let current: string[] = [];
  for (const [x, y] of points) {
    if (!Number.isFinite(y)) {
      if (current.length > 1) {
        segments.push(current.join(" "));
      }
      current = [];
      continue;
    }
    current.push(`${round(scale.toX(x))},${round(scale.toY(y))}`);
  }
  if (current.length > 1) {
    segments.push(current.join(" "));
  }
  return segments.map((points_) => `<polyline points="${points_}" ${attributes}/>`).join("");
}

function text(
  content: string,
  x: number,
  y: number,
  options: { size?: number; anchor?: string; fill?: string; weight?: string } = {},
): string {
  const { size = 11, anchor = "start", fill = INK, weight = "normal" } = options;
  return (
    `<text x="${round(x)}" y="${round(y)}" font-family="Georgia, 'Times New Roman', serif" ` +
    `font-size="${String(size)}" text-anchor="${anchor}" fill="${fill}" font-weight="${weight}">` +
    `${escapeXml(content)}</text>`
  );
}

function document_(width: number, height: number, title: string, body: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(width)} ${String(height)}" ` +
    `width="${String(width)}" height="${String(height)}" role="img" aria-label="${escapeXml(title)}">` +
    `<title>${escapeXml(title)}</title>` +
    `<rect width="${String(width)}" height="${String(height)}" fill="#ffffff"/>` +
    body +
    `</svg>\n`
  );
}

/* ---------------------------------------------------------------------------------------------
 * Shared input shape
 * ------------------------------------------------------------------------------------------- */

export interface FigureRun {
  readonly conditionId: string;
  readonly mutation: string;
  readonly hgt: string;
  readonly bundle: BundleInputs;
}

const MUTATIONS = ["0.01", "0.02", "0.04"] as const;
const HGTS = ["0.25", "0.5", "0.75"] as const;

interface PanelGeometry {
  readonly columns: number;
  readonly rows: number;
  readonly panelWidth: number;
  readonly panelHeight: number;
  readonly left: number;
  readonly top: number;
  readonly gapX: number;
  readonly gapY: number;
}

const GRID_GEOMETRY: PanelGeometry = {
  columns: 3,
  rows: 3,
  panelWidth: 236,
  panelHeight: 150,
  left: 62,
  top: 74,
  gapX: 22,
  gapY: 40,
};

function panelBox(row: number, column: number): { x: number; y: number; width: number; height: number } {
  const g = GRID_GEOMETRY;
  return {
    x: g.left + column * (g.panelWidth + g.gapX),
    y: g.top + row * (g.panelHeight + g.gapY),
    width: g.panelWidth,
    height: g.panelHeight,
  };
}

function figureSize(): { width: number; height: number } {
  const g = GRID_GEOMETRY;
  return {
    width: g.left + g.columns * g.panelWidth + (g.columns - 1) * g.gapX + 26,
    height: g.top + g.rows * g.panelHeight + (g.rows - 1) * g.gapY + 62,
  };
}

/* ---------------------------------------------------------------------------------------------
 * Figure 4.1 — host-lineage divergence trajectories
 * ------------------------------------------------------------------------------------------- */

/**
 * Host-lineage `Δ_D(t)` by condition: four run traces per panel with the condition mean over them,
 * and the 10,000-tick burn-in marked.
 *
 * The y-axis deliberately spans the full `[0, 1]` of the measure rather than zooming to the data.
 * Zooming would make a spread of 0.01 fill the panel and imply a large effect, which is exactly the
 * misreading Chapter 4 §4.3.4 exists to prevent. The reader should see that every condition sits
 * near 0.89 and that the differences between them are small.
 */
export function figureDivergenceTrajectories(runs: readonly FigureRun[], burnInTicks: number): string {
  const { width, height } = figureSize();
  const parts: string[] = [];

  parts.push(text("Figure 4.1  Host-lineage divergence over time, by condition", 20, 26, { size: 14, weight: "bold" }));
  parts.push(
    text(
      "Individual runs in pale blue; condition mean in solid blue; dashed line marks the 10,000-tick burn-in.",
      20,
      44,
      { size: 11, fill: MUTED },
    ),
  );

  MUTATIONS.forEach((mutation, row) => {
    HGTS.forEach((hgt, column) => {
      const box = panelBox(row, column);
      const cell = runs.filter((run) => run.mutation === mutation && run.hgt === hgt);
      const maxTick = 100_000;
      const scale = makeScale([0, maxTick], [0, 1], box);

      parts.push(
        `<rect x="${round(box.x)}" y="${round(box.y)}" width="${round(box.width)}" ` +
          `height="${round(box.height)}" fill="none" stroke="${GRID}"/>`,
      );
      for (const gridline of [0.25, 0.5, 0.75]) {
        parts.push(
          `<line x1="${round(box.x)}" y1="${round(scale.toY(gridline))}" x2="${round(box.x + box.width)}" ` +
            `y2="${round(scale.toY(gridline))}" stroke="${GRID}" stroke-dasharray="2 3"/>`,
        );
      }

      const series = cell.map((run) =>
        run.bundle.samples.map(
          (sample) =>
            [sample.tick, sample.divergence?.host.mean_divergence ?? Number.NaN] as const,
        ),
      );
      for (const points of series) {
        parts.push(polyline(points, scale, `fill="none" stroke="${RUN_TRACE}" stroke-width="0.8"`));
      }

      // Condition mean at each sampled tick, over the runs that have a defined value there.
      const byTick = new Map<number, number[]>();
      for (const points of series) {
        for (const [tick, value] of points) {
          if (!Number.isFinite(value)) {
            continue;
          }
          const bucket = byTick.get(tick);
          if (bucket === undefined) {
            byTick.set(tick, [value]);
          } else {
            bucket.push(value);
          }
        }
      }
      const meanPoints = [...byTick.entries()]
        .sort(([left], [right]) => left - right)
        .map(([tick, values]) => [tick, values.reduce((a, b) => a + b, 0) / values.length] as const);
      parts.push(polyline(meanPoints, scale, `fill="none" stroke="${HOST}" stroke-width="1.7"`));

      parts.push(
        `<line x1="${round(scale.toX(burnInTicks))}" y1="${round(box.y)}" ` +
          `x2="${round(scale.toX(burnInTicks))}" y2="${round(box.y + box.height)}" ` +
          `stroke="${MARK}" stroke-width="1" stroke-dasharray="4 3"/>`,
      );

      parts.push(
        text(`μ ${mutation}   HGT ${hgt}`, box.x + 4, box.y - 6, { size: 11, weight: "bold" }),
      );
      if (column === 0) {
        for (const tickValue of [0, 0.5, 1]) {
          parts.push(
            text(tickValue.toFixed(1), box.x - 7, scale.toY(tickValue) + 4, {
              size: 10,
              anchor: "end",
              fill: MUTED,
            }),
          );
        }
      }
      if (row === 2) {
        for (const tickValue of [0, 50_000, 100_000]) {
          parts.push(
            text(`${String(tickValue / 1000)}k`, scale.toX(tickValue), box.y + box.height + 15, {
              size: 10,
              anchor: "middle",
              fill: MUTED,
            }),
          );
        }
      }
    });
  });

  parts.push(text("Tick", width / 2, height - 26, { size: 12, anchor: "middle" }));
  parts.push(
    `<text transform="translate(18 ${round(height / 2)}) rotate(-90)" font-family="Georgia, serif" ` +
      `font-size="12" text-anchor="middle" fill="${INK}">Host-lineage Δ_D</text>`,
  );
  return document_(width, height, "Host-lineage divergence over time by condition", parts.join(""));
}

/* ---------------------------------------------------------------------------------------------
 * Figure 4.2 — lineage populations
 * ------------------------------------------------------------------------------------------- */

/**
 * Host and parasite populations over time, with the tick of each parasite extinction marked.
 *
 * This is the figure that carries the study's most robust result. Divergence is nearly flat across
 * every condition; parasite persistence is not, and the extinction markers make the timing gradient
 * across HGT visible without a statistic.
 */
export function figureLineagePopulations(runs: readonly FigureRun[]): string {
  const { width, height } = figureSize();
  const parts: string[] = [];

  parts.push(text("Figure 4.2  Lineage populations over time, by condition", 20, 26, { size: 14, weight: "bold" }));
  parts.push(
    text(
      "Host in blue, parasite in orange (thicker, dashed). Triangles mark the tick of parasite extinction.",
      20,
      44,
      { size: 11, fill: MUTED },
    ),
  );

  const ceiling = 2_000;
  MUTATIONS.forEach((mutation, row) => {
    HGTS.forEach((hgt, column) => {
      const box = panelBox(row, column);
      const cell = runs.filter((run) => run.mutation === mutation && run.hgt === hgt);
      const scale = makeScale([0, 100_000], [0, ceiling], box);

      parts.push(
        `<rect x="${round(box.x)}" y="${round(box.y)}" width="${round(box.width)}" ` +
          `height="${round(box.height)}" fill="none" stroke="${GRID}"/>`,
      );

      for (const run of cell) {
        const hostPoints = run.bundle.samples.map(
          (sample) => [sample.tick, sample.state.host_population] as const,
        );
        const parasitePoints = run.bundle.samples.map(
          (sample) => [sample.tick, sample.state.parasite_population] as const,
        );
        parts.push(polyline(hostPoints, scale, `fill="none" stroke="${HOST}" stroke-width="0.9" opacity="0.75"`));
        parts.push(
          polyline(
            parasitePoints,
            scale,
            `fill="none" stroke="${PARASITE}" stroke-width="1.4" stroke-dasharray="5 2"`,
          ),
        );

        const extinction = run.bundle.samples.find((sample) => sample.state.parasite_population === 0);
        if (extinction !== undefined) {
          const x = scale.toX(extinction.tick);
          const y = box.y + box.height;
          parts.push(
            `<polygon points="${round(x)},${round(y - 7)} ${round(x - 4)},${round(y)} ` +
              `${round(x + 4)},${round(y)}" fill="${PARASITE}" stroke="${INK}" stroke-width="0.4"/>`,
          );
        }
      }

      parts.push(text(`μ ${mutation}   HGT ${hgt}`, box.x + 4, box.y - 6, { size: 11, weight: "bold" }));
      if (column === 0) {
        for (const tickValue of [0, 1000, 2000]) {
          parts.push(
            text(String(tickValue), box.x - 7, scale.toY(tickValue) + 4, {
              size: 10,
              anchor: "end",
              fill: MUTED,
            }),
          );
        }
      }
      if (row === 2) {
        for (const tickValue of [0, 50_000, 100_000]) {
          parts.push(
            text(`${String(tickValue / 1000)}k`, scale.toX(tickValue), box.y + box.height + 15, {
              size: 10,
              anchor: "middle",
              fill: MUTED,
            }),
          );
        }
      }
    });
  });

  parts.push(text("Tick", width / 2, height - 26, { size: 12, anchor: "middle" }));
  parts.push(
    `<text transform="translate(18 ${round(height / 2)}) rotate(-90)" font-family="Georgia, serif" ` +
      `font-size="12" text-anchor="middle" fill="${INK}">Organisms</text>`,
  );
  return document_(width, height, "Lineage populations over time by condition", parts.join(""));
}

/* ---------------------------------------------------------------------------------------------
 * Figure 4.3 — the divergence distribution
 * ------------------------------------------------------------------------------------------- */

/**
 * Distribution of individual divergence `δ_i` over the late window, host and parasite separately.
 *
 * This figure is the evidence for two claims that would otherwise rest on a mean. It shows that the
 * distribution is bimodal, which is why the functional-class boundaries sensitivity found almost
 * nothing to be sensitive to. And it shows the host and parasite distributions are near mirror
 * images, which is the composition confound of `D042` in one picture: a population mean over these
 * two shapes is a readout of their mixing proportion.
 *
 * It is **not** a modality test. `D019` and `D024` place formal modality claims out of scope, and a
 * twenty-bin histogram could not support one.
 */
export function figureDivergenceDistribution(
  runs: readonly FigureRun[],
  lateWindowFrom: number,
): string {
  const width = 760;
  const height = 340;
  const parts: string[] = [];

  const host = new Array<number>(20).fill(0);
  const parasite = new Array<number>(20).fill(0);
  for (const run of runs) {
    for (const sample of run.bundle.samples) {
      if (sample.tick < lateWindowFrom || sample.divergence === null) {
        continue;
      }
      sample.divergence.host.divergence_histogram?.forEach((count, index) => {
        host[index] = (host[index] as number) + count;
      });
      sample.divergence.parasite.divergence_histogram?.forEach((count, index) => {
        parasite[index] = (parasite[index] as number) + count;
      });
    }
  }
  const share = (counts: readonly number[]): number[] => {
    const total = counts.reduce((a, b) => a + b, 0);
    return total === 0 ? counts.map(() => 0) : counts.map((count) => count / total);
  };
  const hostShare = share(host);
  const parasiteShare = share(parasite);
  // Round the axis up to a clean tenth. Labelling the axis with the tallest bar's own height
  // ("84%") reads as a measurement rather than a scale, and invites the eye to treat the peak as
  // the reference point instead of the full share.
  const observedPeak = Math.max(...hostShare, ...parasiteShare, 0.05);
  const peak = Math.min(1, Math.ceil(observedPeak * 10) / 10);

  parts.push(text("Figure 4.3  Distribution of individual divergence in the late window", 20, 26, { size: 14, weight: "bold" }));
  parts.push(
    text(
      `Ticks ${lateWindowFrom.toLocaleString("en-GB")}–100,000, all 36 factorial runs pooled. Bars are within-lineage shares.`,
      20,
      44,
      { size: 11, fill: MUTED },
    ),
  );

  const box = { x: 62, y: 66, width: width - 96, height: height - 132 };
  const scale = makeScale([0, 20], [0, peak], box);
  parts.push(
    `<rect x="${round(box.x)}" y="${round(box.y)}" width="${round(box.width)}" ` +
      `height="${round(box.height)}" fill="none" stroke="${GRID}"/>`,
  );

  const slot = box.width / 20;
  for (let bin = 0; bin < 20; bin += 1) {
    const drawBar = (value: number, offset: number, fill: string, dash: boolean): void => {
      const barWidth = slot * 0.38;
      const x = box.x + bin * slot + offset;
      const y = scale.toY(value);
      parts.push(
        `<rect x="${round(x)}" y="${round(y)}" width="${round(barWidth)}" ` +
          `height="${round(box.y + box.height - y)}" fill="${fill}" ` +
          `stroke="${INK}" stroke-width="0.3"${dash ? ' stroke-dasharray="2 1"' : ""}/>`,
      );
    };
    drawBar(hostShare[bin] as number, slot * 0.08, HOST, false);
    drawBar(parasiteShare[bin] as number, slot * 0.54, PARASITE, true);
  }

  for (const bin of [0, 5, 10, 15, 20]) {
    parts.push(
      text((bin / 20).toFixed(2), box.x + bin * slot, box.y + box.height + 16, {
        size: 10,
        anchor: "middle",
        fill: MUTED,
      }),
    );
  }
  for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
    const value = peak * fraction;
    parts.push(
      text(`${String(Math.round(100 * value))}%`, box.x - 7, scale.toY(value) + 4, {
        size: 10,
        anchor: "end",
        fill: MUTED,
      }),
    );
  }

  const legendY = height - 34;
  parts.push(`<rect x="62" y="${String(legendY - 9)}" width="12" height="12" fill="${HOST}" stroke="${INK}" stroke-width="0.3"/>`);
  parts.push(text("Host lineage", 80, legendY, { size: 11 }));
  parts.push(
    `<rect x="182" y="${String(legendY - 9)}" width="12" height="12" fill="${PARASITE}" stroke="${INK}" ` +
      `stroke-width="0.3" stroke-dasharray="2 1"/>`,
  );
  parts.push(text("Parasite lineage", 200, legendY, { size: 11 }));
  parts.push(text("Individual divergence δ_i", width / 2, height - 10, { size: 12, anchor: "middle" }));

  return document_(width, height, "Distribution of individual divergence in the late window", parts.join(""));
}
