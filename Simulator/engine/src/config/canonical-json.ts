function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
}

interface SerialisationCache {
  readonly quotedKeys: Map<string, string>;
  readonly sortedShapes: Map<string, readonly string[]>;
}

function shapeSignature(keys: readonly string[]): string {
  return keys.map((key) => `${key.length}:${key}`).join("");
}

function quotedKey(key: string, cache: SerialisationCache): string {
  const existing = cache.quotedKeys.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const quoted = JSON.stringify(key);
  cache.quotedKeys.set(key, quoted);
  return quoted;
}

function sortedKeys(value: Record<string, unknown>, cache: SerialisationCache): readonly string[] {
  const ownKeys = Object.keys(value);
  const signature = shapeSignature(ownKeys);
  const existing = cache.sortedShapes.get(signature);
  if (existing !== undefined) {
    return existing;
  }
  const sorted = ownKeys.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  cache.sortedShapes.set(signature, sorted);
  return sorted;
}

function serialise(value: unknown, cache: SerialisationCache): string {
  if (value === null) {
    return "null";
  }

  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "string":
      return JSON.stringify(value);
    case "number":
      if (!Number.isSafeInteger(value)) {
        throw new TypeError("Canonical scientific JSON accepts safe integers only.");
      }
      return String(value);
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map((item) => serialise(item, cache)).join(",")}]`;
      }
      if (!isPlainObject(value)) {
        throw new TypeError("Canonical scientific JSON accepts plain objects only.");
      }

      const entries = sortedKeys(value, cache).map(
        (key) => `${quotedKey(key, cache)}:${serialise(value[key], cache)}`,
      );
      return `{${entries.join(",")}}`;
    }
    default:
      throw new TypeError(`Unsupported canonical JSON value: ${typeof value}.`);
  }
}

export function canonicalJson(value: unknown): string {
  return serialise(value, {
    quotedKeys: new Map(),
    sortedShapes: new Map(),
  });
}
