import { resolve } from "node:path";

export function requiredCalibrationSweepPath(
  values: ReadonlyMap<string, string | true>,
): string {
  const value = values.get("sweep");
  if (typeof value !== "string") {
    throw new Error(
      "The calibrate command requires --sweep FILE; there is no implicit current scientific preset.",
    );
  }
  return resolve(value);
}
