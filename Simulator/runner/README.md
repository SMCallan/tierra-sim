# Headless Runner

`@tierra-sim/runner` is the Node.js execution and evidence boundary around the browser-safe engine.

It currently provides:

- a versioned, deliberately small first-look demonstration ecology;
- resolved configuration and content-addressed fixture validation;
- live sample-boundary summaries;
- deterministic state hashes and retained engine checkpoints;
- population, behavioural-divergence, functional-class, and lineage-information time series;
- a persistent pedigree export covering living and dead organisms;
- optional detailed events enriched with run and lineage identity;
- source, dependency, configuration, fixture, and runtime provenance; and
- atomic, non-overwriting run directories with SHA-256 checksums.

The runner handles demonstrations, calibration work, validation fixtures, and parallel batch
execution of a full experimental programme. Statistical analysis of the results it produces is a
separate package (`Analysis/`), so that execution and interpretation stay independent.

The [preset catalogue](presets/README.md) distinguishes examples, governed retained calibration
inputs, dirty diagnostic inputs, and local qualification-like files. Calibration has no implicit
current preset: every invocation must provide `--sweep FILE`. This prevents a bare command from
silently executing historical v6 or any other obsolete screen.

From `Simulator/`:

```sh
npm run demo
npm run demo -- --ticks 500 --seed 42
npm run demo -- --ticks 500 --seed 42 --run-id my-first-run --output ./runs
```

The last command creates `Simulator/runs/my-first-run/`. Existing run directories are never overwritten.

An explicit calibration example is:

```sh
npm run calibrate -- \
  --sweep runner/presets/calibration-sweep-v8.json \
  --output ../Experiments/raw-data/calibration
```

V8 is retained development history, not a current qualification candidate. Check the
[preset catalogue](presets/README.md) before selecting or creating a sweep.
