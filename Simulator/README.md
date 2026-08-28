# Simulator

Three packages over one shared engine.

| Package | What it is |
|---|---|
| `engine/` | The simulation core. Deterministic, no interface code, runs anywhere. |
| `runner/` | Runs the engine from the command line and writes checksummed results. |
| `app/` | A React cockpit for watching a run and inspecting it live. |

The cockpit and the runner drive the **same** engine. Watching a simulation cannot change it.

## Commands

Run these from `Simulator/`.

```bash
npm run app
```
Opens the interactive cockpit in a browser.

```bash
npm run demo
```
Runs a short simulation in the terminal. Add `-- --ticks 500 --seed 42` to control it.

```bash
npm run validate
```
The full local gate: typecheck, all tests, and a production build.

```bash
npm run benchmark -- --ticks 1000 --report-every 200
```
A single performance and ecology diagnostic.

## What the engine covers

Validated configuration and seed fixtures · the specified random-number generator · a toroidal grid
and the virtual machine · the full birth, action and death lifecycle · bounded behavioural
measurement · persistent pedigrees covering living and dead organisms · state hashing ·
restorable checkpoints · and a local renewable resource field with shared neighbourhood depletion.

The runner adds live sample summaries, time series for population, divergence, functional class and
lineage information, a pedigree export, full provenance capture, and atomic run directories that are
never overwritten.

## Specifications

These define what the engine is *required* to do. The implementation follows them; where they
disagree, the specification is correct.

- [`docs/engine-specification.md`](docs/engine-specification.md) — ecological and virtual-machine rules
- [`docs/configuration-and-output-specification.md`](docs/configuration-and-output-specification.md) — inputs, provenance, outputs
- [`docs/reproducibility-and-validation.md`](docs/reproducibility-and-validation.md) — the randomness contract and validation gates
- [`docs/calibration-and-performance-harness.md`](docs/calibration-and-performance-harness.md) — how an ecology is qualified
- [`docs/interactive-cockpit.md`](docs/interactive-cockpit.md) — the interface
- [`docs/first-look-testing.md`](docs/first-look-testing.md) — the headless workflow

## Calibration

Calibration screens candidate ecologies before an experiment is allowed to use one.

There is deliberately **no default sweep**. Every calibration run must name its input with
`--sweep FILE`, so a bare command can never silently re-run a superseded screen. The
[preset catalogue](runner/presets/README.md) separates current inputs from retained history.

Calibration and demonstration output is development evidence. It is not experimental data.
