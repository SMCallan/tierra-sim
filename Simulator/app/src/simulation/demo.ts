import {
  canonicalJson,
  sha256,
  type AncestorFixture,
  type EngineConfig,
} from "@tierra-sim/engine";

import demoConfigurationJson from "../../../runner/presets/demo-config.json" with { type: "json" };
import demoFixture from "../../../runner/presets/demo-fixture.json" with { type: "json" };
import { BrowserSimulationSession, type SessionOverrides } from "./session.js";

const demoConfiguration = demoConfigurationJson as unknown as EngineConfig;

export const CockpitMode = {
  Explore: "explore",
  Research: "research",
} as const;

export type CockpitMode = (typeof CockpitMode)[keyof typeof CockpitMode];

const explorationFixture: AncestorFixture = {
  schema_version: "0.1.0",
  fixture_id: "dense-visual-ecology-v1",
  ancestors: [
    {
      lineage: "host",
      genome: [11, 0, 15, 0],
      count: 192,
      initial_energy: 200,
    },
    {
      lineage: "parasite",
      genome: [14, 0, 11, 15, 0],
      count: 64,
      initial_energy: 200,
    },
  ],
};

function explorationConfiguration(): EngineConfig {
  const configuration = structuredClone(demoConfiguration);
  configuration.identity.configuration_name = "dense-visual-exploration-v1";
  configuration.identity.purpose = "demonstration";
  configuration.identity.run_id = "visual-exploration";
  configuration.identity.condition_id = "dense-mixed-ecology";
  // Explore is an open-ended living world, not a fixed demo. This is a starting value the
  // Duration control overrides freely; the engine imposes no maximum (App.tsx accepts any
  // positive safe integer). Kept at a few thousand so a session shows real ecological turnover
  // rather than only the initial transient.
  configuration.duration.completed_ticks = 5000;
  configuration.duration.checkpoint_every_ticks = 100;
  configuration.identity.schema_version = "0.4.0";
  configuration.identity.engine_specification = "0.2";
  configuration.world.width = 48;
  configuration.world.height = 32;
  configuration.energy.environmental_income = 0;
  configuration.exploitation = { donor_copy_rule: "cyclic_copy_search" };
  configuration.resources = {
    mode: "local_renewable",
    cell_capacity: 120,
    initial_stock: 60,
    regeneration_per_tick: 1,
    harvest_per_activation: 4,
    // Decision 0016's shared neighbourhood depletion, which is what makes competition
    // density-dependent. The field is optional in the schema and defaults to 0, so omitting it
    // silently disabled the mechanism here while the prose described the system as having it.
    // A demonstration that omits a documented mechanism shows the wrong ecology.
    harvest_neighbourhood_radius: 1,
    regeneration_timing: "before_scheduler_snapshot",
    harvest_timing: "after_exogenous_before_instruction",
  };
  // Decision 0007's eligibility rule, which the formal programme uses and this view inherited
  // wrongly. `demo-config.json` asks for five informative actions inside a hundred-tick window;
  // the research configuration asks for one inside five thousand. The inherited bar is roughly
  // two hundred and fifty times higher per unit time, and the consequence was that no organism
  // was ever eligible: the interface reported `MEAN DIVERGENCE undefined` and `ELIGIBLE 0/N`
  // indefinitely, so the project's primary construct could not be seen in the interface built to
  // show it.
  //
  // The threshold is aligned with the formal configuration. The **window** is deliberately left
  // short: a five-thousand-tick window would mean nothing is measurable until tick 5,000, which
  // is four minutes of watching at this frame rate. A live view needs a measure that resolves in
  // seconds, and the eligibility rule is what has to match, not the averaging period.
  configuration.measurement.informative_action_threshold = 1;
  configuration.measurement.sensitivity_thresholds = [5, 10];
  configuration.initial_population.fixture_path = "app:fixtures/dense-visual-ecology-v1";
  configuration.initial_population.fixture_sha256 = sha256(canonicalJson(explorationFixture));
  configuration.initial_population.placement_algorithm = "shuffled_cells";
  return configuration;
}

export function createDemoSession(overrides: SessionOverrides = {}): BrowserSimulationSession {
  return BrowserSimulationSession.create(demoConfiguration, demoFixture, overrides);
}

export function createExploreSession(overrides: SessionOverrides = {}): BrowserSimulationSession {
  return BrowserSimulationSession.create(
    explorationConfiguration(),
    explorationFixture,
    overrides,
  );
}

export function createCockpitSession(
  mode: CockpitMode,
  overrides: SessionOverrides = {},
): BrowserSimulationSession {
  return mode === CockpitMode.Explore
    ? createExploreSession(overrides)
    : createDemoSession(overrides);
}

export function demoDefaults(): Readonly<{ seed: number; completed_ticks: number }> {
  return {
    seed: demoConfiguration.identity.seed,
    completed_ticks: demoConfiguration.duration.completed_ticks,
  };
}

export function cockpitDefaults(
  mode: CockpitMode,
): Readonly<{
  seed: number;
  completed_ticks: number;
  world_width: number;
  world_height: number;
}> {
  const configuration = mode === CockpitMode.Explore
    ? explorationConfiguration()
    : demoConfiguration;
  return {
    seed: configuration.identity.seed,
    completed_ticks: configuration.duration.completed_ticks,
    world_width: configuration.world.width,
    world_height: configuration.world.height,
  };
}

/**
 * Selectable session lengths. The engine imposes no maximum — `App.tsx` accepts any positive
 * safe integer — so these are discoverable starting points, not limits. `0` means open-ended
 * and is mapped to the largest safe tick budget rather than to a special case in the engine.
 */
export const DURATION_PRESETS: readonly { readonly label: string; readonly ticks: number }[] = [
  { label: "600 — first transient", ticks: 600 },
  { label: "5,000 — turnover", ticks: 5_000 },
  { label: "50,000 — deep time", ticks: 50_000 },
  { label: "Open-ended", ticks: Number.MAX_SAFE_INTEGER },
];

/** World presets: the Explore default and the 64x64 research world the protocols actually use. */
export const WORLD_PRESETS: readonly {
  readonly label: string;
  readonly width: number;
  readonly height: number;
}[] = [
  { label: "48 x 32 — explore", width: 48, height: 32 },
  { label: "64 x 64 — research world", width: 64, height: 64 },
];
