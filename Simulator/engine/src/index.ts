export { canonicalJson } from "./config/canonical-json.js";
export { deepFreeze, type DeepReadonly } from "./config/deep-freeze.js";
export {
  donorCopyRuleSchema,
  engineConfigSchema,
  parseEngineConfig,
  rationalProbabilitySchema,
  type DonorCopyRule,
  type EngineConfig,
  type ImmutableEngineConfig,
  type LocalResourceConfig,
  type RationalProbability,
} from "./config/schema.js";
export {
  createBehaviourWindow,
  createEmptyBehaviourBucket,
  Lineage,
  type BehaviourBucket,
  type OrganismState,
} from "./domain/organism.js";
export {
  createRunCounters,
  DeathCause,
  EcologicalOperation,
  EcologicalResultCode,
  EnergyEventKind,
  MutationClass,
  type EngineEvent,
  type RunCounters,
} from "./domain/events.js";
export {
  EngineInvariantError,
  SimulationEngine,
  type EngineRuntimeOptions,
  type TerminalReason,
  type TickReport,
} from "./engine/simulation.js";
export {
  CHECKPOINT_FORMAT_VERSION,
  LEGACY_CHECKPOINT_FORMAT_VERSION,
  configurationDigest,
  createCheckpoint,
  ENGINE_STATE_VERSION,
  LEGACY_ENGINE_STATE_VERSION,
  hashScientificState,
  parseCheckpoint,
  STATE_HASH_VERSION,
  LEGACY_STATE_HASH_VERSION,
  type CheckpointFormatVersion,
  type EngineStateVersion,
  type StateHashVersion,
  type EngineCheckpoint,
  type ScientificStateSnapshot,
} from "./engine/checkpoint.js";
export {
  mutateCopiedGenome,
  type MutationOutcome,
  type MutationRecord,
} from "./genome/mutation.js";
export { Xoshiro128StarStar, type PrngState } from "./random/prng.js";
export { sha256, type Sha256Function } from "./hash/sha256.js";
export {
  calculateLineageInformation,
  classifyFunctionalBehaviour,
  countFunctionalClasses,
  FunctionalClass,
  measureOrganismBehaviour,
  nearestRank,
  summariseDivergence,
  type DivergenceSummary,
  type FunctionalBoundaries,
  type FunctionalClassCounts,
  type LineageInformation,
  type OrganismBehaviourMeasurement,
} from "./measurement/divergence.js";
export { cloneLineageRecord, type LineageRecord } from "./measurement/lineage.js";
export {
  measurePopulation,
  type PopulationMeasurement,
  type PopulationMeasurementInput,
  type PopulationStateSummary,
  type SampleKind,
  type SensitivityMeasurement,
  type StratifiedDivergence,
  type StratifiedFunctionalClasses,
} from "./measurement/population.js";
export {
  measureSpatialStructure,
  type LineagePatchSummary,
  type SpatialStructureMeasurement,
} from "./measurement/spatial.js";
export {
  measureLocalResources,
  type LocalResourceMeasurement,
} from "./measurement/resources.js";
export {
  ancestorFixtureSchema,
  parseAncestorFixture,
  type AncestorFixture,
} from "./seed/fixture.js";
export {
  cardinalCoordinates,
  Direction,
  directionFromRegister,
  fromCellIndex,
  neighbourCoordinate,
  rotateDirection,
  toCellIndex,
  wrapAxis,
  wrapCoordinate,
  type Coordinate,
} from "./world/coordinates.js";
export { WorldGrid } from "./world/grid.js";
export {
  LocalResourceField,
  type LocalResourceCounters,
  type LocalResourceStateSnapshot,
} from "./world/resource-field.js";
export {
  ComputationOperation,
  createVmState,
  executeVmInstruction,
  resetReproductiveCycle,
  type ComparisonFlag,
  type ComputationOperation as ComputationOperationValue,
  type ComputationRewardConfig,
  type ComputationTask,
  type LastComputation,
  type RegisterProvenance,
  type VmEffect,
  type VmExecutionContext,
  type VmState,
  type VmStepResult,
} from "./vm/machine.js";
export {
  decodeSignedNibble,
  isOpcode,
  Opcode,
  opcodeName,
  validateGenome,
  type Opcode as OpcodeValue,
} from "./vm/opcodes.js";
