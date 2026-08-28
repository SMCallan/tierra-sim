import { EcologicalResultCode } from "../domain/events.js";

export class EngineInvariantError extends Error {
  readonly code = EcologicalResultCode.ConfigurationInvariant;

  constructor(message: string) {
    super(message);
    this.name = "EngineInvariantError";
  }
}
