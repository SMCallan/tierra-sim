import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { performance } from "node:perf_hooks";

import {
  attachBenchmarkStorage,
  type BenchmarkProgress,
  type BenchmarkReport,
} from "./benchmark.js";
import { exportCompletedRun } from "./export.js";
import type { CompletedRun } from "./types.js";

export interface BenchmarkExportOptions {
  readonly output_root: string;
  readonly workspace_root: string;
}

interface FileDescription {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(root: string, directory = root): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      paths.push(...(await walkFiles(root, path)));
    } else if (entry.isFile()) {
      paths.push(relative(root, path).split(sep).join("/"));
    }
  }
  return paths.sort();
}

async function describeFiles(root: string): Promise<FileDescription[]> {
  return Promise.all(
    (await walkFiles(root)).map(async (path) => {
      const contents = await readFile(join(root, path));
      return {
        path,
        bytes: (await stat(join(root, path))).size,
        sha256: createHash("sha256").update(contents).digest("hex"),
      };
    }),
  );
}

function prettyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  const text = String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function progressCsv(progress: readonly BenchmarkProgress[]): string {
  const rows = progress.map((item) => ({
    tick: item.tick,
    elapsed_ms: item.elapsed_ms,
    interval_ms: item.interval_ms,
    cumulative_ticks_per_second: item.cumulative_ticks_per_second,
    interval_ticks_per_second: item.interval_ticks_per_second,
    cumulative_activations_per_second: item.cumulative_activations_per_second,
    population: item.population,
    capacity: item.capacity,
    occupancy_proportion: item.occupancy_proportion,
    organisms_ever_born: item.organisms_ever_born,
    total_energy: item.total_energy,
    resource_total_stock: item.resource_total_stock,
    resource_stock_proportion: item.resource_stock_proportion,
    resource_depleted_cell_proportion: item.resource_depleted_cell_proportion,
    hgt_attempts: item.hgt_attempts,
    hgt_donor_opportunities: item.hgt_donor_opportunities,
    hgt_successes: item.hgt_successes,
    mutation_attempts: item.mutation_attempts,
    divergence_sample_tick: item.divergence_sample_tick,
    divergence_eligible_count: item.divergence_eligible_count,
    divergence_eligible_proportion: item.divergence_eligible_proportion,
    divergence_inactive_proportion: item.divergence_inactive_proportion,
    rss_bytes: item.memory.rss_bytes,
    heap_total_bytes: item.memory.heap_total_bytes,
    heap_used_bytes: item.memory.heap_used_bytes,
    external_bytes: item.memory.external_bytes,
    array_buffers_bytes: item.memory.array_buffers_bytes,
  }));
  if (rows.length === 0) {
    return "";
  }
  const columns = Object.keys(rows[0] as Record<string, unknown>);
  return `${[
    columns.map(csvCell).join(","),
    ...rows.map((row) =>
      columns.map((column) => csvCell((row as Record<string, unknown>)[column])).join(","),
    ),
  ].join("\n")}\n`;
}

export async function exportBenchmarkBundle(
  run: CompletedRun,
  report: BenchmarkReport,
  options: BenchmarkExportOptions,
): Promise<{ readonly path: string; readonly report: BenchmarkReport }> {
  if (!/^[A-Za-z0-9._-]+$/u.test(report.benchmark_id)) {
    throw new Error(
      "Benchmark identifier may contain only letters, numbers, dot, underscore, and hyphen.",
    );
  }
  const outputRoot = resolve(options.output_root);
  const finalDirectory = join(outputRoot, report.benchmark_id);
  await mkdir(outputRoot, { recursive: true });
  if (await pathExists(finalDirectory)) {
    throw new Error(
      `Benchmark directory already exists and will not be overwritten: ${finalDirectory}`,
    );
  }
  const tempDirectory = await mkdtemp(
    join(dirname(finalDirectory), `.${basename(finalDirectory)}.tmp-`),
  );

  try {
    const exportStartedAt = performance.now();
    const retainedRoot = join(tempDirectory, "retained-run");
    const retainedRunDirectory = await exportCompletedRun(run, {
      output_root: retainedRoot,
      workspace_root: options.workspace_root,
    });
    const retainedFiles = await describeFiles(retainedRunDirectory);
    const retainedBytes = retainedFiles.reduce((total, file) => total + file.bytes, 0);
    const completedReport = attachBenchmarkStorage(
      report,
      {
        retained_run_directory: relative(tempDirectory, retainedRunDirectory).split(sep).join("/"),
        retained_run_files: retainedFiles.length,
        retained_run_bytes: retainedBytes,
        bytes_per_completed_tick:
          report.completed_ticks === 0 ? 0 : retainedBytes / report.completed_ticks,
      },
      performance.now() - exportStartedAt,
    );
    await writeFile(
      join(tempDirectory, "benchmark-report.json"),
      prettyJson(completedReport),
      "utf8",
    );
    await writeFile(
      join(tempDirectory, "progress.csv"),
      progressCsv(completedReport.progress),
      "utf8",
    );
    const described = await describeFiles(tempDirectory);
    await writeFile(
      join(tempDirectory, "checksums.sha256"),
      `${described.map((file) => `${file.sha256}  ${file.path}`).join("\n")}\n`,
      "utf8",
    );
    await rename(tempDirectory, finalDirectory);
    return { path: finalDirectory, report: completedReport };
  } catch (error) {
    await rm(tempDirectory, { recursive: true, force: true });
    throw error;
  }
}
