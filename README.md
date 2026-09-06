# TIERRA-SIM

**A deterministic digital-evolution simulator for studying how mutation and horizontal gene transfer separate behaviour from ancestry.**

TIERRA-SIM is the software artefact developed for my MSc dissertation. It models a small world in which digital organisms execute programs, reproduce, mutate, exchange code and compete for energy.

This repository contains the simulator, browser interface, experiment runner and analysis software. It does not contain the dissertation or the 2.7 GB formal-results dataset.

![The TIERRA-SIM cockpit showing the organism grid, live measurements and organism inspector](https://github.com/user-attachments/assets/08a1b286-35b1-4d13-b2b8-32d7ef9d3397)

## Quick start

### Requirements

- Node.js 24 or later
- npm

From the repository root:

```bash
npm install --prefix Simulator
npm run build --prefix Simulator
npm run app --prefix Simulator
```

Open [http://127.0.0.1:4173/](http://127.0.0.1:4173/) and select **Run**.

The simulation begins paused.

## How it works

The world is a two-dimensional grid. Each occupied cell contains a digital organism represented by a short program.

Organisms:

- execute instructions, consuming energy;
- gain energy by performing functions;
- reproduce into neighbouring cells;
- undergo mutation during reproduction;
- exchange genome fragments with neighbours through horizontal gene transfer; and
- die when they exhaust their energy.

Two starting lineages are used:

- **Hosts**, which gain energy through their own functional activity.
- **Parasites**, which exploit neighbouring organisms.

The model combines inheritance, mutation, spatial competition and horizontal transfer. This allows ancestry and realised behaviour to become progressively disconnected.

## Research question

Every organism has both an ancestry and an observed behaviour. These initially agree: descendants of hosts behave like hosts and descendants of parasites behave like parasites.

Mutation, selection and horizontal transfer can disrupt that relationship.

The experiment therefore asks:

> How rapidly does realised behaviour diverge from lineage expectation, and how do mutation and horizontal transfer affect that process?

## Measurements

Two complementary measurements are used because they answer different questions.

### `Δ_D` — behavioural divergence

`Δ_D` measures how strongly realised behaviour differs from lineage expectation.

- Values near `0` indicate behaviour consistent with lineage expectation.
- Values near `1` indicate behaviour opposite to lineage expectation.

The underlying divergence value is calculated from what an organism actually did, rather than merely inspecting what its genome appears capable of doing.

An individual organism’s divergence is undefined when it performs no informative action. Runs with insufficient eligible coverage are excluded from the primary divergence tests rather than silently treated as having zero divergence.

Population-level mean divergence can also be affected by composition: if one lineage disappears, the population average can change even when surviving individuals do not.

### `U(F|L)` — lineage informativeness

`U(F|L)` measures how much knowing lineage reduces uncertainty about realised function.

- Values near `1` indicate that lineage is strongly informative.
- Values near `0` indicate that lineage provides little information.

The measurement is undefined when fewer than two lineages remain because there is no longer a between-lineage comparison to make.

Across the formal factorial runs, `U(F|L)` was undefined for an average of **56.9% of sampled observations**, principally because only one lineage remained. Keeping those observations explicitly undefined prevents lineage loss from being misreported as evidence that ancestry is uninformative.

## Exploring the simulation

The most useful first comparison is between the **Lineage** and **Function** views.

The Lineage view colours organisms according to ancestry. The Function view colours them according to realised behaviour. Early in a run the views tend to agree; as the system evolves, they separate.

| Try this | What to observe |
|---|---|
| Select **Run** | The world fills and develops a changing population |
| Switch between **Lineage** and **Function** | Ancestry and realised behaviour progressively separate |
| Watch **Mean divergence** | In the formal runs, divergence approached its asymptote within approximately 1,000–3,000 ticks |
| Open **Ecological trajectories** | Population, births, transfer, divergence and measurement coverage over time |
| Select a living cell | Its genome, ancestry and realised behaviour appear in the inspector |
| Enable **auto-pause on first HGT success** | The run pauses when a genome fragment is first transferred successfully |
| Compare several mutation settings and seeds | Higher mutation showed descriptively earlier divergence onset in the formal runs |
| Compare several transfer settings and seeds | Transfer had little effect on divergence magnitude; among runs where parasites became extinct, higher transfer was associated with earlier extinction |

The Ecological trajectories panel is collapsed by default. Select its heading to open it.

Individual runs are stochastic experiments. A single demonstration may not reproduce an aggregate pattern from the formal study.

## Running without the browser

The headless runner uses the same simulation engine as the browser interface.

Run a short demonstration:

```bash
npm run demo --prefix Simulator -- --ticks 500 --seed 42
```

## Running the formal experiment

The formal batch contains 60 runs and took approximately 1 hour 35 minutes using four concurrent workers on the development machine.

From the repository root:

```bash
node Simulator/runner/dist/cli.js batch \
  --batch Simulator/runner/presets/batch-formal-mpr-factorial-v2.json \
  --output Experiments/raw-data/formal-v2 \
  --concurrency 4
```

The resulting bundle is written to:

```text
Experiments/raw-data/formal-v2/formal-mpr-factorial-v2
```

Run directories are write-once. The runner refuses to replace an existing bundle, so a repeated experiment must use a new output location. This protects existing evidence from accidental alteration.

## Analysing a completed experiment

Install the analysis dependencies:

```bash
npm install --prefix Analysis
```

Generate the statistical report and figures:

```bash
npm run analyse --prefix Analysis -- \
  --bundle Experiments/raw-data/formal-v2/formal-mpr-factorial-v2 \
  --output <analysis-output-directory> \
  --figures
```

Omitting `--output` prints the report to standard output. Figures are only generated when `--figures` is supplied.

## Validation

Validate the simulator, runner and interface:

```bash
npm run validate --prefix Simulator
```

Run the analysis test suite:

```bash
npm test --prefix Analysis
```

At the current repository revision, the project contains **315 automated tests**:

| Component | Tests |
|---|---:|
| Simulation engine | 111 |
| Experiment runner | 37 |
| Browser interface | 6 |
| Analysis | 161 |
| **Total** | **315** |

## Repository structure

| Directory | Purpose |
|---|---|
| `Simulator/engine` | Simulation world, instruction set, energy, reproduction and measurement |
| `Simulator/runner` | Headless execution, experiment batches, manifests and checksums |
| `Simulator/app` | React and Vite browser interface |
| `Analysis` | Statistical analysis, supplementary exports and figures |

## Design choices

### Deterministic scientific execution

A configuration and seed reproduce the same scientific trajectory in the supported environment. This was tested using 24 pairs of separately executed runs, which agreed across 888 compared samples.

Generated bundles also contain provenance metadata such as timestamps, runtime duration, platform and Node.js version. These metadata naturally differ between executions, so complete output directories are not expected to be byte-for-byte identical.

### One shared engine

The browser interface and headless experiment runner use the same engine. Watching a run through the interface does not invoke a separate scientific implementation.

### Immutable results

Completed run directories include checksums and cannot be overwritten by the runner. Each run records its seed, configuration, stopping reason, software provenance, starting organism checksum, final random-number state and final-world hash.

### TypeScript

TypeScript supports one shared implementation across the simulation engine, command-line runner and browser interface. Its static types help keep configuration, events, measurements and exported results consistent across those boundaries.

Runtime inputs are validated separately using `zod`, because TypeScript’s static types cannot validate external data after compilation. Deterministic handling is also explicit where JavaScript’s numeric model could otherwise introduce ambiguity.

### Pre-specified analysis

The analysis plan and primary pipeline were frozen before formal execution. Subsequently discovered implementation defects and corrections were documented rather than concealed or retroactively treated as part of the original plan.

## Scope and limitations

TIERRA-SIM is an experimental digital-evolution model. It is not a biological forecast, malware system or claim that the same effects must occur in natural populations or other artificial-life platforms.

The results are reproducible within the declared simulator, configuration and observation horizon. The measurements have internal and convergent support within that scope, but they have not been benchmarked against an independent digital-evolution system.

## Files not included

- **Formal raw results:** approximately 2.7 GB. Scientific trajectories can be regenerated from the committed configurations and seeds, although timestamps and other provenance metadata will differ.
- **Generated build output:** `dist/` directories are created by the build process.
- **The dissertation:** this repository contains the software artefact only.
- **Research governance records:** protocols, calibration history and methodological records belong to the dissertation project rather than this public software repository.

## Troubleshooting

### `Cannot find module .../runner/dist/cli.js`

Build the simulator:

```bash
npm run build --prefix Simulator
```

### `tsc: command not found` or exit code 127

Install the relevant dependencies:

```bash
npm install --prefix Simulator
npm install --prefix Analysis
```

### The runner reports that the output directory already exists

This is intentional. Select a new output location so that an existing result cannot be overwritten.

### The cockpit opens but nothing happens

Select **Run**. New simulations start paused.

### The charts are missing

Open the **Ecological trajectories** panel beneath the world grid. It is collapsed by default.

---

Built with Node.js and TypeScript. Tested with Vitest. Interface built with React and Vite.

**Callan Smith-Macdonald · COMP70046 MSc Dissertation**
