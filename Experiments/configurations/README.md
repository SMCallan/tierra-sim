# Configuration Registry

This is the prospective home for machine-readable experiment inputs, separated by evidence class:

- [`diagnostic/`](diagnostic/): predeclared development questions that cannot qualify an ecology;
- [`retained-diagnostics/`](retained-diagnostics/): captured historical or dirty-run inputs kept for audit only;
- [`calibration/`](calibration/): governed screening inputs frozen before outcomes;
- [`qualification/`](qualification/): clean, pre-outcome confirmation inputs and fresh replicate seeds; and
- [`formal/`](formal/): ethics-cleared, tagged inputs for the final factorial experiment.

Historical v1–v8 inputs remain under
[`../../Simulator/runner/presets/`](../../Simulator/runner/presets/) because their internal paths,
tests, documentation, and configuration identities are location-sensitive. They must not be
bulk-moved for tidiness. Future governed inputs should enter the classed structure here and be
referenced explicitly by the runner.

The two local `qualification`-named source files are **not** qualification evidence: they were
untracked inputs to dirty development runs. SCI-001 will capture and disposition them under
`retained-diagnostics/`; do not place them in the active `qualification/` directory.
