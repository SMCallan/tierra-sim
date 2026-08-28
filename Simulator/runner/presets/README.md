# Runner presets

Input files for the runner. Paths inside a sweep are resolved relative to `Simulator/`, so run the
commands from there.

A sweep file names a base configuration and a fixture; all three are needed together.

## The formal experiment

`batch-formal-mpr-factorial-v2.json` — the 60-run factorial reported in the dissertation.

```bash
node runner/dist/cli.js batch --batch runner/presets/batch-formal-mpr-factorial-v2.json --output ../Experiments/raw-data/formal-v2 --concurrency 4
```

## Demonstration

`demo-config.json` and `demo-fixture.json` — the small ecology behind `npm run demo` and the
browser cockpit.

## Performance

`calibration-performance-config.json` and `calibration-performance-fixture.json` — inputs for
`npm run benchmark`.

## Calibration screens

Versioned screens used to find a workable ecology before the formal experiment, kept so those runs
can be reproduced:

| Sweep | Question it asked |
|---|---|
| `calibration-sweep-v1.json` | Energy and turnover |
| `calibration-sweep-v6.json` | Spatial inoculum and reproduction economics |
| `calibration-sweep-v8.json` | Local renewable resource |
| `calibration-sweep-v9.json` | Shared neighbourhood depletion — the qualifying ecology |
| `calibration-sweep-v9-confirmation.json` | Three-seed confirmation of v9 |
| `exec-nbr-donor-compatibility-control-v7.json` | Donor-compatibility mechanism control |

Their base configurations and fixtures sit alongside them. An earlier version number means an
earlier question, not a worse one — most produced no qualifying ecology, which is why later
versions exist.

Calibration has no default: every run must name its sweep with `--sweep FILE`.
