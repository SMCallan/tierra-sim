import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DeathCause,
  EcologicalOperation,
  EcologicalResultCode,
  Lineage,
  Opcode,
  parseEngineConfig,
  sha256,
  SimulationEngine,
  type EngineConfig,
} from "@tierra-sim/engine";
import { afterEach, describe, expect, it } from "vitest";

import { exportCompletedRun } from "../src/export.js";
import { executeBenchmark } from "../src/benchmark.js";
import { exportBenchmarkBundle } from "../src/benchmark-export.js";
import { requiredCalibrationSweepPath } from "../src/cli-options.js";
import { executeAndExportCalibrationSweep } from "../src/calibration-export.js";
import {
  calibrationEvidenceInterpretation,
  evaluateConfirmationAssessment,
  executeCalibrationSweep,
  loadCalibrationSweep,
  type ConfirmationCandidateObservation,
} from "../src/calibration-sweep.js";
import { executeRun } from "../src/run.js";
import { nodeSha256 } from "../src/node-sha256.js";

const runnerRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(runnerRoot, "..");
const temporaryDirectories: string[] = [];

function numericLeaves(value: unknown): number[] {
  if (typeof value === "number") return [value];
  if (value === null || typeof value !== "object") return [];
  return Object.values(value as Record<string, unknown>).flatMap(numericLeaves);
}

async function inputs(): Promise<{ configuration: EngineConfig; fixture: unknown }> {
  const configuration = JSON.parse(
    await readFile(join(runnerRoot, "presets/demo-config.json"), "utf8"),
  ) as EngineConfig;
  const fixture = JSON.parse(
    await readFile(join(runnerRoot, "presets/demo-fixture.json"), "utf8"),
  ) as unknown;
  configuration.identity.run_id = "runner-validation";
  configuration.duration.completed_ticks = 40;
  configuration.duration.checkpoint_every_ticks = 20;
  configuration.measurement.detailed_event_logging = false;
  return { configuration, fixture };
}

async function calibrationInputs() {
  return loadCalibrationSweep(
    join(runnerRoot, "presets/calibration-sweep-v1.json"),
    workspaceRoot,
  );
}

async function currentCalibrationInputs() {
  return loadCalibrationSweep(
    join(runnerRoot, "presets/calibration-sweep-v6.json"),
    workspaceRoot,
  );
}

async function donorCompatibilityControlInputs() {
  return loadCalibrationSweep(
    join(runnerRoot, "presets/exec-nbr-donor-compatibility-control-v7.json"),
    workspaceRoot,
  );
}

async function resourceCalibrationInputs() {
  return loadCalibrationSweep(
    join(runnerRoot, "presets/calibration-sweep-v8.json"),
    workspaceRoot,
  );
}

const confirmationRequirements = {
  minimum_ticks: 10_000,
  minimum_independent_seeds: 3,
  minimum_late_eligibility_proportion: 0.4,
  requires_full_5000_tick_behaviour_window: true,
} as const;

const passingConfirmationCandidates: readonly ConfirmationCandidateObservation[] = [
  {
    seed: 101,
    completed_ticks: 10_000,
    late_eligibility_proportion: 0.438,
    screening_passed: true,
  },
  {
    seed: 102,
    completed_ticks: 10_000,
    late_eligibility_proportion: 0.441,
    screening_passed: true,
  },
  {
    seed: 103,
    completed_ticks: 10_000,
    late_eligibility_proportion: 0.444,
    screening_passed: true,
  },
];

function confirmationAssessment(
  candidates: readonly ConfirmationCandidateObservation[] = passingConfirmationCandidates,
  sampleEveryTicks = 200,
  developmentOverride = false,
) {
  return evaluateConfirmationAssessment(
    confirmationRequirements,
    candidates,
    sampleEveryTicks,
    developmentOverride,
  );
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("headless experiment runner", () => {
  it("emits qualification-compatible interpretation when confirmation evidence is true", () => {
    const assessment = confirmationAssessment();
    const interpretation = calibrationEvidenceInterpretation(
      "resource_screen",
      assessment.confirmation_evidence,
      3,
    );

    expect(assessment.confirmation_evidence).toBe(true);
    expect(interpretation).toMatch(/may support qualification/u);
    expect(interpretation).toMatch(/not formal hypothesis-test evidence/u);
    expect(interpretation).not.toMatch(/cannot qualify confirmation/u);
    expect(interpretation).not.toMatch(/one-seed/u);
  });

  it("keeps a one-candidate non-confirming resource screen calibration-only", () => {
    const assessment = confirmationAssessment(
      passingConfirmationCandidates,
      200,
      true,
    );
    const interpretation = calibrationEvidenceInterpretation(
      "resource_screen",
      assessment.confirmation_evidence,
      1,
    );

    expect(assessment.confirmation_evidence).toBe(false);
    expect(assessment.development_override_absent).toBe(false);
    expect(interpretation).toMatch(/one-seed resource calibration screen/u);
    expect(interpretation).toMatch(/confirmation_evidence is false/u);
    expect(interpretation).toMatch(/cannot qualify confirmation/u);
  });

  it("fails confirmation when any candidate misses the minimum tick requirement", () => {
    const candidates = passingConfirmationCandidates.map((candidate, index) =>
      index === 0 ? { ...candidate, completed_ticks: 9_999 } : candidate,
    );
    const assessment = confirmationAssessment(candidates);

    expect(assessment.requirements.minimum_ticks).toEqual({
      declared: 10_000,
      observed: { minimum_completed_ticks: 9_999 },
      passed: false,
    });
    expect(assessment.confirmation_evidence).toBe(false);
  });

  it("fails confirmation when the independent-seed requirement is not met", () => {
    const candidates = passingConfirmationCandidates.map((candidate, index) =>
      index === 2 ? { ...candidate, seed: 102 } : candidate,
    );
    const assessment = confirmationAssessment(candidates);

    expect(assessment.requirements.minimum_independent_seeds).toEqual({
      declared: 3,
      observed: { distinct_seed_count: 2 },
      passed: false,
    });
    expect(assessment.confirmation_evidence).toBe(false);
  });

  it("fails confirmation when any candidate misses the late-eligibility requirement", () => {
    const candidates = passingConfirmationCandidates.map((candidate, index) =>
      index === 1 ? { ...candidate, late_eligibility_proportion: 0.399 } : candidate,
    );
    const assessment = confirmationAssessment(candidates);

    expect(assessment.requirements.minimum_late_eligibility_proportion).toEqual({
      declared: 0.4,
      observed: {
        minimum_late_eligibility_proportion: 0.399,
        maximum_late_eligibility_proportion: 0.444,
      },
      passed: false,
    });
    expect(assessment.confirmation_evidence).toBe(false);
  });

  it("fails confirmation when sampling cannot express a full 5000-tick behaviour window", () => {
    const assessment = confirmationAssessment(passingConfirmationCandidates, 300);

    expect(
      assessment.requirements.requires_full_5000_tick_behaviour_window,
    ).toEqual({
      declared: true,
      observed: {
        required_window_ticks: 5000,
        sample_every_ticks: 300,
        required_sample_count: null,
        minimum_completed_ticks: 10_000,
        every_candidate_has_full_window: false,
      },
      passed: false,
    });
    expect(assessment.confirmation_evidence).toBe(false);
  });

  it("emits declared, observed, and passing results when all confirmation requirements pass", () => {
    const assessment = confirmationAssessment();

    expect(Object.values(assessment.requirements).every((result) => result.passed)).toBe(true);
    expect(assessment.requirements.minimum_ticks.observed.minimum_completed_ticks).toBe(10_000);
    expect(
      assessment.requirements.minimum_independent_seeds.observed.distinct_seed_count,
    ).toBe(3);
    expect(
      assessment.requirements.minimum_late_eligibility_proportion.observed,
    ).toEqual({
      minimum_late_eligibility_proportion: 0.438,
      maximum_late_eligibility_proportion: 0.444,
    });
    expect(
      assessment.requirements.requires_full_5000_tick_behaviour_window.observed
        .required_sample_count,
    ).toBe(25);
    expect(assessment.confirmation_evidence).toBe(true);
  });

  it("keeps confirmation false when a development override is active", () => {
    const assessment = confirmationAssessment(
      passingConfirmationCandidates,
      200,
      true,
    );

    expect(Object.values(assessment.requirements).every((result) => result.passed)).toBe(true);
    expect(assessment.development_override_absent).toBe(false);
    expect(assessment.confirmation_evidence).toBe(false);
  });

  it("keeps confirmation false when any mandatory or ecological screening gate fails", () => {
    const candidates = passingConfirmationCandidates.map((candidate, index) =>
      index === 2 ? { ...candidate, screening_passed: false } : candidate,
    );
    const assessment = confirmationAssessment(candidates);

    expect(Object.values(assessment.requirements).every((result) => result.passed)).toBe(true);
    expect(assessment.all_candidates_screening_passed).toBe(false);
    expect(assessment.confirmation_evidence).toBe(false);
  });

  it("requires an explicit calibration sweep instead of selecting historical v6", () => {
    expect(() => requiredCalibrationSweepPath(new Map())).toThrow(/requires --sweep FILE/u);
    expect(
      requiredCalibrationSweepPath(new Map([["sweep", "runner/presets/calibration-sweep-v8.json"]])),
    ).toBe(resolve("runner/presets/calibration-sweep-v8.json"));
  });

  it("uses a native SHA-256 implementation equivalent to the portable engine", () => {
    for (const input of ["", "abc", "héllo", "digital life 🧬", "x".repeat(100_000)]) {
      expect(nodeSha256(input)).toBe(sha256(input));
    }
  });

  it("matches portable engine hashes and checkpoints exactly", async () => {
    const runInputs = await inputs();
    const completed = executeRun(runInputs);
    const portable = SimulationEngine.create(
      parseEngineConfig(runInputs.configuration),
      runInputs.fixture,
    );
    for (let tick = 0; tick < 20; tick += 1) {
      portable.stepTick();
    }

    expect(completed.checkpoints[0]?.checkpoint).toEqual(portable.checkpoint());
    const restoredPortable = SimulationEngine.restore(
      runInputs.configuration,
      completed.checkpoints[0]?.checkpoint,
    );
    expect(restoredPortable.stateHash()).toBe(
      completed.checkpoints[0]?.checkpoint.state_hash,
    );
    while (portable.terminalReason === null) {
      portable.stepTick();
    }
    expect(completed.final_state_hash).toBe(portable.stateHash());
  });

  it("produces deterministic measurements and checkpoints", async () => {
    const first = executeRun(await inputs());
    const second = executeRun(await inputs());

    expect(first.final_state_hash).toBe(second.final_state_hash);
    expect(first.samples).toEqual(second.samples);
    expect(first.checkpoints).toEqual(second.checkpoints);
    expect(first.lineage_records).toEqual(second.lineage_records);
    expect(first.samples).toHaveLength(2);
    expect(first.checkpoints).toHaveLength(2);
  });

  it("reports performance and ecological qualification diagnostics", async () => {
    const benchmarkInputs = await inputs();
    const completed = executeBenchmark({
      benchmark_id: "runner-benchmark-validation",
      ...benchmarkInputs,
      report_every_ticks: 20,
    });

    expect(completed.report.completed_ticks).toBe(40);
    expect(completed.report.report_schema_version).toBe("0.8.0");
    expect(completed.report.progress).toHaveLength(2);
    expect(completed.report.ecology.energy_balance.ledger_residual).toBe(0);
    expect(completed.report.ecology.energy_balance.source_event_residual).toBe(0);
    expect(completed.report.ecology.hgt_opportunity.splice_instruction_attempts).toBe(
      completed.run.final_counters.hgt_attempts,
    );
    expect(completed.report.ecology.mutation_exposure.attempted_total).toBe(
      completed.report.ecology.mutation_exposure.accepted_total +
        completed.report.ecology.mutation_exposure.rejected_total,
    );
    expect(completed.report.ecology.spatial_structure.final).not.toBeNull();
    const diagnostic = completed.report.ecology.lineage_diagnostics;
    expect(numericLeaves(diagnostic.identity_residuals).every((value) => value === 0)).toBe(true);
    expect(
      Object.values(
        diagnostic.operation_results[Lineage.Parasite][EcologicalOperation.ExecNbr],
      ).reduce((total, value) => total + value, 0),
    ).toBe(diagnostic.mechanisms[Lineage.Parasite].exploitative_attempts);
    expect(
      diagnostic.operation_results[Lineage.Parasite][EcologicalOperation.ExecNbr][
        EcologicalResultCode.Success
      ],
    ).toBe(diagnostic.mechanisms[Lineage.Parasite].exploitative_successes);
    expect(completed.report.storage).toBeNull();
  });

  it("attributes every death cause to ancestral lineage", async () => {
    const deathInputs = await inputs();
    deathInputs.configuration.world.exogenous_death_probability = {
      numerator: 1,
      denominator: 1,
    };
    const fixture = deathInputs.fixture as {
      ancestors: readonly { lineage: "host" | "parasite"; count: number }[];
    };
    const expected = (lineage: "host" | "parasite"): number =>
      fixture.ancestors
        .filter((ancestor) => ancestor.lineage === lineage)
        .reduce((total, ancestor) => total + ancestor.count, 0);
    const run = executeRun(deathInputs);
    const sample = run.samples[0];

    expect(run.terminal_reason).toBe("extinction");
    expect(run.completed_ticks).toBe(1);
    expect(sample?.lineage_death_causes.host[DeathCause.Exogenous]).toBe(
      expected("host"),
    );
    expect(sample?.lineage_death_causes.parasite[DeathCause.Exogenous]).toBe(
      expected("parasite"),
    );
    expect(sample?.lineage_death_causes.host[DeathCause.Energy]).toBe(0);
    expect(sample?.lineage_death_causes.parasite[DeathCause.Exploitation]).toBe(0);
    expect(run.final_counters.deaths_exogenous).toBe(
      expected("host") + expected("parasite"),
    );
  });

  it("runs the governed calibration fixture and excludes divergence outcomes from selection", async () => {
    const loaded = await currentCalibrationInputs();
    const fixture = loaded.fixture as {
      ancestors: readonly { lineage: string; genome: readonly number[] }[];
    };
    const host = fixture.ancestors.find((ancestor) => ancestor.lineage === "host");
    const parasite = fixture.ancestors.find((ancestor) => ancestor.lineage === "parasite");
    expect(host?.genome).toContain(Opcode.COPY);
    expect(parasite?.genome).not.toContain(Opcode.COPY);

    const first = await executeCalibrationSweep(loaded, {
      ticks_override: 40,
      candidate_limit: 1,
    });
    const second = await executeCalibrationSweep(loaded, {
      ticks_override: 40,
      candidate_limit: 1,
    });
    const candidate = first.candidates[0];

    expect(first.generated_candidate_count).toBe(6);
    expect(first.report_schema_version).toBe("0.6.0");
    expect(first.executed_candidate_count).toBe(1);
    expect(first.development_override.confirmation_evidence).toBe(false);
    expect(first.confirmation_candidate_ids).toEqual([]);
    expect(candidate?.final_state_hash).toBe(second.candidates[0]?.final_state_hash);
    expect(candidate?.energy_balance.ledger_residual).toBe(0);
    expect(candidate?.energy_balance.source_event_residual).toBe(0);
    expect(candidate?.computation.energy_credited).toBeGreaterThan(0);
    expect(candidate?.exec_nbr_attempt_cost).toBe(1);
    expect(candidate?.autonomous_reproduction_cost).toBe(45);
    expect(candidate?.reproduction_cooldown_ticks).toBe(10);
    expect(candidate?.spatial_structure.late_mean_host_parasite_contact_edges).not.toBeNull();
    expect(
      candidate?.lineage_diagnostics.whole_run.operation_results.parasite.exec_nbr,
    ).toBeDefined();
    expect(candidate?.lineage_diagnostics.late_window.death_causes.host).toBeDefined();
    const selectionPayload = JSON.stringify(candidate);
    expect(selectionPayload).not.toContain("mean_divergence");
    expect(selectionPayload).not.toContain("maximum_divergence");
    expect(selectionPayload).not.toContain("divergence_onset");
  });

  it("runs a governed donor-compatibility control without promoting either mechanism", async () => {
    const loaded = await donorCompatibilityControlInputs();
    const shortenedBase = structuredClone(loaded.base_configuration);
    shortenedBase.duration.completed_ticks = 40;
    const report = await executeCalibrationSweep({
      ...loaded,
      base_configuration: shortenedBase,
    });

    expect(report.stage).toBe("mechanism_control");
    expect(report.report_schema_version).toBe("0.6.0");
    expect(report.generated_candidate_count).toBe(2);
    expect(report.executed_candidate_count).toBe(2);
    expect(report.development_override.ticks).toBeNull();
    expect(report.confirmation_candidate_ids).toEqual([]);
    expect(report.candidates.map((candidate) => candidate.exec_nbr_donor_copy_rule).sort()).toEqual([
      "addressed_locus",
      "cyclic_copy_search",
    ]);
    expect(report.interpretation_notes.join(" ")).toMatch(/never promoted automatically/i);
  });

  it("runs the frozen v8 resource screen without selecting on final lineage abundance", async () => {
    const loaded = await resourceCalibrationInputs();
    const report = await executeCalibrationSweep(loaded, {
      ticks_override: 200,
      candidate_limit: 1,
    });
    const candidate = report.candidates[0];

    expect(report.stage).toBe("resource_screen");
    expect(report.report_schema_version).toBe("0.6.0");
    expect(report.generated_candidate_count).toBe(4);
    expect(report.confirmation_candidate_ids).toEqual([]);
    expect(report.prohibited_selection_inputs).toContain("final_lineage_abundance");
    expect(candidate?.resource_regeneration_per_tick).toBe(1);
    expect(candidate?.resource_harvest_per_activation).toBe(3);
    expect(candidate?.energy_balance.ledger_residual).toBe(0);
    expect(candidate?.energy_balance.source_event_residual).toBe(0);
    expect(candidate?.gates.energy_transfer_events_exact).toBe(true);
    expect(candidate?.gates.resource_events_exact).toBe(true);
    expect(candidate?.local_resources.cumulative_regenerated).toBeGreaterThan(0);
    expect(candidate?.local_resources.cumulative_harvested).toBeGreaterThan(0);
    expect(candidate?.local_resources.late_mean_stock_proportion).not.toBeNull();
    expect(report.interpretation_notes[0]).toMatch(/one-seed resource calibration screen/u);
    expect(report.interpretation_notes[0]).toMatch(/confirmation_evidence is false/u);
    expect(report.interpretation_notes.join(" ")).toMatch(/excludes final lineage abundance/i);
  });

  it("atomically retains a checksummed calibration hierarchy", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "tierra-calibration-test-"));
    temporaryDirectories.push(outputRoot);
    const loaded = await calibrationInputs();
    const exported = await executeAndExportCalibrationSweep(loaded, {
      output_root: outputRoot,
      workspace_root: workspaceRoot,
      ticks_override: 20,
      candidate_limit: 1,
    });

    expect(exported.path).toContain("__development__ticks-20__limit-1");
    expect(await readFile(join(exported.path, "candidates.csv"), "utf8")).toContain(
      "gate_energy_ledger_exact",
    );
    expect(await readFile(join(exported.path, "candidates.csv"), "utf8")).toContain(
      "whole_run_parasite_exec_nbr_donor_locus_not_copy",
    );
    expect(await readFile(join(exported.path, "candidates.csv"), "utf8")).toContain(
      "exec_nbr_donor_copy_rule",
    );
    expect(await readFile(join(exported.path, "sweep-report.json"), "utf8")).toContain(
      '"confirmation_evidence": false',
    );
    const checksums = await readFile(join(exported.path, "checksums.sha256"), "utf8");
    expect(checksums).toContain("sweep-specification.json");
    expect(checksums).toContain("candidates/");
    for (const line of checksums.trim().split("\n")) {
      const match = /^([a-f0-9]{64})  (.+)$/u.exec(line);
      expect(match).not.toBeNull();
      const contents = await readFile(join(exported.path, match?.[2] as string));
      expect(createHash("sha256").update(contents).digest("hex")).toBe(match?.[1]);
    }
    await expect(
      executeAndExportCalibrationSweep(loaded, {
        output_root: outputRoot,
        workspace_root: workspaceRoot,
        ticks_override: 20,
        candidate_limit: 1,
      }),
    ).rejects.toThrow(/will not be overwritten/u);
  });

  it("atomically retains a benchmark report beside its standard run payload", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "tierra-benchmark-test-"));
    temporaryDirectories.push(outputRoot);
    const benchmarkInputs = await inputs();
    benchmarkInputs.configuration.duration.completed_ticks = 20;
    const completed = executeBenchmark({
      benchmark_id: "retained-benchmark-validation",
      ...benchmarkInputs,
      report_every_ticks: 20,
    });
    const exported = await exportBenchmarkBundle(completed.run, completed.report, {
      output_root: outputRoot,
      workspace_root: workspaceRoot,
    });
    const report = JSON.parse(
      await readFile(join(exported.path, "benchmark-report.json"), "utf8"),
    ) as {
      storage: { retained_run_bytes: number };
      ecology: { energy_balance: { ledger_residual: number } };
    };

    expect(report.storage.retained_run_bytes).toBeGreaterThan(0);
    expect(report.ecology.energy_balance.ledger_residual).toBe(0);
    expect(await readFile(join(exported.path, "progress.csv"), "utf8")).toContain(
      "interval_ticks_per_second",
    );
    expect(await readFile(join(exported.path, "checksums.sha256"), "utf8")).toContain(
      "benchmark-report.json",
    );
    const checksums = await readFile(join(exported.path, "checksums.sha256"), "utf8");
    for (const line of checksums.trim().split("\n")) {
      const match = /^([a-f0-9]{64})  (.+)$/u.exec(line);
      expect(match).not.toBeNull();
      const contents = await readFile(join(exported.path, match?.[2] as string));
      expect(createHash("sha256").update(contents).digest("hex")).toBe(match?.[1]);
    }
    await expect(
      exportBenchmarkBundle(completed.run, completed.report, {
        output_root: outputRoot,
        workspace_root: workspaceRoot,
      }),
    ).rejects.toThrow(/will not be overwritten/u);
  });

  it("writes an atomic, checksummed, non-overwriting run directory", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "tierra-runner-test-"));
    temporaryDirectories.push(outputRoot);
    const exportInputs = await inputs();
    exportInputs.configuration.duration.completed_ticks = 20;
    exportInputs.configuration.measurement.detailed_event_logging = true;
    const run = executeRun(exportInputs);
    const finalDirectory = await exportCompletedRun(run, {
      output_root: outputRoot,
      workspace_root: workspaceRoot,
    });

    const checksums = await readFile(join(finalDirectory, "checksums.sha256"), "utf8");
    const lines = checksums.trim().split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(8);
    for (const line of lines) {
      const match = /^([a-f0-9]{64})  (.+)$/u.exec(line);
      expect(match).not.toBeNull();
      const expected = match?.[1] as string;
      const relativePath = match?.[2] as string;
      const contents = await readFile(join(finalDirectory, relativePath));
      expect(createHash("sha256").update(contents).digest("hex")).toBe(expected);
    }
    expect(await readFile(join(finalDirectory, "timeseries.csv"), "utf8")).toContain(
      "lineage_function_decoupling",
    );
    expect(await readFile(join(finalDirectory, "timeseries.csv"), "utf8")).toContain(
      "spatial_host_parasite_contact_edges",
    );
    expect(await readFile(join(finalDirectory, "timeseries.csv"), "utf8")).toContain(
      "interval_host_exec_nbr_donor_locus_not_copy",
    );
    expect(await readFile(join(finalDirectory, "timeseries.csv"), "utf8")).toContain(
      "interval_parasite_deaths_energy",
    );
    expect(await readFile(join(finalDirectory, "timeseries.csv"), "utf8")).toContain(
      "lineage_information_undefined_reason",
    );
    expect(await readFile(join(finalDirectory, "timeseries.csv"), "utf8")).toContain(
      "resource_stock_proportion",
    );
    expect(await readFile(join(finalDirectory, "lineage.csv"), "utf8")).toContain(
      "parent_id",
    );
    expect(await readFile(join(finalDirectory, "manifest.json"), "utf8")).toContain(
      '"state_hash_implementation": "node:crypto"',
    );
    expect(await readFile(join(finalDirectory, "manifest.json"), "utf8")).toContain(
      '"output_schema_version": "0.6.0"',
    );
    expect(await readFile(join(finalDirectory, "final-summary.json"), "utf8")).toContain(
      '"identity_residuals"',
    );
    const firstEvent = (await readFile(join(finalDirectory, "events/events.ndjson"), "utf8"))
      .split("\n")[0];
    expect(firstEvent).toContain('"run_id":"runner-validation"');
    expect(firstEvent).toMatch(/"lineage":"(?:host|parasite)"/u);
    await expect(
      exportCompletedRun(run, {
        output_root: outputRoot,
        workspace_root: workspaceRoot,
      }),
    ).rejects.toThrow(/will not be overwritten/u);
  });

  it("exports a run with a large lineage records array without call stack overflow", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "tierra-stack-test-"));
    temporaryDirectories.push(outputRoot);
    const exportInputs = await inputs();
    exportInputs.configuration.duration.completed_ticks = 20;
    const completedRun = executeRun(exportInputs);

    // Artificially populate a very large number of lineage records to test Math.max/reduce stack-safety
    const largeRecordsCount = 100_000;
    const run = {
      ...completedRun,
      lineage_records: Array.from({ length: largeRecordsCount }, (_, i) => ({
        organism_id: i,
        parent_id: i > 0 ? i - 1 : null,
        lineage: "host" as const,
        birth_tick: 0,
        death_tick: null,
        death_cause: null,
        generation: i, // so maximum generation is largeRecordsCount - 1
      })),
    };

    const finalDirectory = await exportCompletedRun(run, {
      output_root: outputRoot,
      workspace_root: workspaceRoot,
    });

    const summaryPath = join(finalDirectory, "final-summary.json");
    const summary = JSON.parse(await readFile(summaryPath, "utf8")) as {
      pedigree: { maximum_generation: number };
    };
    expect(summary.pedigree.maximum_generation).toBe(largeRecordsCount - 1);
  });

  it("loads and validates the frozen v9 calibration sweep preset", async () => {
    const sweepPath = join(runnerRoot, "presets/calibration-sweep-v9.json");
    const loaded = await loadCalibrationSweep(sweepPath, workspaceRoot);
    expect(loaded.specification.sweep_id).toBe("calibration-64x64-shared-resource-v9");
    expect(loaded.specification.schema_version).toBe("0.4.0");
    expect(loaded.base_configuration.energy.genome_maintenance.min_cost).toBe(1);
    expect(loaded.base_configuration.resources?.harvest_neighbourhood_radius).toBe(1);
    expect(loaded.specification.replicate_seeds).toHaveLength(3);
  });

  it("loads and validates the frozen v9 confirmation sweep preset", async () => {
    const sweepPath = join(runnerRoot, "presets/calibration-sweep-v9-confirmation.json");
    const loaded = await loadCalibrationSweep(sweepPath, workspaceRoot);
    expect(loaded.specification.sweep_id).toBe("calibration-64x64-shared-resource-v9-confirmation");
    expect(loaded.specification.schema_version).toBe("0.4.0");
    expect(loaded.base_configuration.energy.genome_maintenance.min_cost).toBe(1);
    expect(loaded.base_configuration.resources?.harvest_neighbourhood_radius).toBe(1);
    expect(loaded.specification.replicate_seeds).toHaveLength(3);
  });

  it("loads and validates the frozen formal experimental batch preset", async () => {
    const sweepPath = join(runnerRoot, "presets/formal-batch-v1.json");
    const loaded = await loadCalibrationSweep(sweepPath, workspaceRoot);
    expect(loaded.specification.sweep_id).toBe("formal-batch-v1");
    expect(loaded.specification.schema_version).toBe("0.4.0");
    expect(loaded.base_configuration.energy.genome_maintenance.min_cost).toBe(1);
    expect(loaded.base_configuration.resources?.harvest_neighbourhood_radius).toBe(1);
    expect(loaded.base_configuration.resources?.regeneration_per_tick).toBe(2);
    expect(loaded.base_configuration.resources?.harvest_per_activation).toBe(4);
    expect(loaded.specification.replicate_seeds).toHaveLength(5);
  });
});
