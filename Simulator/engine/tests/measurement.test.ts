import { describe, expect, it } from "vitest";

import {
  calculateLineageInformation,
  classifyFunctionalBehaviour,
  FunctionalClass,
  measureOrganismBehaviour,
  nearestRank,
  summariseDivergence,
  type OrganismBehaviourMeasurement,
} from "../src/measurement/divergence.js";
import {
  createBehaviourWindow,
  Lineage,
  type OrganismState,
} from "../src/domain/organism.js";
import { createVmState } from "../src/vm/machine.js";

const boundaries = {
  autonomous_max: { numerator: 1, denominator: 10 },
  exploitative_min: { numerator: 9, denominator: 10 },
};

function organism(
  lineage: OrganismState["lineage"],
  autonomousSuccesses: number,
  exploitativeSuccesses: number,
): OrganismState {
  const buckets = createBehaviourWindow(2);
  const first = buckets[0];
  if (first === undefined) {
    throw new Error("Missing test bucket.");
  }
  first.bucket_number = 0;
  first.autonomous_successes = autonomousSuccesses;
  first.exploitative_successes = exploitativeSuccesses;
  return {
    id: lineage === Lineage.Host ? 0 : 1,
    parent_id: null,
    lineage,
    generation: 0,
    coordinate: { x: 0, y: 0 },
    genome: [0],
    vm: createVmState({ id: 0, input_a: 1, input_b: 2 }),
    energy: 1,
    age_ticks: 0,
    reproduction_cooldown: 0,
    behaviour_buckets: buckets,
  };
}

function syntheticMeasurement(
  id: number,
  lineage: OrganismState["lineage"],
  functionalClass: OrganismBehaviourMeasurement["functional_class"],
): OrganismBehaviourMeasurement {
  return {
    organism_id: id,
    lineage,
    generation: 0,
    autonomous_successes: functionalClass === FunctionalClass.Autonomous ? 1 : 0,
    exploitative_successes: functionalClass === FunctionalClass.Exploitative ? 1 : 0,
    informative_actions: functionalClass === FunctionalClass.Inactive ? 0 : 1,
    exploitative_tendency:
      functionalClass === FunctionalClass.Inactive
        ? null
        : functionalClass === FunctionalClass.Exploitative
          ? 1
          : 0,
    divergence: functionalClass === FunctionalClass.Inactive ? null : 0,
    functional_class: functionalClass,
  };
}

describe("behavioural divergence", () => {
  it("implements the construct-validity examples for host and parasite lineages", () => {
    const host = measureOrganismBehaviour(organism(Lineage.Host, 80, 20), 5, boundaries);
    const parasite = measureOrganismBehaviour(
      organism(Lineage.Parasite, 80, 20),
      5,
      boundaries,
    );

    expect(host.exploitative_tendency).toBe(0.2);
    expect(host.divergence).toBe(0.2);
    expect(host.functional_class).toBe(FunctionalClass.Mixed);
    expect(parasite.exploitative_tendency).toBe(0.2);
    expect(parasite.divergence).toBe(0.8);
  });

  it("classifies insufficient organisms as inactive without zero imputation", () => {
    const measurement = measureOrganismBehaviour(organism(Lineage.Host, 3, 1), 5, boundaries);
    expect(measurement.functional_class).toBe(FunctionalClass.Inactive);
    expect(measurement.exploitative_tendency).toBeNull();
    expect(measurement.divergence).toBeNull();
    expect(summariseDivergence([measurement])).toMatchObject({
      eligible_count: 0,
      inactive_count: 1,
      mean_divergence: null,
    });
  });

  it("uses exact rational boundary comparisons", () => {
    expect(classifyFunctionalBehaviour(9, 1, 1, boundaries)).toBe(
      FunctionalClass.Autonomous,
    );
    expect(classifyFunctionalBehaviour(1, 9, 1, boundaries)).toBe(
      FunctionalClass.Exploitative,
    );
    expect(classifyFunctionalBehaviour(8, 2, 1, boundaries)).toBe(FunctionalClass.Mixed);
  });

  it("uses nearest-rank empirical quantiles", () => {
    expect(nearestRank([4, 1, 3, 2], 0.25)).toBe(1);
    expect(nearestRank([4, 1, 3, 2], 0.5)).toBe(2);
    expect(nearestRank([4, 1, 3, 2], 0.75)).toBe(3);
    expect(nearestRank([], 0.5)).toBeNull();
  });

  it("reports perfect lineage information and complete decoupling in known tables", () => {
    const perfectlyAssociated = [
      syntheticMeasurement(0, Lineage.Host, FunctionalClass.Autonomous),
      syntheticMeasurement(1, Lineage.Host, FunctionalClass.Autonomous),
      syntheticMeasurement(2, Lineage.Parasite, FunctionalClass.Exploitative),
      syntheticMeasurement(3, Lineage.Parasite, FunctionalClass.Exploitative),
    ];
    expect(calculateLineageInformation(perfectlyAssociated)).toMatchObject({
      defined: true,
      undefined_reason: null,
      theil_u_function_given_lineage: 1,
      decoupling_score: 0,
    });

    const independent = [
      syntheticMeasurement(0, Lineage.Host, FunctionalClass.Autonomous),
      syntheticMeasurement(1, Lineage.Host, FunctionalClass.Exploitative),
      syntheticMeasurement(2, Lineage.Parasite, FunctionalClass.Autonomous),
      syntheticMeasurement(3, Lineage.Parasite, FunctionalClass.Exploitative),
    ];
    expect(calculateLineageInformation(independent)).toMatchObject({
      defined: true,
      undefined_reason: null,
      theil_u_function_given_lineage: 0,
      decoupling_score: 1,
    });
  });

  it("marks lineage extinction and zero functional entropy as distinct degeneracies", () => {
    const oneLineage = [
      syntheticMeasurement(0, Lineage.Host, FunctionalClass.Autonomous),
      syntheticMeasurement(1, Lineage.Host, FunctionalClass.Exploitative),
    ];
    expect(calculateLineageInformation(oneLineage)).toMatchObject({
      defined: false,
      undefined_reason: "single_lineage_degenerate",
      theil_u_function_given_lineage: null,
      decoupling_score: null,
    });

    const zeroEntropy = [
      syntheticMeasurement(0, Lineage.Host, FunctionalClass.Autonomous),
      syntheticMeasurement(1, Lineage.Parasite, FunctionalClass.Autonomous),
    ];
    expect(calculateLineageInformation(zeroEntropy)).toMatchObject({
      defined: false,
      undefined_reason: "zero_functional_entropy",
      theil_u_function_given_lineage: null,
      decoupling_score: null,
    });
  });
});
