import type { RationalProbability } from "../config/schema.js";
import { Lineage, type OrganismState } from "../domain/organism.js";

export const FunctionalClass = {
  Autonomous: "autonomous",
  Mixed: "mixed",
  Exploitative: "exploitative",
  Inactive: "inactive",
} as const;

export type FunctionalClass = (typeof FunctionalClass)[keyof typeof FunctionalClass];

export interface FunctionalBoundaries {
  readonly autonomous_max: RationalProbability;
  readonly exploitative_min: RationalProbability;
}

export interface OrganismBehaviourMeasurement {
  readonly organism_id: number;
  readonly lineage: OrganismState["lineage"];
  readonly generation: number;
  readonly autonomous_successes: number;
  readonly exploitative_successes: number;
  readonly informative_actions: number;
  readonly exploitative_tendency: number | null;
  readonly divergence: number | null;
  readonly functional_class: FunctionalClass;
}

/**
 * Bin count for the exported divergence histogram (D039).
 *
 * `research-questions.md` requires the full distribution of individual divergence to accompany
 * every `Δ_D`, because D019 forbids inferring multimodality from a spread statistic and D024
 * reserves "functional speciation" for demonstrated clustering. Quartiles cannot establish
 * bimodality; a fixed-width histogram can, at bounded cost — twenty integers per lineage per
 * sample, rather than one value per organism per sample.
 */
export const DIVERGENCE_HISTOGRAM_BINS = 20;

/**
 * Bins a divergence value in `[0, 1]` into `[0, DIVERGENCE_HISTOGRAM_BINS)`.
 *
 * Exactly 1 belongs in the final bin rather than overflowing, which matters here: a parasite-
 * lineage organism behaving fully autonomously, or a host behaving fully exploitatively, sits at
 * exactly 1 and is the most interesting value in the distribution.
 */
export function divergenceBin(divergence: number): number {
  const scaled = Math.floor(divergence * DIVERGENCE_HISTOGRAM_BINS);
  return Math.min(DIVERGENCE_HISTOGRAM_BINS - 1, Math.max(0, scaled));
}

export interface DivergenceSummary {
  readonly population_count: number;
  readonly eligible_count: number;
  readonly eligible_proportion: number | null;
  readonly inactive_count: number;
  readonly inactive_proportion: number | null;
  readonly mean_divergence: number | null;
  readonly median_divergence: number | null;
  readonly q25_divergence: number | null;
  readonly q75_divergence: number | null;
  /**
   * Counts of eligible organisms per equal-width divergence bin over `[0, 1]`. Length is always
   * `DIVERGENCE_HISTOGRAM_BINS`; the sum always equals `eligible_count`. Ineligible organisms are
   * excluded, exactly as they are from `mean_divergence` — an undefined divergence is not zero.
   */
  readonly divergence_histogram: readonly number[];
  readonly mean_exploitative_tendency: number | null;
  readonly autonomous_successes: number;
  readonly exploitative_successes: number;
}

export interface FunctionalClassCounts {
  readonly autonomous: number;
  readonly mixed: number;
  readonly exploitative: number;
  readonly inactive: number;
}

export interface LineageInformation {
  readonly defined: boolean;
  readonly undefined_reason:
    | "single_lineage_degenerate"
    | "zero_functional_entropy"
    | null;
  readonly theil_u_function_given_lineage: number | null;
  readonly decoupling_score: number | null;
  readonly function_entropy_bits: number;
  readonly mutual_information_bits: number;
}

function safeSum(values: readonly number[], label: string): number {
  let total = 0;
  for (const value of values) {
    const next = total + value;
    if (!Number.isSafeInteger(next)) {
      throw new RangeError(`${label} exceeds the safe-integer range.`);
    }
    total = next;
  }
  return total;
}

function ratioAtMost(
  numerator: number,
  denominator: number,
  boundary: RationalProbability,
): boolean {
  return (
    BigInt(numerator) * BigInt(boundary.denominator) <=
    BigInt(boundary.numerator) * BigInt(denominator)
  );
}

function ratioAtLeast(
  numerator: number,
  denominator: number,
  boundary: RationalProbability,
): boolean {
  return (
    BigInt(numerator) * BigInt(boundary.denominator) >=
    BigInt(boundary.numerator) * BigInt(denominator)
  );
}

export function classifyFunctionalBehaviour(
  autonomousSuccesses: number,
  exploitativeSuccesses: number,
  informativeThreshold: number,
  boundaries: FunctionalBoundaries,
): FunctionalClass {
  const informativeActions = safeSum(
    [autonomousSuccesses, exploitativeSuccesses],
    "informative actions",
  );
  if (informativeActions < informativeThreshold) {
    return FunctionalClass.Inactive;
  }
  if (ratioAtMost(exploitativeSuccesses, informativeActions, boundaries.autonomous_max)) {
    return FunctionalClass.Autonomous;
  }
  if (ratioAtLeast(exploitativeSuccesses, informativeActions, boundaries.exploitative_min)) {
    return FunctionalClass.Exploitative;
  }
  return FunctionalClass.Mixed;
}

export function measureOrganismBehaviour(
  organism: Readonly<OrganismState>,
  informativeThreshold: number,
  boundaries: FunctionalBoundaries,
): OrganismBehaviourMeasurement {
  const autonomousSuccesses = safeSum(
    organism.behaviour_buckets.map((bucket) => bucket.autonomous_successes),
    "autonomous successes",
  );
  const exploitativeSuccesses = safeSum(
    organism.behaviour_buckets.map((bucket) => bucket.exploitative_successes),
    "exploitative successes",
  );
  const informativeActions = safeSum(
    [autonomousSuccesses, exploitativeSuccesses],
    "informative actions",
  );
  const functionalClass = classifyFunctionalBehaviour(
    autonomousSuccesses,
    exploitativeSuccesses,
    informativeThreshold,
    boundaries,
  );
  const exploitativeTendency =
    functionalClass === FunctionalClass.Inactive
      ? null
      : exploitativeSuccesses / informativeActions;
  const divergence =
    exploitativeTendency === null
      ? null
      : organism.lineage === Lineage.Host
        ? exploitativeTendency
        : 1 - exploitativeTendency;

  return {
    organism_id: organism.id,
    lineage: organism.lineage,
    generation: organism.generation,
    autonomous_successes: autonomousSuccesses,
    exploitative_successes: exploitativeSuccesses,
    informative_actions: informativeActions,
    exploitative_tendency: exploitativeTendency,
    divergence,
    functional_class: functionalClass,
  };
}

/** Nearest-rank empirical quantile, with p in [0,1]. */
export function nearestRank(values: readonly number[], probability: number): number | null {
  if (values.length === 0) {
    return null;
  }
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new RangeError("Quantile probability must be in [0,1].");
  }
  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.max(1, Math.ceil(probability * sorted.length));
  return sorted[rank - 1] as number;
}

export function summariseDivergence(
  measurements: readonly OrganismBehaviourMeasurement[],
): DivergenceSummary {
  const eligible = measurements.filter((measurement) => measurement.divergence !== null);
  const divergences = eligible.map((measurement) => measurement.divergence as number);
  const tendencies = eligible.map(
    (measurement) => measurement.exploitative_tendency as number,
  );
  const mean = (values: readonly number[]): number | null =>
    values.length === 0 ? null : values.reduce((total, value) => total + value, 0) / values.length;
  const populationCount = measurements.length;
  const inactiveCount = populationCount - eligible.length;

  return {
    population_count: populationCount,
    eligible_count: eligible.length,
    eligible_proportion: populationCount === 0 ? null : eligible.length / populationCount,
    inactive_count: inactiveCount,
    inactive_proportion: populationCount === 0 ? null : inactiveCount / populationCount,
    mean_divergence: mean(divergences),
    median_divergence: nearestRank(divergences, 0.5),
    q25_divergence: nearestRank(divergences, 0.25),
    q75_divergence: nearestRank(divergences, 0.75),
    divergence_histogram: divergences.reduce<number[]>(
      (bins, divergence) => {
        bins[divergenceBin(divergence)] = (bins[divergenceBin(divergence)] as number) + 1;
        return bins;
      },
      Array.from({ length: DIVERGENCE_HISTOGRAM_BINS }, () => 0),
    ),
    mean_exploitative_tendency: mean(tendencies),
    autonomous_successes: safeSum(
      measurements.map((measurement) => measurement.autonomous_successes),
      "summary autonomous successes",
    ),
    exploitative_successes: safeSum(
      measurements.map((measurement) => measurement.exploitative_successes),
      "summary exploitative successes",
    ),
  };
}

export function countFunctionalClasses(
  measurements: readonly OrganismBehaviourMeasurement[],
): FunctionalClassCounts {
  const counts: Record<FunctionalClass, number> = {
    [FunctionalClass.Autonomous]: 0,
    [FunctionalClass.Mixed]: 0,
    [FunctionalClass.Exploitative]: 0,
    [FunctionalClass.Inactive]: 0,
  };
  for (const measurement of measurements) {
    counts[measurement.functional_class] += 1;
  }
  return counts;
}

function entropy(counts: readonly number[]): number {
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total === 0) {
    return 0;
  }
  return counts.reduce((result, count) => {
    if (count === 0) {
      return result;
    }
    const probability = count / total;
    return result - probability * Math.log2(probability);
  }, 0);
}

export function calculateLineageInformation(
  measurements: readonly OrganismBehaviourMeasurement[],
): LineageInformation {
  const classes = Object.values(FunctionalClass);
  const lineages = Object.values(Lineage);
  const classTotals = classes.map(
    (functionalClass) =>
      measurements.filter((measurement) => measurement.functional_class === functionalClass)
        .length,
  );
  const functionEntropy = entropy(classTotals);
  const representedLineages = new Set(measurements.map((measurement) => measurement.lineage));
  if (representedLineages.size < 2) {
    return {
      defined: false,
      undefined_reason: "single_lineage_degenerate",
      theil_u_function_given_lineage: null,
      decoupling_score: null,
      function_entropy_bits: functionEntropy,
      mutual_information_bits: 0,
    };
  }
  if (functionEntropy === 0) {
    return {
      defined: false,
      undefined_reason: "zero_functional_entropy",
      theil_u_function_given_lineage: null,
      decoupling_score: null,
      function_entropy_bits: functionEntropy,
      mutual_information_bits: 0,
    };
  }

  const lineageTotals = lineages.map(
    (lineage) => measurements.filter((measurement) => measurement.lineage === lineage).length,
  );
  let mutualInformation = 0;
  lineages.forEach((lineage, lineageIndex) => {
    classes.forEach((functionalClass, classIndex) => {
      const joint = measurements.filter(
        (measurement) =>
          measurement.lineage === lineage && measurement.functional_class === functionalClass,
      ).length;
      if (joint === 0) {
        return;
      }
      const jointProbability = joint / measurements.length;
      const lineageProbability = (lineageTotals[lineageIndex] as number) / measurements.length;
      const classProbability = (classTotals[classIndex] as number) / measurements.length;
      mutualInformation += jointProbability * Math.log2(jointProbability / (lineageProbability * classProbability));
    });
  });
  const uncertaintyCoefficient = mutualInformation / functionEntropy;
  return {
    defined: true,
    undefined_reason: null,
    theil_u_function_given_lineage: uncertaintyCoefficient,
    decoupling_score: 1 - uncertaintyCoefficient,
    function_entropy_bits: functionEntropy,
    mutual_information_bits: mutualInformation,
  };
}
