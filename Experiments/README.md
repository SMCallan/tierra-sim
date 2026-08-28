# Experiments

- `protocols/`: human-readable, versioned experimental protocols.
- `configurations/`: machine-readable parameter sets.
- `diagnostics/`: stable campaign registries and evidence-disposition records.
- `run-manifests/`: simulator version, configuration, seed, timestamps, schema version, output path, and checksums for every run.
- `raw-data/`: immutable simulator outputs; ignored by Git except for its boundary README and placeholder.
- `processed-data/`: reproducibly derived data products.

Each directory has its own index and lifecycle rules. Historical protocols and summaries retain
the interpretation written at their execution date, and are not instructions for current work.

Formal data collection begins only after the engine, schema, protocol, and analysis checks are frozen.

Formal batches execute headlessly through the runner; the browser cockpit is not launched and
cannot enter scientific state. Batch outputs are written under `raw-data/` as immutable,
non-overwriting run directories, while reproducibly derived tables live under
`processed-data/`. The governed design plans 60 runs rather than choosing a replicate count
from UI convenience.

Calibration and performance evidence is retained separately under `raw-data/calibration/`.
From `Simulator/`, run:

```sh
npm run benchmark -- --ticks 10000 --report-every 1000 --benchmark-id ID --output ../Experiments/raw-data/calibration
```

This writes a checksummed benchmark report together with the ordinary auditable headless-run
payload. These runs cannot enter the formal dataset.

Governed calibration requires an explicit specification, for example the retained v7 mechanism
control:

```sh
npm run calibrate -- \
  --sweep runner/presets/exec-nbr-donor-compatibility-control-v7.json \
  --output ../Experiments/raw-data/calibration
```

Its exact conditions and interpretation boundaries are in
`protocols/exec-nbr-donor-compatibility-control-v7.md`; v1–v6 and their derived screening
summaries are retained as calibration history. There is no implicit current scientific preset.
Short tick or candidate-limit overrides are marked development-only in both their directory
name and report.

The latest governed retained development screen is v8:

```sh
npm run calibrate:v8 -- --output ../Experiments/raw-data/calibration
```

Its four one-seed conditions, resource gates, extinction treatment, prohibited selection inputs,
and non-confirmatory status were fixed in `protocols/calibration-sweep-v8.md` before outcomes.
The retained v8 screening summary
records zero qualifying candidates: regeneration one collapsed, while regeneration two
saturated. No condition was promoted to confirmation.

The first protocol draft is `protocols/mpr-aligned-protocol-v0.1.md`. It retains the assessed 48-run core and proposes 12 additional mutation/HGT mechanism controls, for 60 formal runs after calibration and performance qualification.
