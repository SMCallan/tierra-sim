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

## Calibration

Calibration screens candidate ecologies before an experiment is allowed to use one.

There is deliberately **no default sweep**. Every calibration run must name its input with
`--sweep FILE`, so a bare command can never silently re-run a superseded screen. The
[preset catalogue](runner/presets/README.md) separates current inputs from retained history.

Calibration and demonstration output is development evidence. It is not experimental data.
