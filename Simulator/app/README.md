# Interactive Research Cockpit

`@tierra-sim/app` is the human observation and interaction surface over the browser-safe deterministic engine.

The visual-convergence cockpit provides:

- the real versioned demonstration fixture rather than mocked UI data;
- an explicit boundary between a dense deterministic **Explore** ecology and the exact
  audited **Research** demonstration fixture;
- start, pause, reset, single-tick, and display-speed controls;
- deterministic auto-pause triggers for the first mixed realised behaviour or successful HGT;
- deterministic seed and duration inputs;
- a performant canvas world: 48 × 32 in Explore mode and 12 × 8 in Research mode;
- a viewport-fitted desktop cockpit with no page scrolling and internally collapsible
  trajectory/event docks;
- simulation execution in a dedicated Web Worker so engine batches do not block selection,
  controls, or canvas interaction;
- genome, lineage, realised-function, energy, age, generation, and HGT visual lenses;
- organism genome, instruction pointer, VM, energy, ancestry, behavioural divergence, and
  recent-event inspection;
- sampled population, ecological-activity, divergence, and eligibility trajectories;
- a deterministic presentation-only discovery log derived from engine events;
- clear inactive/undefined divergence reporting; and
- current configuration and scientific-state hashes.

Display speed changes how many deterministic ticks are processed per worker update. It does
not change scheduler order, PRNG consumption, or scientific state. Auto-pause forces
single-tick worker updates so the triggering tick remains exact. The browser adapter and
headless runner reproduce the same final hash for the demonstration preset.

From `Simulator/`:

```sh
npm run app
```

Open `http://127.0.0.1:4173/` if the browser does not open it automatically.

Explore mode is intentionally labelled non-formal. Research mode retains the exact
headless-equivalent demonstration and locks run identity inputs after the first scientific
tick. File loading, browser-side export, saved-run comparison, complete dead-organism
pedigree navigation, formal experiment presets, and governed mid-run interventions remain
later slices.
