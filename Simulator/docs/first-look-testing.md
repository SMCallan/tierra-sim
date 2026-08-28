# First-Look Testing Guide

- **Status:** Development and supervisor-review workflow
- **Purpose:** Put the reconstructed simulator in the researcher's hands before UI development or formal calibration

## 1. Run it now

For the interactive spatial application, use:

```sh
npm run app
```

See `interactive-cockpit.md` for the browser controls and interpretation guide.

For the headless terminal workflow, open a terminal in `Simulator/` and run:

```sh
npm run demo
```

This builds the engine and runner, then executes the versioned 200-tick demonstration. It prints a line every 20 completed ticks showing population size by ancestral lineage, interval births, HGT successes/attempts, and mean behavioural divergence when enough realised behaviour exists.

Nothing is written by default, so the command is safe to repeat.

## 2. Change the run

The simplest scientific controls are exposed without editing code:

```sh
npm run demo -- --ticks 500 --seed 42
```

`--ticks` changes the duration and `--seed` selects the complete deterministic stochastic trajectory. Repeating the same configuration and seed must reproduce the final state hash exactly.

To retain the result:

```sh
npm run demo -- --ticks 500 --seed 42 --run-id cal-first-look-001 --output ./runs
```

This atomically creates `runs/cal-first-look-001/`. The runner refuses to overwrite it. Use a new run identifier for another retained run.

Detailed events are useful for audit but can become large. Disable them for a lighter exploratory run:

```sh
npm run demo -- --ticks 5000 --seed 42 --no-events
```

## 3. What the retained directory contains

The important files are:

- `timeseries.csv`: compact sample-boundary data for plotting and analysis;
- `measurements.json`: the lossless nested measurement records, including sensitivity thresholds;
- `lineage.csv`: one permanent pedigree row per organism ever born;
- `state-hashes.csv`: deterministic sampled-state identities;
- `checkpoints/`: complete configuration-bound scientific states;
- `events/events.ndjson`: optional detailed transition evidence;
- `final-summary.json`: terminal ecology, counters, pedigree, and latest formal boundary statistics;
- `manifest.json`: configuration, source, dependency, runtime, and payload provenance; and
- `checksums.sha256`: integrity digests for every retained file.

These demonstration runs are development evidence. They do not become formal dissertation data merely because their files are reproducible.

## 4. Run your own resolved inputs

The built-in files live at:

- `runner/presets/demo-config.json`
- `runner/presets/demo-fixture.json`

Copy them before experimenting. After changing a fixture, calculate the digest to place in `initial_population.fixture_sha256`:

```sh
npm run fixture:digest -- --fixture /path/to/fixture.json
```

Then run:

```sh
npm run run:headless -- --config /path/to/config.json --fixture /path/to/fixture.json --output ./runs
```

The runner rejects incomplete configurations, unsupported fields, and fixture-digest mismatches.

## 5. Researcher feedback for the next iteration

For the first session, focus on interpretation rather than whether the numbers look impressive:

1. Does the live vocabulary—host, parasite, HGT, exploitative tendency, divergence—match how you understand the project?
2. Does population growth or collapse feel too fast to inspect meaningfully?
3. Are too many organisms inactive at the primary one-action threshold, and how much does coverage change at sensitivity thresholds five and ten?
4. Do HGT attempts arise often enough without appearing mechanically forced?
5. Which individual-organism facts would you want to inspect while a run is happening: genome, energy, parentage, recent operations, neighbours, or something else?
6. For the browser application, would you first prefer a spatial world view, a lineage tree, live plots, or a linked view combining them?

Your answers should drive the calibration preset and the first interactive interface. The demonstration parameters are intentionally not frozen scientific choices.
