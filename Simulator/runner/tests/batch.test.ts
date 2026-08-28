import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { cpus, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { formatClock } from "../src/cli.js";
import {
  defaultConcurrency,
  executeBatch,
  mergeConfiguration,
  resolveRunConfiguration,
} from "../src/batch.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "batch-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("configuration merging", () => {
  it("merges nested objects rather than replacing them", () => {
    const merged = mergeConfiguration(
      { duration: { completed_ticks: 4000, sample_every_ticks: 200 }, world: { width: 48 } },
      { duration: { completed_ticks: 500_000 } },
    );
    expect(merged).toEqual({
      duration: { completed_ticks: 500_000, sample_every_ticks: 200 },
      world: { width: 48 },
    });
  });

  it("replaces arrays instead of concatenating them", () => {
    expect(mergeConfiguration({ seeds: [1, 2, 3] }, { seeds: [9] })).toEqual({ seeds: [9] });
  });

  it("applies identity after overrides so a condition cannot rename its own run", () => {
    const resolved = resolveRunConfiguration(
      { identity: { run_id: "base", seed: 1, purpose: "formal" }, world: { width: 64 } },
      {
        run_id: "condition-a-seed-7",
        condition_id: "condition-a",
        replicate_id: 2,
        seed: 7,
        // A malicious or careless override must not win over the batch's own identity.
        overrides: { identity: { run_id: "something-else", seed: 999 } },
      },
    );
    const identity = resolved["identity"] as Record<string, unknown>;
    expect(identity["run_id"]).toBe("condition-a-seed-7");
    expect(identity["seed"]).toBe(7);
    expect(identity["replicate_id"]).toBe(2);
    expect(identity["purpose"]).toBe("formal");
  });
});

describe("batch validation", () => {
  const writeSpecification = (contents: unknown): string => {
    const path = join(root, "batch.json");
    writeFileSync(path, JSON.stringify(contents));
    return path;
  };

  it("rejects a specification with no runs", async () => {
    const path = writeSpecification({
      schema_version: "0.1.0",
      batch_id: "empty",
      base_configuration_path: "runner/presets/calibration-sweep-base-config-v9.json",
      fixture_path: "runner/presets/calibration-sweep-fixture-v6.json",
      runs: [],
    });
    await expect(executeBatch({ specificationPath: path, outputRoot: root })).rejects.toThrow(
      /declares no runs/,
    );
  });

  it("rejects a repeated run identifier before executing anything", async () => {
    const run = { run_id: "same", condition_id: "c", replicate_id: 0, seed: 1 };
    const path = writeSpecification({
      schema_version: "0.1.0",
      batch_id: "duplicate",
      base_configuration_path: "runner/presets/calibration-sweep-base-config-v9.json",
      fixture_path: "runner/presets/calibration-sweep-fixture-v6.json",
      runs: [run, { ...run, seed: 2 }],
    });
    await expect(executeBatch({ specificationPath: path, outputRoot: root })).rejects.toThrow(
      /repeats run_id "same"/,
    );
  });

  it("refuses to write into an existing batch directory", async () => {
    const path = writeSpecification({
      schema_version: "0.1.0",
      batch_id: "existing",
      base_configuration_path: "runner/presets/calibration-sweep-base-config-v9.json",
      fixture_path: "runner/presets/calibration-sweep-fixture-v6.json",
      runs: [{ run_id: "a", condition_id: "c", replicate_id: 0, seed: 1 }],
    });
    mkdirSync(join(root, "existing"), { recursive: true });
    await expect(executeBatch({ specificationPath: path, outputRoot: root })).rejects.toThrow(
      /already exists/,
    );
  });
});

describe("concurrency defaults", () => {
  it("never returns less than one worker", () => {
    expect(defaultConcurrency()).toBeGreaterThanOrEqual(1);
  });

  it("leaves at least half the cores free, because a long batch is a sustained thermal load", () => {
    const cores = cpus().length;
    expect(defaultConcurrency()).toBeLessThanOrEqual(Math.max(1, Math.floor(cores / 2)));
    expect(defaultConcurrency()).toBeLessThan(Math.max(2, cores));
  });
});

describe("clock formatting for long batches", () => {
  it("uses seconds under a minute", () => {
    expect(formatClock(0)).toBe("0s");
    expect(formatClock(45_000)).toBe("45s");
  });

  it("zero-pads seconds within minutes so columns line up in a log", () => {
    expect(formatClock(60_000)).toBe("1m 00s");
    expect(formatClock(215_000)).toBe("3m 35s");
  });

  it("drops to hours and minutes once past an hour", () => {
    expect(formatClock(42_300_000)).toBe("11h 45m");
    expect(formatClock(3_600_000)).toBe("1h 00m");
  });

  it("takes milliseconds — the seconds/millisecond mix-up produced 0.1 s heartbeats", () => {
    // 60 seconds expressed as seconds would format as 0s; as milliseconds it is a minute.
    expect(formatClock(60)).toBe("0s");
    expect(formatClock(60_000)).toBe("1m 00s");
  });
});
