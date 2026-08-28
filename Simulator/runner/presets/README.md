# Runner Preset Catalogue

This directory is path-sensitive compatibility storage, not a list of equally valid current
experiments. Always choose a file explicitly and confirm its evidence class before execution.

## Demonstration and performance inputs (4)

- `demo-config.json`, `demo-fixture.json`
- `calibration-performance-config.json`, `calibration-performance-fixture.json`

These support hands-on demonstration or performance diagnosis. They are not governed ecology
qualification inputs.

## Governed retained calibration inputs (17)

- sweep specifications `calibration-sweep-v1.json` through `v6.json`, plus `v8.json`;
- base configurations for v1, v3, v4, v6, and v8;
- fixtures for v1, v3, v4, and v6 (v8 deliberately reuses the v6 fixture); and
- `exec-nbr-donor-compatibility-control-v7.json`.

These files reproduce historical, versioned calibration questions. `RETAINED` does not mean that
a condition qualified, and historical files must not be edited to express a later decision.

## Post-v8 dirty diagnostic inputs (28 tracked)

- `calibration-sweep-test2.json`, `calibration-sweep-test2-extended.json`,
  `calibration-sweep-test3.json`, and `calibration-sweep-test5.json`;
- the fifteen `test4-{base,fixture,sweep}-*` files; and
- the nine `test6-{base,fixture,sweep}-*` files.

These are retained inputs associated with dirty development runs. They are **DIAGNOSTIC**, not
calibration qualification, and should not be used as templates until SCI-001 completes.

## Untracked qualification-like inputs (2)

`calibration-sweep-base-config-qualification.json` and `calibration-sweep-qualification.json`
were used by six dirty 10,000-tick development runs. Preserve them in place pending SCI-001. Do
not run or commit them as active qualification inputs merely because their names contain
“qualification.”

Historical files remain here because sweep/base/fixture paths are resolved relative to
`Simulator/`, and moving or reformatting JSON changes compatibility or content identities. Future
governed inputs belong under `Experiments/configurations/<evidence-class>/`.
