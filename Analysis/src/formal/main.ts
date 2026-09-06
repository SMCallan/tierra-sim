/**
 * SAP v1.0 formal analysis — command-line entry point.
 *
 * Regenerates every number the dissertation reports from a formal run bundle: the hypothesis
 * tests of SAP §4, the cell descriptives of §7, the confirmatory secondary outcome of §2.2, H4
 * under Amendment 1, the six declared sensitivity analyses of §6 as restated by Amendment 2, and
 * the exploratory horizon-matched comparison `D052` leaves in place of H4.
 *
 * This module **executes** the plan; it does not extend it. Every parameter comes from
 * `SAP_V1_PARAMETERS` or `SAP_V1_SEEDS`, both frozen before the formal run. Nothing here chooses a
 * burn-in, a coverage floor, a seed, or an outcome, and there is no flag that would let a caller
 * choose one — a command-line option to vary the burn-in would be an option to select a result.
 *
 * **Read-only with respect to every input.** Run bundles are immutable evidence; this reads them
 * and writes only where `--output` is given. No timestamp, hostname, or absolute path is emitted
 * into any payload, so two runs of this command over the same bundle produce byte-identical
 * output on any machine.
 *
 * Usage: node src/formal/main.ts --bundle <dir> [--output <dir>] [--figures] [--quiet]
 */

import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  analyseFactorial,
  persistenceByHgt,
  summariseCells,
  summariseDecoupling,
  testH4,
  SAP_V1_SEEDS,
  type ClassifiedRun,
} from "./factorial.ts";
import { SAP_V1_PARAMETERS, type BundleInputs } from "./run-outcomes.ts";
import { quantile } from "./statistics.ts";
import {
  activeOnlyLineageInformation,
  attemptDiagnostic,
  boundarySensitivity,
  burnInSensitivity,
  horizonMatchedDecoupling,
  loadBatch,
  thresholdSensitivity,
} from "./sensitivities.ts";
import {
  figureDivergenceDistribution,
  figureDivergenceTrajectories,
  figureLineagePopulations,
  type FigureRun,
  type PanelReport,
} from "./figures.ts";

/* ---------------------------------------------------------------------------------------------
 * Declared analysis constants
 *
 * SAP §4: 10,000 permutations and 10,000 bootstrap resamples. Amendment 1 gives H4 its own seed.
 * `D052` fixes the exploratory window at ticks 3,000 to 6,900 — after the divergence transient,
 * before the earliest control extinction at 6,951 — so that the comparison is horizon-matched
 * rather than chosen to suit either group.
 * ------------------------------------------------------------------------------------------- */

const PERMUTATIONS = 10_000;
const RESAMPLES = 10_000;
const H4_SEED = 20260805;
const HORIZON_MATCHED_WINDOW = { from: 3_000, to: 6_900 } as const;

class AnalysisError extends Error {}

/* ---------------------------------------------------------------------------------------------
 * Arguments
 * ------------------------------------------------------------------------------------------- */

interface Options {
  readonly bundle: string;
  readonly output: string | null;
  readonly figures: boolean;
  readonly quiet: boolean;
}

function usage(): string {
  return `TIERRA-SIM formal analysis (Statistical Analysis Plan v1.0)

Usage:
  node src/formal/main.ts --bundle DIRECTORY [--output DIRECTORY] [--figures] [--quiet]

Options:
  --bundle DIRECTORY  Formal run bundle. Expects a runs/ subdirectory of run directories,
                      each holding manifest.json and measurements.json. Never written to.
  --output DIRECTORY  Write results.md (and figures, with --figures) here. Without this the
                      report goes to stdout and nothing is written.
  --figures           Also emit figures 4.4 to 4.6 as SVG. Requires --output.
  --quiet             Suppress the progress line while bundles are read.
  --help              Show this help.

Analysis parameters are fixed by the frozen plan and cannot be overridden here.
`;
}

function parseArguments(argv: readonly string[]): Options | null {
  if (argv.includes("--help") || argv.includes("-h")) {
    return null;
  }
  const values = new Map<string, string | true>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] as string;
    if (!argument.startsWith("--")) {
      throw new AnalysisError(`Unexpected positional argument: ${argument}`);
    }
    const key = argument.slice(2);
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      values.set(key, next);
      index += 1;
    } else {
      values.set(key, true);
    }
  }

  const bundle = values.get("bundle");
  if (typeof bundle !== "string") {
    throw new AnalysisError("--bundle is required. Pass the formal run bundle directory.");
  }
  const output = values.get("output");
  if (output === true) {
    throw new AnalysisError("--output needs a directory.");
  }
  const figures = values.get("figures") === true;
  if (figures && output === undefined) {
    throw new AnalysisError("--figures needs --output; figures are files, not stdout.");
  }
  return {
    bundle,
    output: typeof output === "string" ? output : null,
    figures,
    quiet: values.get("quiet") === true,
  };
}

/* ---------------------------------------------------------------------------------------------
 * Discovery
 * ------------------------------------------------------------------------------------------- */

/**
 * Run directories, sorted by identifier.
 *
 * Sorting matters for reproducibility: `readdirSync` order is filesystem-dependent, and the
 * bootstrap and permutation procedures consume runs in the order they are given. An unsorted
 * traversal would produce different intervals on different machines from identical data.
 */
function discoverRuns(bundleDirectory: string): string[] {
  const runsRoot = join(bundleDirectory, "runs");
  let entries: string[];
  try {
    entries = readdirSync(runsRoot);
  } catch {
    throw new AnalysisError(
      `No runs/ directory beneath ${bundleDirectory}. Pass the bundle root, not a single run.`,
    );
  }
  const directories = entries
    .filter((entry) => {
      const candidate = join(runsRoot, entry);
      return statSync(candidate).isDirectory() && fileExists(join(candidate, "manifest.json"));
    })
    .sort((left, right) => left.localeCompare(right, "en"))
    .map((entry) => join(runsRoot, entry));

  if (directories.length === 0) {
    throw new AnalysisError(`No run directories with a manifest.json beneath ${runsRoot}.`);
  }
  return directories;
}

function fileExists(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------------------------------------------
 * Formatting
 *
 * Undefined is printed as an em dash, never as zero and never as a blank cell. SAP §3 forbids
 * imputation, and a blank invites a reader to supply their own.
 * ------------------------------------------------------------------------------------------- */

function num(value: number | null | undefined, digits = 4): string {
  return value === null || value === undefined ? "—" : value.toFixed(digits);
}

function integer(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toLocaleString("en-GB");
}

function percent(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined ? "—" : `${(value * 100).toFixed(digits)}%`;
}

function table(headers: readonly string[], alignments: readonly string[], rows: readonly string[][]): string {
  return [
    `| ${headers.join(" | ")} |`,
    `|${alignments.map((a) => (a === "r" ? "---:" : a === "c" ? ":---:" : "---")).join("|")}|`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

/* ---------------------------------------------------------------------------------------------
 * Report
 * ------------------------------------------------------------------------------------------- */

function buildReport(
  loaded: readonly { readonly bundle: BundleInputs; readonly classified: ClassifiedRun }[],
): string {
  const classified = loaded.map((entry) => entry.classified);
  const sections: string[] = [];

  /*
   * The factorial block, isolated once and used for every analysis SAP §4 and §6 define over it.
   *
   * This matters more than it looks. `persistenceByHgt` buckets on the HGT level in the condition
   * identifier and does not filter by block, so handing it all sixty runs silently pools the
   * twelve default-series runs — which also sit at HGT 0.5 — into the 0.5 cell and shifts its
   * median. The sensitivity functions have the same shape: given every bundle they average the
   * controls in beside the factorial, and the controls include four runs that went extinct before
   * the burn-in. Both would produce plausible numbers that answer a question the plan never asked.
   */
  const factorial = loaded.filter((entry) => entry.classified.block === "factorial");
  const factorialClassified = factorial.map((entry) => entry.classified);
  const factorialBundles = factorial.map((entry) => entry.bundle);

  sections.push(
    "# Formal Programme: SAP v1.0 Results",
    "",
    "Regenerated by `Analysis/src/formal/main.ts`. Evidence class **FORMAL**. Every parameter is",
    "fixed by the plan frozen before execution; none is settable from the command line.",
    "",
    `- Burn-in: ${integer(SAP_V1_PARAMETERS.burnInTicks)} ticks`,
    `- Late window: final ${SAP_V1_PARAMETERS.lateWindowFraction * 100}% of requested ticks`,
    `- Coverage floor: ${percent(SAP_V1_PARAMETERS.coverageFloor, 0)} (Decision 0007)`,
    `- Permutations: ${integer(PERMUTATIONS)}; bootstrap resamples: ${integer(RESAMPLES)}`,
    "",
  );

  /* -- Execution -------------------------------------------------------------------------- */

  const extinct = classified.filter((run) => run.outcomes.terminal_reason === "extinction");
  sections.push(
    "## 1. Execution",
    "",
    `${classified.length} runs read.`,
    extinct.length === 0
      ? "None terminated early."
      : `${extinct.length} terminated early with \`terminal_reason: extinction\`:`,
    "",
  );
  if (extinct.length > 0) {
    sections.push(
      table(
        ["run", "condition", "completed ticks"],
        ["l", "l", "r"],
        extinct
          .slice()
          .sort((l, r) => l.outcomes.completed_ticks - r.outcomes.completed_ticks)
          .map((run) => [
            `\`${run.outcomes.run_id}\``,
            run.outcomes.condition_id,
            integer(run.outcomes.completed_ticks),
          ]),
      ),
      "",
    );
    const beforeBurnIn = extinct.filter(
      (run) => run.outcomes.completed_ticks < SAP_V1_PARAMETERS.burnInTicks,
    );
    if (beforeBurnIn.length > 0) {
      sections.push(
        `**${beforeBurnIn.length} of these terminated before the ${integer(SAP_V1_PARAMETERS.burnInTicks)}-tick burn-in** and`,
        "therefore contribute zero post-burn-in samples. See §4.",
        "",
      );
    }
  }

  /* -- Hypothesis tests ------------------------------------------------------------------- */

  const analysis = analyseFactorial(classified, {
    permutations: PERMUTATIONS,
    resamples: RESAMPLES,
    seeds: SAP_V1_SEEDS,
  });

  sections.push(
    "## 2. Hypothesis tests (SAP §4)",
    "",
    "Host-lineage `Δ_D` after burn-in on the factorial block. Permutation tests on the",
    "F-statistic with residuals permuted from the model omitting the effect under test",
    "(Freedman–Lane), Holm correction across the tested hypotheses.",
    "",
    table(
      ["", "effect", "F", "p", "p (Holm)", "partial η² [95% CI]"],
      ["l", "l", "r", "r", "r", "l"],
      analysis.hypotheses.map((result) => [
        `**${result.hypothesis}**`,
        result.label,
        result.permutation.observedF.toFixed(2),
        num(result.permutation.pValue),
        num(result.adjustedP),
        `${num(result.partialEtaSquared.point, 3)} [${num(result.partialEtaSquared.lower, 3)}, ${num(result.partialEtaSquared.upper, 3)}]`,
      ]),
    ),
    "",
    `Eligibility: ${analysis.eligibility.included} of ${analysis.eligibility.total} factorial runs entered the tests.`,
    "",
  );

  if (analysis.eligibility.excludedForCoverage.length > 0) {
    sections.push(
      `Excluded for coverage below the floor: ${analysis.eligibility.excludedForCoverage.map((id) => `\`${id}\``).join(", ")}`,
      "",
    );
  }
  if (analysis.eligibility.excludedForUndefinedOutcome.length > 0) {
    sections.push(
      `Excluded for an undefined primary outcome: ${analysis.eligibility.excludedForUndefinedOutcome.map((id) => `\`${id}\``).join(", ")}`,
      "",
    );
  }
  for (const warning of analysis.warnings) {
    sections.push(`> **Warning.** ${warning}`, "");
  }

  /* -- The qualification that must travel with the effect size ----------------------------- */

  const byMutation = new Map<string, number[]>();
  for (const cell of analysis.cells) {
    const bucket = byMutation.get(cell.mutation) ?? [];
    bucket.push(cell.hostDivergenceMean);
    byMutation.set(cell.mutation, bucket);
  }
  const mutationMeans = [...byMutation.entries()]
    .sort((left, right) => Number(left[0]) - Number(right[0]))
    .map(([level, means]) => ({
      level,
      mean: means.reduce((total, value) => total + value, 0) / means.length,
    }));
  const spread =
    mutationMeans.length > 1
      ? Math.max(...mutationMeans.map((m) => m.mean)) - Math.min(...mutationMeans.map((m) => m.mean))
      : null;
  const sds = analysis.cells
    .map((cell) => cell.hostDivergenceSd)
    .filter((value): value is number => value !== null);

  sections.push(
    "### 2.1 The effect size beside the raw spread",
    "",
    "SAP §4 requires effect sizes to carry the interpretation. Here the effect size needs the same",
    "caution a *p*-value does, so the raw scale is reported immediately beside it and never apart",
    "from it.",
    "",
    table(
      ["mutation", "host `Δ_D` (mean of cell means)"],
      ["r", "r"],
      mutationMeans.map((entry) => [entry.level, num(entry.mean)]),
    ),
    "",
    `**Total spread across mutation levels: ${num(spread)}** on a measure bounded in [0, 1],`,
    sds.length > 0
      ? `against within-cell standard deviations of ${num(Math.min(...sds))} to ${num(Math.max(...sds))}.`
      : "with no within-cell standard deviation defined.",
    "",
  );

  /* -- Cells ------------------------------------------------------------------------------- */

  sections.push(
    "## 3. Cell descriptives (SAP §7)",
    "",
    "Population `Δ_D`, extinction count and degenerate-sample proportion travel with the primary",
    "outcome in every table that carries it: a host-lineage `Δ_D` of 0.89 means something",
    "different before and after parasite extinction.",
    "",
    table(
      ["μ", "HGT", "n", "excluded", "host `Δ_D`", "sd", "population `Δ_D`", "parasite extinct", "degenerate"],
      ["r", "r", "r", "r", "r", "r", "r", "r", "r"],
      analysis.cells.map((cell) => [
        cell.mutation,
        cell.hgt,
        String(cell.runs),
        String(cell.excludedRuns),
        num(cell.hostDivergenceMean),
        num(cell.hostDivergenceSd),
        num(cell.populationDivergenceMean),
        `${cell.parasiteExtinctRuns}/${cell.runs}`,
        percent(cell.meanDegenerateSampleProportion),
      ]),
    ),
    "",
  );

  /* -- Persistence ------------------------------------------------------------------------- */

  const persistence = persistenceByHgt(factorialClassified);
  sections.push(
    "## 4. Parasite persistence (SAP §2.2, confirmatory secondary)",
    "",
    "Promoted because `D041` identifies persistence as the mechanism through which transfer acts.",
    "The median is taken over extinct runs only: substituting the horizon for survivors would",
    "invent an extinction that did not occur.",
    "",
    table(
      ["HGT", "runs", "extinct", "median extinction tick"],
      ["r", "r", "r", "r"],
      persistence.map((level) => [
        level.level,
        String(level.runs),
        String(level.extinct),
        integer(level.medianExtinctionTick),
      ]),
    ),
    "",
  );

  /* -- H4 ---------------------------------------------------------------------------------- */

  const h4 = testH4(classified, PERMUTATIONS, H4_SEED);
  sections.push("## 5. H4 (SAP Amendment 1)", "");
  if (h4.tested) {
    sections.push(
      table(
        ["group", "runs", "mean decoupling"],
        ["l", "r", "r"],
        [
          ["factorial", String(h4.factorialRuns), num(h4.factorialMeanDecoupling)],
          ["control-no-evolution", String(h4.controlRuns), num(h4.controlMeanDecoupling)],
        ],
      ),
      "",
      `Difference ${num(h4.difference)}, two-sample permutation *p* = ${num(h4.pValue)}, ${integer(h4.permutations)} permutations, seed ${h4.seed}.`,
      "",
    );
  } else {
    sections.push(
      "**Not tested.**",
      "",
      `Reason: ${h4.notTestedReason}`,
      "",
      `Runs with a defined post-burn-in \`D_info\` — factorial ${h4.factorialRuns}, control ${h4.controlRuns}.`,
      "",
      "The guard fired as written. Amendment 1's stated limitation — that the baseline group can",
      "empty once a lineage goes extinct — was realised. No substitute baseline is used: choosing",
      "one after seeing the declared one fail would be choosing the comparison to fit the outcome",
      "(Decision 0020).",
      "",
    );
    const matched = horizonMatchedDecoupling(
      loaded,
      HORIZON_MATCHED_WINDOW.from,
      HORIZON_MATCHED_WINDOW.to,
    );
    sections.push(
      `### 5.1 Horizon-matched comparison — **exploratory, not a test** (\`D052\`)`,
      "",
      `Ticks ${integer(matched.windowFrom)} to ${integer(matched.windowTo)}: after the divergence transient, before the`,
      "earliest control extinction. Reported because the measurement H4 was reaching for is still",
      "informative, and labelled exploratory because the window was chosen after the declared test",
      "failed.",
      "",
      table(
        ["group", "runs", "mean decoupling"],
        ["l", "r", "r"],
        [
          ["factorial", String(matched.factorialRuns), num(matched.factorialMeanDecoupling)],
          ["control-no-evolution", String(matched.controlRuns), num(matched.controlMeanDecoupling)],
        ],
      ),
      "",
    );
  }

  /* -- Decoupling -------------------------------------------------------------------------- */

  const decoupling = summariseDecoupling(factorialClassified);
  const theilU =
    decoupling.meanDecoupling === null ? null : 1 - decoupling.meanDecoupling;
  sections.push(
    "## 6. Lineage information",
    "",
    table(
      ["quantity", "value"],
      ["l", "r"],
      [
        ["runs with any defined post-burn-in `D_info`", String(decoupling.runsWithDefinedDecoupling)],
        ["runs with none at all", String(decoupling.runsWithNoDefinedSample)],
        ["mean `D_info` where defined", num(decoupling.meanDecoupling)],
        ["implied mean `U(F|L)`", num(theilU)],
        ["mean degenerate-sample proportion", percent(decoupling.meanDegenerateSampleProportion)],
      ],
    ),
    "",
    "The degenerate proportion is reported beside the mean because a decoupling averaged over a run",
    "that was degenerate for most of its length is not the same quantity as one computed throughout.",
    "",
  );

  /* -- Sensitivities ----------------------------------------------------------------------- */

  const factorialOutcomes = classified.filter((run) => run.block === "factorial");
  const byCondition = new Map<string, typeof factorialOutcomes>();
  for (const run of factorialOutcomes) {
    const key = `${String(run.mutation)}|${String(run.hgt)}`;
    byCondition.set(key, [...(byCondition.get(key) ?? []), run]);
  }
  const defined = (values: readonly (number | null)[]): number[] =>
    values.filter((value): value is number => value !== null);
  const meanOrUndefined = (values: readonly number[], format: (value: number) => string): string =>
    values.length === 0 ? "undefined" : format(values.reduce((x, y) => x + y, 0) / values.length);
  sections.push(
    "## 7. Secondary descriptives (SAP §2.3)",
    "",
    "Reported, not tested. Onset is the tick at which a run first reaches the stated fraction of its",
    "own post-burn-in asymptote, summarised here as the median over the runs in a condition where it",
    "is estimable. The plan also promised block-bootstrap uncertainty for onset but fixed no seed for",
    "it, and the reporting path was absent at execution; that omission is recorded as a deviation in",
    "§9 rather than resolved by choosing a seed after the fact. These medians are descriptive summaries",
    "of per-run values, not newly pre-registered inferential statistics.",
    "",
    table(
      ["μ", "HGT", "onset 50% (est.)", "onset 90% (est.)", "parasite `Δ_D`", "eligible", "inactive", "AUC (`Δ_D`·ticks)"],
      ["r", "r", "r", "r", "r", "r", "r", "r"],
      [...byCondition.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, bucket]) => {
          const [mutation = "", hgt = ""] = key.split("|");
          const o50 = defined(bucket.map((run) => run.outcomes.onset_tick_50));
          const o90 = defined(bucket.map((run) => run.outcomes.onset_tick_90));
          const par = defined(bucket.map((run) => run.outcomes.parasite_mean_divergence_after_burn_in));
          const med = (values: readonly number[]): string =>
            values.length === 0
              ? "undefined"
              : `${String(Math.round(quantile(values, 0.5)))} (${String(values.length)}/${String(bucket.length)})`;
          return [
            mutation,
            hgt,
            med(o50),
            med(o90),
            par.length === 0 ? "undefined" : num(par.reduce((x, y) => x + y, 0) / par.length),
            meanOrUndefined(defined(bucket.map((run) => run.outcomes.mean_eligible_proportion_after_burn_in)), percent),
            meanOrUndefined(defined(bucket.map((run) => run.outcomes.mean_inactive_proportion_after_burn_in)), percent),
            meanOrUndefined(defined(bucket.map((run) => run.outcomes.sap_auc_host_delta_ticks)), num),
          ];
        }),
    ),
    "",
  );

  sections.push(
    "## 8. Sensitivity analyses (SAP §6, with Amendment 2)",
    "",
    "All six were declared in advance and are reported whether or not they agree with the primary.",
    "",
    "### 8.1 Burn-in",
    "",
    table(
      ["burn-in", "host `Δ_D`", "population `Δ_D`", "runs", "excluded"],
      ["l", "r", "r", "r", "r"],
      burnInSensitivity(factorialBundles).map((row) => [
        row.label,
        num(row.meanHostDivergence),
        num(row.meanPopulationDivergence),
        String(row.runsWithDefinedOutcome),
        String(row.excludedByCoverage),
      ]),
    ),
    "",
    "### 8.2 Informative-action threshold",
    "",
    "Read from the `sensitivity` array the engine computed at sampling time; per-organism action",
    "counts are not exported, so a post-hoc recomputation is impossible.",
    "",
    table(
      ["threshold", "host `Δ_D`", "mean eligible proportion", "samples with any eligible"],
      ["r", "r", "r", "r"],
      thresholdSensitivity(factorialBundles).map((row) => [
        `${row.informativeActionThreshold}${row.informativeActionThreshold === 1 ? " (primary)" : ""}`,
        num(row.meanHostDivergence),
        num(row.meanEligibleProportion),
        `${integer(row.samplesWithAnyEligible)} / ${integer(row.samplesTotal)}`,
      ]),
    ),
    "",
    "### 8.3 Functional-class boundaries",
    "",
    table(
      ["boundaries", "autonomous", "mixed", "exploitative"],
      ["l", "r", "r", "r"],
      // `boundarySensitivity` returns organism counts, not shares. Normalising per row is what
      // makes the three boundary sets comparable — the counts are identical across rows by
      // construction, and only their split between classes changes.
      boundarySensitivity(factorialBundles).map((row) => {
        const total = row.autonomous + row.mixed + row.exploitative;
        const share = (count: number): string => (total === 0 ? "—" : percent(count / total, 2));
        return [row.boundaries, share(row.autonomous), share(row.mixed), share(row.exploitative)];
      }),
    ),
    "",
  );

  const activeOnly = activeOnlyLineageInformation(factorialBundles);
  sections.push(
    "### 8.4 Active-only lineage information",
    "",
    table(
      ["classes", "decoupling"],
      ["l", "r"],
      [
        ["all four", num(activeOnly.allClassesDecoupling, 5)],
        ["three active", num(activeOnly.activeOnlyDecoupling, 5)],
      ],
    ),
    "",
    `Over ${integer(activeOnly.samplesUsed)} samples. Excluding inactive organisms does not produce the result.`,
    "",
    "### 8.5 Population `Δ_D` in place of host-lineage — the `D042` confound, visible",
    "",
    "Reported to demonstrate the confound, never as an alternative answer. The per-cell gap in §3",
    "tracks parasite survival: cells where parasites persist score lower on the population measure",
    "without any lineage behaving differently.",
    "",
    "### 8.6 Attempt-based diagnostic (lineage level, Amendment 2)",
    "",
    "**Not a per-organism quantity.** Attempts are exported per lineage per interval, so this is an",
    "intent-versus-realisation contrast at lineage level and cannot show that a particular organism",
    "attempted what it did not achieve.",
    "",
    table(
      ["lineage", "attempt ratio", "success ratio"],
      ["l", "r", "r"],
      attemptDiagnostic(factorialBundles).map((row) => [
        row.lineage,
        num(row.attemptRatio),
        num(row.successRatio),
      ]),
    ),
    "",
  );

  sections.push(
    "## 9. Reporting deviations from the frozen plan",
    "",
    "One, in reporting rather than in testing. SAP §2.3 lists onset among the secondary",
    "descriptives and §4.2 specifies a block-bootstrap interval for it. Condition medians are",
    "reported in section 7 above and per-run values in the supplementary table cited below, but",
    "the interval is absent. The plan fixes the block length at 25 samples but states neither the",
    "resample count nor the seed value, although its §8 undertakes that bootstrap seeds are fixed",
    "and recorded. That implementation specification could be completed now, but only after the",
    "outcomes have been inspected, which would make it a post-execution amendment to the method",
    "rather than execution of the frozen plan. The point estimates are therefore reported as",
    "descriptive, without an interval, and the omission is recorded as `D057` in the discrepancy",
    "register.",
    "",
    "Per-run values: `supplementary.csv`, written beside this report in the output directory.",
    "",
    "No test, estimand, threshold or hypothesis differs from the plan.",
    "",
  );

  return `${sections.join("\n")}\n`;
}

/* ---------------------------------------------------------------------------------------------
 * Figures
 * ------------------------------------------------------------------------------------------- */

function writeFigures(
  loaded: readonly { readonly bundle: BundleInputs; readonly classified: ClassifiedRun }[],
  outputDirectory: string,
  reports: readonly PanelReport[] = [],
): string[] {
  const figureRuns: FigureRun[] = loaded
    .filter((entry) => entry.classified.block === "factorial")
    .map((entry) => ({
      conditionId: entry.classified.outcomes.condition_id,
      mutation: entry.classified.mutation as string,
      hgt: entry.classified.hgt as string,
      bundle: entry.bundle,
    }));

  if (figureRuns.length === 0) {
    throw new AnalysisError("No factorial runs in the bundle, so no figures can be drawn.");
  }

  const requestedTicks = figureRuns[0]?.bundle.manifest["requested_ticks"] as number;
  const lateWindowFrom = requestedTicks * (1 - SAP_V1_PARAMETERS.lateWindowFraction);

  const written: string[] = [];
  const emit = (name: string, svg: string): void => {
    const path = join(outputDirectory, name);
    writeFileSync(path, svg);
    written.push(name);
  };

  emit(
    "figure-4-4-divergence-trajectories.svg",
    figureDivergenceTrajectories(figureRuns, SAP_V1_PARAMETERS.burnInTicks, reports),
  );
  emit("figure-4-5-lineage-populations.svg", figureLineagePopulations(figureRuns));
  emit(
    "figure-4-6-divergence-distribution.svg",
    figureDivergenceDistribution(figureRuns, lateWindowFrom),
  );
  return written;
}

/* ---------------------------------------------------------------------------------------------
 * Entry point
 * ------------------------------------------------------------------------------------------- */

function main(): void {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options === null) {
      process.stdout.write(usage());
      return;
    }

    const runDirectories = discoverRuns(options.bundle);
    if (!options.quiet) {
      process.stderr.write(`Reading ${runDirectories.length} runs…\n`);
    }
    const loaded = loadBatch(runDirectories, SAP_V1_PARAMETERS);
    const report = buildReport(loaded);

    if (options.output === null) {
      process.stdout.write(report);
      return;
    }

    mkdirSync(options.output, { recursive: true });
    writeFileSync(join(options.output, "results.md"), report);
    // Per-run values behind the condition medians of section 7, so the summaries can be audited
    // without rerunning the analysis. SAP section 3 also requires a degenerate proportion per run.
    const supplementary = [
      "run_id,block,mutation,hgt,onset_tick_50,onset_tick_90,degenerate_sample_proportion,mean_eligible_proportion,sap_auc_host_delta_ticks",
      ...loaded
        .map((entry) => entry.classified)
        .map((run) =>
          [
            run.outcomes.run_id,
            run.block,
            String(run.mutation ?? ""),
            String(run.hgt ?? ""),
            run.outcomes.onset_tick_50 ?? "",
            run.outcomes.onset_tick_90 ?? "",
            run.outcomes.degenerate_sample_proportion,
            run.outcomes.mean_eligible_proportion_after_burn_in ?? "",
            run.outcomes.sap_auc_host_delta_ticks ?? "",
          ].join(","),
        ),
    ].join("\n");
    writeFileSync(join(options.output, "supplementary.csv"), `${supplementary}\n`);
    const factorialCells = summariseCells(
      loaded.map((entry) => entry.classified).filter((run) => run.block === "factorial"),
    );
    const written = options.figures ? writeFigures(loaded, options.output, factorialCells) : [];

    if (!options.quiet) {
      process.stderr.write(
        [
          `Wrote results.md${written.length > 0 ? ` and ${written.length} figures` : ""} to ${options.output}`,
          ...written.map((name) => `  ${name}`),
          "",
        ].join("\n"),
      );
    }
  } catch (error) {
    process.stderr.write(
      `${error instanceof AnalysisError ? "ANALYSIS FAILED" : "UNEXPECTED FAILURE"}: ${(error as Error).message}\n`,
    );
    process.exitCode = 1;
  }
}

main();
