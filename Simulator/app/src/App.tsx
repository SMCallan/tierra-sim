import { useEffect, useMemo, useRef, useState } from "react";

import { ActivityChart, DivergenceChart, PopulationChart } from "./components/Charts.js";
import { EventLog } from "./components/EventLog.js";
import { OrganismInspector } from "./components/OrganismInspector.js";
import { WorldGrid, type ColourMode } from "./components/WorldGrid.js";
import {
  CockpitMode,
  cockpitDefaults,
  DURATION_PRESETS,
  WORLD_PRESETS,
  createCockpitSession,
  type CockpitMode as CockpitModeValue,
} from "./simulation/demo.js";
import type { BrowserSnapshot } from "./simulation/session.js";
import type {
  SimulationWorkerRequest,
  SimulationWorkerResponse,
} from "./simulation/worker-protocol.js";

const speeds = [1, 5, 10, 20] as const;

function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-GB").format(value);
}

function compactHash(hash: string): string {
  return `${hash.slice(0, 12)}…${hash.slice(-8)}`;
}

function initialSnapshot(mode: CockpitModeValue): BrowserSnapshot {
  const session = createCockpitSession(mode);
  return session.snapshot();
}

export default function App() {
  const initialMode = CockpitMode.Explore;
  const initial = useMemo(() => initialSnapshot(initialMode), []);
  const workerRef = useRef<Worker | null>(null);
  const [snapshot, setSnapshot] = useState(initial);
  const [mode, setMode] = useState<CockpitModeValue>(initialMode);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState<(typeof speeds)[number]>(5);
  const [colourMode, setColourMode] = useState<ColourMode>("genome");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [seed, setSeed] = useState(String(cockpitDefaults(initialMode).seed));
  const [duration, setDuration] = useState(String(cockpitDefaults(initialMode).completed_ticks));
  const [worldWidth, setWorldWidth] = useState(String(cockpitDefaults(initialMode).world_width));
  const [worldHeight, setWorldHeight] = useState(String(cockpitDefaults(initialMode).world_height));
  const [error, setError] = useState<string | null>(null);
  const [pauseOnMixed, setPauseOnMixed] = useState(false);
  const [pauseOnHgt, setPauseOnHgt] = useState(false);
  const [pauseReason, setPauseReason] = useState<string | null>(null);

  useEffect(() => {
    const simulationWorker = new Worker(
      new URL("./simulation/simulation.worker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = simulationWorker;
    simulationWorker.onmessage = (event: MessageEvent<SimulationWorkerResponse>) => {
      const response = event.data;
      if (response.type === "error") {
        setRunning(false);
        setError(response.message);
        return;
      }
      setSnapshot(response.snapshot);
      setRunning(response.running);
      if (response.pause_reason !== null) {
        setPauseReason(response.pause_reason);
      }
    };
    simulationWorker.onerror = (event) => {
      setRunning(false);
      setError(event.message || "The simulation worker stopped unexpectedly.");
    };
    const defaults = cockpitDefaults(initialMode);
    simulationWorker.postMessage({
      type: "initialise",
      mode: initialMode,
      seed: defaults.seed,
      completed_ticks: defaults.completed_ticks,
      world_width: defaults.world_width,
      world_height: defaults.world_height,
    } satisfies SimulationWorkerRequest);
    return () => {
      simulationWorker.terminate();
      workerRef.current = null;
    };
  }, []);

  const postToWorker = (request: SimulationWorkerRequest) => {
    workerRef.current?.postMessage(request);
  };

  useEffect(() => {
    if (
      selectedId !== null &&
      !snapshot.organisms.some((organism) => organism.state.id === selectedId)
    ) {
      setSelectedId(null);
    }
  }, [selectedId, snapshot.organisms]);

  const selectedOrganism =
    snapshot.organisms.find((organism) => organism.state.id === selectedId) ?? null;
  const livingIds = useMemo(
    () => new Set(snapshot.organisms.map((organism) => organism.state.id)),
    [snapshot.organisms],
  );
  const formal = snapshot.latest_formal_measurement;
  const divergence = formal?.divergence?.total.mean_divergence ?? null;
  const eligible = formal?.divergence?.total.eligible_count ?? 0;
  const formalPopulation = formal?.state.population_total ?? snapshot.population_total;
  const progress = (snapshot.completed_tick / snapshot.requested_ticks) * 100;
  const researchLocked = mode === CockpitMode.Research && snapshot.completed_tick > 0;

  const reset = () => {
    const parsedSeed = Number(seed);
    const parsedDuration = Number(duration);
    const parsedWidth = Number(worldWidth);
    const parsedHeight = Number(worldHeight);
    if (
      !Number.isSafeInteger(parsedSeed) ||
      parsedSeed < 0 ||
      parsedSeed > 0xffff_ffff ||
      !Number.isSafeInteger(parsedDuration) ||
      parsedDuration <= 0 ||
      !Number.isSafeInteger(parsedWidth) ||
      parsedWidth < 8 ||
      parsedWidth > 256 ||
      !Number.isSafeInteger(parsedHeight) ||
      parsedHeight < 8 ||
      parsedHeight > 256
    ) {
      setError(
        "Seed must be an unsigned 32-bit integer, duration positive, and each world dimension between 8 and 256.",
      );
      return;
    }
    try {
      const session = createCockpitSession(mode, {
        seed: parsedSeed,
        completed_ticks: parsedDuration,
        world_width: parsedWidth,
        world_height: parsedHeight,
      });
      const next = session.snapshot();
      setSnapshot(next);
      postToWorker({
        type: "initialise",
        mode,
        seed: parsedSeed,
        completed_ticks: parsedDuration,
        world_width: parsedWidth,
        world_height: parsedHeight,
      });
      setRunning(false);
      setSelectedId(null);
      setPauseReason(null);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const switchMode = (nextMode: CockpitModeValue) => {
    if (nextMode === mode) {
      return;
    }
    const defaults = cockpitDefaults(nextMode);
    const next = initialSnapshot(nextMode);
    setSnapshot(next);
    postToWorker({
      type: "initialise",
      mode: nextMode,
      seed: defaults.seed,
      completed_ticks: defaults.completed_ticks,
      world_width: defaults.world_width,
      world_height: defaults.world_height,
    });
    setMode(nextMode);
    setSeed(String(defaults.seed));
    setDuration(String(defaults.completed_ticks));
    setWorldWidth(String(defaults.world_width));
    setWorldHeight(String(defaults.world_height));
    setColourMode(nextMode === CockpitMode.Explore ? "genome" : "lineage");
    setRunning(false);
    setSelectedId(null);
    setPauseReason(null);
    setError(null);
  };

  const stepOnce = () => {
    setRunning(false);
    setPauseReason(null);
    postToWorker({ type: "step" });
  };

  const toggleRunning = () => {
    setPauseReason(null);
    if (running) {
      setRunning(false);
      postToWorker({ type: "pause" });
      return;
    }
    setRunning(true);
    postToWorker({
      type: "run",
      ticks_per_update: speed,
      pause_on_mixed: pauseOnMixed,
      pause_on_hgt: pauseOnHgt,
    });
  };

  const randomiseSeed = () => {
    const value = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
    setSeed(String(value));
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <span className="brand-mark" aria-hidden="true">T</span>
          <div>
            <p className="brand-name">TIERRA–SIM</p>
            <p className="brand-subtitle">Digital ecology observatory</p>
          </div>
        </div>

        <div className="mode-switch" role="group" aria-label="Cockpit mode">
          <button
            type="button"
            aria-pressed={mode === CockpitMode.Explore}
            onClick={() => switchMode(CockpitMode.Explore)}
          >
            Explore
          </button>
          <button
            type="button"
            aria-pressed={mode === CockpitMode.Research}
            onClick={() => switchMode(CockpitMode.Research)}
          >
            Research
          </button>
        </div>

        <div className="run-identity">
          <span className={`mode-badge mode-badge-${mode}`}>
            {mode === CockpitMode.Explore ? "non-formal" : "audited demo"}
          </span>
          <span className={`run-status${running ? " is-running" : ""}`}>
            {running
              ? "running"
              : snapshot.terminal_reason === null
                ? "paused"
                : snapshot.terminal_reason}
          </span>
          <code title={snapshot.state_hash}>{compactHash(snapshot.state_hash)}</code>
        </div>
      </header>

      <section className="control-deck" aria-label="Simulation controls">
        <div className="transport-controls">
          <button
            className="button button-primary"
            type="button"
            disabled={snapshot.terminal_reason !== null}
            onClick={toggleRunning}
          >
            {running ? "Pause" : "Run"}
          </button>
          <button
            className="button"
            type="button"
            disabled={snapshot.terminal_reason !== null}
            onClick={stepOnce}
          >
            Step
          </button>
          <button className="button button-quiet" type="button" onClick={reset}>
            {researchLocked ? "New run" : "Reset"}
          </button>
        </div>

        <label className="control-field">
          <span>Speed</span>
          <select
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value) as (typeof speeds)[number])}
          >
            {speeds.map((value) => (
              <option value={value} key={value}>{value} tick{value === 1 ? "" : "s"}/update</option>
            ))}
          </select>
        </label>
        <label className="control-field control-number">
          <span>Seed</span>
          <input
            value={seed}
            inputMode="numeric"
            disabled={researchLocked}
            onChange={(event) => setSeed(event.target.value)}
          />
        </label>
        {mode === CockpitMode.Explore ? (
          <button className="button button-quiet seed-button" type="button" onClick={randomiseSeed}>
            New seed
          </button>
        ) : null}
        <label className="control-field control-number">
          <span>Duration</span>
          <input
            value={duration}
            inputMode="numeric"
            disabled={researchLocked}
            onChange={(event) => setDuration(event.target.value)}
          />
        </label>
        <label className="control-field">
          <span>Preset</span>
          <select
            value={
              DURATION_PRESETS.some((preset) => String(preset.ticks) === duration)
                ? duration
                : "custom"
            }
            disabled={researchLocked}
            onChange={(event) => {
              if (event.target.value !== "custom") {
                setDuration(event.target.value);
              }
            }}
          >
            <option value="custom">Custom</option>
            {DURATION_PRESETS.map((preset) => (
              <option key={preset.label} value={String(preset.ticks)}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>
        <label className="control-field">
          <span>World</span>
          <select
            value={
              WORLD_PRESETS.some(
                (preset) =>
                  String(preset.width) === worldWidth && String(preset.height) === worldHeight,
              )
                ? `${worldWidth}x${worldHeight}`
                : "custom"
            }
            disabled={researchLocked}
            onChange={(event) => {
              const preset = WORLD_PRESETS.find(
                (candidate) => `${candidate.width}x${candidate.height}` === event.target.value,
              );
              if (preset !== undefined) {
                setWorldWidth(String(preset.width));
                setWorldHeight(String(preset.height));
              }
            }}
          >
            <option value="custom">Custom</option>
            {WORLD_PRESETS.map((preset) => (
              <option key={preset.label} value={`${preset.width}x${preset.height}`}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>
        <label className="control-field control-number">
          <span>Width</span>
          <input
            value={worldWidth}
            inputMode="numeric"
            disabled={researchLocked}
            onChange={(event) => setWorldWidth(event.target.value)}
          />
        </label>
        <label className="control-field control-number">
          <span>Height</span>
          <input
            value={worldHeight}
            inputMode="numeric"
            disabled={researchLocked}
            onChange={(event) => setWorldHeight(event.target.value)}
          />
        </label>

        <fieldset className="pause-controls">
          <legend>Auto-pause</legend>
          <label>
            <input
              type="checkbox"
              checked={pauseOnMixed}
              onChange={(event) => setPauseOnMixed(event.target.checked)}
            />
            first mixed behaviour
          </label>
          <label>
            <input
              type="checkbox"
              checked={pauseOnHgt}
              onChange={(event) => setPauseOnHgt(event.target.checked)}
            />
            first HGT success
          </label>
        </fieldset>

        <div className="tick-progress" aria-label={`${progress.toFixed(1)} percent complete`}>
          <div className="metric-line">
            <span>Tick</span>
            <strong>{formatInteger(snapshot.completed_tick)} / {formatInteger(snapshot.requested_ticks)}</strong>
          </div>
          <div className="progress-track" aria-hidden="true">
            <span style={{ width: `${Math.min(100, progress)}%` }} />
          </div>
        </div>
      </section>

      {error === null ? null : <p className="error-banner" role="alert">{error}</p>}
      {pauseReason === null ? null : <p className="pause-banner" role="status">Paused automatically: {pauseReason}</p>}

      <section className="metric-ribbon" aria-label="Current scientific summary">
        <span><small>Living</small><strong>{formatInteger(snapshot.population_total)} · H {snapshot.host_population} · P {snapshot.parasite_population}</strong></span>
        <span className="metric-autonomous"><small>Autonomous</small><strong>{snapshot.functional_counts.autonomous}</strong></span>
        <span className="metric-mixed"><small>Mixed</small><strong>{snapshot.functional_counts.mixed}</strong></span>
        <span className="metric-exploitative"><small>Exploitative</small><strong>{snapshot.functional_counts.exploitative}</strong></span>
        <span><small>Inactive</small><strong>{snapshot.functional_counts.inactive}</strong></span>
        <span><small>Births</small><strong>{formatInteger(snapshot.counters.births)}</strong></span>
        <span><small>HGT</small><strong>{snapshot.counters.hgt_successes}/{snapshot.counters.hgt_attempts}</strong></span>
        <span><small>World resource</small><strong>{snapshot.resource_stock_proportion === null ? "legacy income" : `${(snapshot.resource_stock_proportion * 100).toFixed(1)}%`}</strong></span>
        <span><small>Mean divergence</small><strong>{divergence === null ? "undefined" : divergence.toFixed(3)}</strong></span>
        <span><small>Eligible</small><strong>{eligible}/{formalPopulation}</strong></span>
      </section>

      <div className="primary-layout">
        <WorldGrid
          snapshot={snapshot}
          colourMode={colourMode}
          selectedId={selectedId}
          onColourModeChange={setColourMode}
          onSelect={setSelectedId}
        />
        <OrganismInspector
          organism={selectedOrganism}
          maximumEnergy={snapshot.maximum_organism_energy}
          events={snapshot.recent_events}
        />
      </div>

      <div className="bottom-dock">
        <details className="analysis-drawer">
          <summary>
            <span>
              <span className="eyebrow">Formal samples</span>
              Ecological trajectories
            </span>
            <small>Every 20 ticks</small>
          </summary>
          <div className="charts-grid">
            <article className="chart-panel">
              <h3>Population by lineage</h3>
              <PopulationChart samples={snapshot.samples} />
            </article>
            <article className="chart-panel">
              <h3>Births and HGT</h3>
              <ActivityChart samples={snapshot.samples} />
            </article>
            <article className="chart-panel">
              <h3>Divergence and coverage</h3>
              <DivergenceChart samples={snapshot.samples} />
            </article>
          </div>
        </details>

        <details className="event-drawer">
          <summary>
            <span>
              <span className="eyebrow">Presentation only</span>
              Discoveries and events
            </span>
            <small>{snapshot.recent_events.length} retained</small>
          </summary>
          <EventLog
            events={snapshot.recent_events}
            livingIds={livingIds}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </details>
      </div>
    </main>
  );
}
