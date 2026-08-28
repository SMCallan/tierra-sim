# TIERRA-SIM

**A small world where digital organisms live, reproduce, mutate, and swap code — and a tool that
measures how quickly they stop behaving like their ancestors.**

This is the software I built for my MSc dissertation. This page tells you what it does, how to run
it, and what to look at first.

---

## Start here

Three commands. About two minutes.

```bash
npm install --prefix Simulator
```

```bash
npm run build --prefix Simulator
```

```bash
npm run app --prefix Simulator
```

That opens the visual cockpit in your browser. Press play and watch the world fill up.

If something goes wrong, see **[Troubleshooting](#troubleshooting)** at the bottom.

---

## What the simulation actually does

Picture a grid. Each square can hold one organism.

Every organism is a short program — a string of simple instructions. It runs its own code, and
running that code costs energy. Earn enough energy and it copies itself into a neighbouring square.
Run out, and it dies.

Three things make it interesting:

- **Mutation.** Copies aren't perfect. Instructions get changed, added, or dropped.
- **Space.** Organisms can only interact with neighbours, so location matters.
- **Horizontal transfer.** Organisms can copy fragments of code from a neighbour, not just from a
  parent — so traits move sideways, not only down the family tree.

Two kinds of organism start the world: **hosts**, which do their own work, and **parasites**, which
exploit their neighbours' work instead.

---

## The question I was trying to answer

Every organism has a family tree. It also has behaviour — what it actually does, moment to moment.

At the start, those two things agree. A descendant of a host behaves like a host.

**They don't stay in agreement.** So: how fast do they come apart, and what makes it happen faster?

That's the whole project.

---

## The two measurements

I record two numbers, because either one alone can mislead you.

### `Δ_D` — behavioural divergence

**How far an organism has drifted from what its ancestry predicts.**

Near 0 means it behaves like its family tree says it should. Near 1 means ancestry tells you
nothing about it.

It's measured per organism, from what it actually did — not from what its code looks like it
should do.

### `U(F|L)` — lineage informativeness

**How much knowing an organism's family tree tells you about its behaviour.**

Near 1 means ancestry is a good predictor. Near 0 means ancestry is useless.

### Why both

They break in different ways, and I wanted the breakage to be visible rather than silent:

- `Δ_D` can be fooled by **composition** — if one lineage dies out, the average shifts even though
  no individual changed.
- `U(F|L)` becomes **undefined** when a lineage disappears entirely, because there's nothing left
  to compare.

`Δ_D` is also explicitly undefined in three situations: an organism that never acted, one observed
too briefly to judge, and a lineage that has gone extinct.

That last rule matters more than it sounds. Across the full experiment, the measurement was
undefined for **56.9% of samples on average**. Without a rule that says so out loud, those samples
would have quietly counted as "ancestry tells you nothing" — which would have manufactured my main
result out of missing data.

---

## Things to try

Once the cockpit is open:

| Try this | What to watch for |
|---|---|
| Press play and leave it | The grid fills, then settles into churn |
| Watch the divergence chart | It climbs fast, then flattens — usually within the first 1,000 steps |
| Watch the population chart | Hosts and parasites rise and fall against each other |
| Turn mutation up | Divergence arrives sooner |
| Turn transfer up | Divergence barely moves — but parasites die out much faster |

That last row surprised me, and it ended up being one of the more interesting findings.

---

## Running it without the browser

The headless runner is the one I used for real experiments. Same engine, no interface.

A single short run:

```bash
npm run demo --prefix Simulator -- --ticks 500 --seed 42
```

The full experiment — 60 runs, roughly 1 hour 35 minutes on four cores:

```bash
cd Simulator && node runner/dist/cli.js batch --batch runner/presets/batch-formal-mpr-factorial-v2.json --output ../Experiments/raw-data/formal-v2 --concurrency 4
```

Turning a finished run into numbers and figures — about three seconds:

```bash
npm install --prefix Analysis
```

```bash
npm run analyse --prefix Analysis -- --bundle <your-output-directory>
```

**Run directories are never overwritten.** If you re-run, give it a new output path. This is
deliberate — it means a result can't be quietly replaced by a later one.

---

## Checking it works

```bash
npm run validate --prefix Simulator
```

Typechecks, builds, and runs the engine, runner and interface tests.

```bash
npm test --prefix Analysis
```

Runs the analysis tests.

**305 tests in total** — 111 engine, 37 runner, 6 interface, 151 analysis.

---

## How it's organised

| Folder | What's in it |
|---|---|
| `Simulator/engine` | The simulation itself: instruction set, world, energy, reproduction, measurement |
| `Simulator/runner` | Runs experiments without a browser; writes results with checksums |
| `Simulator/app` | The visual cockpit |
| `Simulator/docs` | Specifications — the rules the engine is required to follow |
| `Analysis` | Turns raw results into the statistics and figures |
| `Experiments/protocols` | What each experiment was for, written before it ran |
| `Experiments/configurations` | The exact settings each experiment used |
| `Research/decisions` | Numbered records of every methodology decision and why it was made |

The engine and the analysis package have **no runtime dependencies**. Everything they do, they do
themselves.

---

## Choices I made on purpose

**The engine is deterministic.** Same configuration and same seed gives the same result, every
time, down to the last value. I tested this rather than assuming it: 24 pairs of separately
executed runs agreed exactly across 888 compared samples.

**The interface can't change the science.** The cockpit and the headless runner share one engine.
Watching a run can't alter it.

**Results are written once.** Every run directory is checksummed and refuses to be overwritten.

**Every run records where it came from.** Seed, step count, why it stopped, software versions, Node
version, platform, the starting organism and its SHA-256, the final random-number state, and a hash
of the final world.

**The analysis was written before the data existed.** I built and tested the statistics against
earlier calibration runs and committed it before the real experiment ran, so I couldn't tune the
analysis to a result I'd already seen. Doing it that way caught three genuine bugs in how the
analysis was being driven — each of which would otherwise have put a wrong number in my results.

---

## What isn't here

- **Raw results.** The main experiment produced 2.7 GB. Every byte of it is regenerable with the
  batch command above.
- **Built output.** `dist/` is generated by `npm run build`, so it isn't committed.
- **The dissertation itself.** This repository is the software.

---

## Troubleshooting

**`Cannot find module .../runner/dist/cli.js`**
The build step hasn't run yet. Run `npm run build --prefix Simulator`.

**`tsc: command not found` or exit code 127**
Dependencies aren't installed. Run `npm install --prefix Simulator`, and
`npm install --prefix Analysis` if you're using the analysis tools.

**The runner refuses to start, saying the output directory exists**
That's intentional. Pass a new `--output` path.

**The cockpit opens but nothing moves**
Press play. It starts paused.

---

Built with Node.js and TypeScript. Tested with Vitest. Interface built with React and Vite.

Callan Smith-Macdonald · COMP70046 MSc Dissertation
