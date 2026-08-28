import type { BrowserSample } from "../simulation/session.js";

interface ChartProps {
  readonly samples: readonly BrowserSample[];
}

const WIDTH = 600;
const HEIGHT = 190;
const LEFT = 42;
const RIGHT = 18;
const TOP = 18;
const BOTTOM = 30;

function xPosition(index: number, count: number): number {
  return count <= 1 ? LEFT : LEFT + (index / (count - 1)) * (WIDTH - LEFT - RIGHT);
}

function yPosition(value: number, maximum: number): number {
  return HEIGHT - BOTTOM - (value / Math.max(1, maximum)) * (HEIGHT - TOP - BOTTOM);
}

function points(values: readonly number[], maximum: number): string {
  return values
    .map((value, index) => `${xPosition(index, values.length)},${yPosition(value, maximum)}`)
    .join(" ");
}

function EmptyChart() {
  return (
    <div className="chart-empty">
      Formal samples appear every 20 completed ticks.
    </div>
  );
}

function Axis({ maximum, finalTick }: { readonly maximum: number; readonly finalTick: number }) {
  return (
    <>
      <line className="chart-axis" x1={LEFT} y1={TOP} x2={LEFT} y2={HEIGHT - BOTTOM} />
      <line
        className="chart-axis"
        x1={LEFT}
        y1={HEIGHT - BOTTOM}
        x2={WIDTH - RIGHT}
        y2={HEIGHT - BOTTOM}
      />
      <text className="chart-label" x={LEFT - 8} y={TOP + 4} textAnchor="end">
        {maximum}
      </text>
      <text className="chart-label" x={LEFT - 8} y={HEIGHT - BOTTOM + 4} textAnchor="end">
        0
      </text>
      <text className="chart-label" x={LEFT} y={HEIGHT - 8}>
        20
      </text>
      <text className="chart-label" x={WIDTH - RIGHT} y={HEIGHT - 8} textAnchor="end">
        {finalTick}
      </text>
    </>
  );
}

export function PopulationChart({ samples }: ChartProps) {
  if (samples.length === 0) {
    return <EmptyChart />;
  }
  const maximum = Math.max(1, ...samples.map((sample) => sample.population_total));
  const host = samples.map((sample) => sample.host_population);
  const parasite = samples.map((sample) => sample.parasite_population);
  return (
    <svg
      className="chart-svg"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="Host and parasite lineage population through sampled ticks"
    >
      <title>Population by ancestral lineage</title>
      <Axis maximum={maximum} finalTick={samples.at(-1)?.tick ?? 0} />
      <polyline className="chart-line chart-host" points={points(host, maximum)} />
      <polyline className="chart-line chart-parasite" points={points(parasite, maximum)} />
      <text className="chart-direct-label chart-host-label" x={WIDTH - RIGHT} y={yPosition(host.at(-1) ?? 0, maximum) - 7} textAnchor="end">
        host {host.at(-1)}
      </text>
      <text className="chart-direct-label chart-parasite-label" x={WIDTH - RIGHT} y={yPosition(parasite.at(-1) ?? 0, maximum) + 15} textAnchor="end">
        parasite {parasite.at(-1)}
      </text>
    </svg>
  );
}

export function ActivityChart({ samples }: ChartProps) {
  if (samples.length === 0) {
    return <EmptyChart />;
  }
  const maximum = Math.max(
    1,
    ...samples.flatMap((sample) => [sample.interval_births, sample.interval_hgt_successes]),
  );
  const plotWidth = WIDTH - LEFT - RIGHT;
  const groupWidth = plotWidth / samples.length;
  const barWidth = Math.max(3, Math.min(18, groupWidth * 0.32));
  return (
    <svg
      className="chart-svg"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="Interval births and successful horizontal transfers through sampled ticks"
    >
      <title>Ecological activity per sample interval</title>
      <Axis maximum={maximum} finalTick={samples.at(-1)?.tick ?? 0} />
      {samples.map((sample, index) => {
        const centre = LEFT + groupWidth * (index + 0.5);
        const birthY = yPosition(sample.interval_births, maximum);
        const hgtY = yPosition(sample.interval_hgt_successes, maximum);
        return (
          <g key={sample.tick}>
            <rect
              className="chart-bar chart-birth"
              x={centre - barWidth - 1}
              y={birthY}
              width={barWidth}
              height={HEIGHT - BOTTOM - birthY}
            />
            <rect
              className="chart-bar chart-hgt"
              x={centre + 1}
              y={hgtY}
              width={barWidth}
              height={HEIGHT - BOTTOM - hgtY}
            />
          </g>
        );
      })}
      <text className="chart-direct-label chart-birth-label" x={LEFT + 8} y={TOP + 12}>
        births
      </text>
      <text className="chart-direct-label chart-hgt-label" x={LEFT + 68} y={TOP + 12}>
        HGT success
      </text>
    </svg>
  );
}

function nullableSegments(
  samples: readonly BrowserSample[],
  selector: (sample: BrowserSample) => number | null,
): string[] {
  const segments: string[] = [];
  let current: string[] = [];
  samples.forEach((sample, index) => {
    const value = selector(sample);
    if (value === null) {
      if (current.length > 0) {
        segments.push(current.join(" "));
        current = [];
      }
    } else {
      current.push(`${xPosition(index, samples.length)},${yPosition(value, 1)}`);
    }
  });
  if (current.length > 0) {
    segments.push(current.join(" "));
  }
  return segments;
}

export function DivergenceChart({ samples }: ChartProps) {
  if (samples.length === 0) {
    return <EmptyChart />;
  }
  const divergenceSegments = nullableSegments(samples, (sample) => sample.mean_divergence);
  const coverageSegments = nullableSegments(samples, (sample) =>
    sample.eligible_count === null || sample.population_total === 0
      ? null
      : sample.eligible_count / sample.population_total,
  );
  return (
    <svg
      className="chart-svg"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="Mean lineage-relative divergence and eligible population coverage from zero to one"
    >
      <title>Divergence and eligible population coverage</title>
      <Axis maximum={1} finalTick={samples.at(-1)?.tick ?? 0} />
      {divergenceSegments.map((segment, index) => (
        <polyline className="chart-line chart-divergence" points={segment} key={`d-${index}`} />
      ))}
      {coverageSegments.map((segment, index) => (
        <polyline className="chart-line chart-coverage" points={segment} key={`c-${index}`} />
      ))}
      <text className="chart-direct-label chart-divergence-label" x={LEFT + 8} y={TOP + 12}>
        mean delta
      </text>
      <text className="chart-direct-label chart-coverage-label" x={LEFT + 92} y={TOP + 12}>
        eligible share
      </text>
    </svg>
  );
}
