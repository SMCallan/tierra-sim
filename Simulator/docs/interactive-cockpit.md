# Interactive Cockpit Guide

- **Status:** Visual-convergence researcher-testing release
- **Purpose:** Observe and interrogate the reconstructed simulator while preserving deterministic scientific execution

## 1. Start the application

From `Simulator/`:

```sh
npm run app
```

Then open:

```text
http://127.0.0.1:4173/
```

The application starts paused in **Explore** mode with a deterministic 48 × 32 ecology and
256 shuffled ancestors. Switch to **Research** for the exact eight-ancestor configuration
used by the headless `npm run demo` workflow.

## 2. Explore and Research boundaries

- **Explore** is a dense demonstration intended for observation, play, interface
  calibration, and hypothesis generation. It is deterministic but is not a formal
  experimental condition.
- **Research** uses the exact governed demonstration fixture. Seed and duration inputs lock
  after the first scientific tick; selecting **New run** returns to tick zero before they can
  be changed.

Both modes use `SimulationEngine`. Neither contains alternative ecological logic.

On desktop the cockpit fits the browser viewport without page scrolling. The world and
inspector retain the available space; trajectory charts and discoveries open in internal
bottom docks. Narrow layouts deliberately return to document scrolling rather than shrinking
controls below usable sizes.

## 3. Simulation controls

- **Run / Pause:** begins or stops presentation-driven advancement.
- **Step:** executes exactly one scientific tick.
- **Reset:** creates a fresh run using the displayed seed and duration.
- **Speed:** chooses how many ticks are executed per worker update. It cannot affect scientific state.
- **Seed:** selects the complete deterministic stochastic trajectory.
- **Duration:** changes the requested terminal tick.
- **Auto-pause:** advances one tick at a time and pauses on the exact first tick where mixed
  realised behaviour appears or HGT first succeeds.
- **Visual lenses:** switch the spatial encoding among genome fingerprint, ancestry,
  realised function, organism energy, local cell resource, age, generation, and HGT exposure.
  The resource lens colours occupied and empty cells by stock while lineage-coloured outlines
  retain organism occupancy. It is disabled for legacy passive-income configurations.

The compact hash in the upper-right is the current complete scientific-state identity. The default 200-tick browser run must finish with the same hash as the headless demonstration:

```text
f9e56d0bc166454524cb3d198f7f614d372e46e19cc295f748d0d79146551bde
```

## 4. Inspecting organisms

Select any occupied world cell. The inspector reports:

- organism identifier, lineage, generation, parent, age, position, and cooldown;
- current energy relative to the configured maximum;
- registers, comparison flag, instruction pointer, and computation task;
- complete hexadecimal genome with the next instruction highlighted; and
- trailing successful autonomous and exploitative births plus HGT exposure.
- lineage-relative divergence, exploitative tendency, and retained notable engine events.

If the selected organism dies while the simulation is running, the live inspector clears. Persistent dead-organism and lineage-tree navigation is planned for the next observability expansion.

## 5. Discovery log

The log summarises births, exploitation, accepted mutations, HGT, computation rewards, and
selected deaths from the engine's immutable tick reports. First observations are labelled
as discoveries. The log is presentation state: it cannot change the scheduler, PRNG,
scientific state, checkpoint, or hash.

Selecting a log row selects a participating organism when one is still alive.

## 6. Presentation performance boundary

Interactive execution runs in a dedicated browser worker. React controls, selection, and
canvas drawing remain on the interface thread, while the worker owns the deterministic
session. Larger speed settings reduce presentation snapshots by executing several ticks per
worker update. Auto-pause uses one tick per update to preserve the exact triggering tick.

Worker scheduling, message timing, canvas frame rate, open docks, and UI latency are excluded
from checkpoints and state hashes.

## 7. Reading the trajectories

Charts update only at the configured formal sample boundaries, every 20 completed ticks in the demonstration.

- **Population:** living host- and parasite-lineage counts.
- **Activity:** births and successful HGT in the latest sample interval.
- **Divergence & coverage:** mean lineage-relative behavioural divergence and the proportion of living organisms eligible for that statistic.

`undefined` is an audited scientific result, not a rendering error. It means no living organism met the primary one-realised-action threshold in the current trailing window. Thresholds five and ten remain conservative sensitivities, and the eligibility count is always shown beside the value.

## 8. Current scientific boundary

The app uses the same deterministic engine, configuration parser, fixture digest, behavioural measurement, and state hash as the headless runner. Browser animation and React state are excluded from scientific state.

Browser/headless equivalence, dense resource-preset determinism, discovery-log determinism,
single-tick behaviour, speed independence, formal-boundary sampling, and off-boundary
termination are automated tests. The cockpit remains a development and calibration surface
until formal presets, browser-side retained exports, full differential fixtures, and the
formal-run gates are complete.
