# Analysis

Reads simulation results and produces statistics and figures. It never writes into a result bundle,
and it re-verifies raw evidence rather than trusting a prior verification.

No runtime dependencies.

## Layout

| Folder | Contents |
|---|---|
| `src/formal/` | The pre-registered analysis: hypothesis tests, descriptives, sensitivities, figures |
| `src/diagnostics/` | Auditing tools for exploratory calibration campaigns |
| `config/` | Immutable analysis parameters and input-batch identifiers |
| `tests/` | 161 statistical and data-validation tests |

## The formal analysis

```bash
npm run analyse -- --bundle <result-directory>
```

Regenerates every reported number and all three figures from a finished run bundle in about three
seconds. Two invocations produce byte-identical output.

Every parameter comes from the frozen plan. There is deliberately **no command-line option** to
change the burn-in, the coverage floor, the seeds, or the outcome measure — an option to vary those
would be an option to select a result.

Independent simulation runs are the replicates. Organisms and samples within a run are repeated
observations.

## The diagnostic audit

```bash
npm run audit
```

Audits an exploratory calibration campaign against its frozen specification, recomputing the
exposure denominators that replaced invalid population-snapshot density figures.

**This command needs raw diagnostic data that is not published in this repository.** Raw run output
is excluded for size, so `audit` will report a missing directory on a fresh clone. That is expected.
The formal analysis above works on any bundle you generate yourself.

## Tests

```bash
npm test
```
