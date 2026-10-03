import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

export interface GuardConfig {
  /** Paths the agent may never read. Verifier reads these freely. */
  denyRead: string[];
  /** Paths the agent may never modify. */
  denyWrite: string[];
}

export interface Manifest {
  /** Command producing the tests the agent is allowed to see. */
  verify: string;
  /** Harness-owned suite. Source of truth. Omitted means visible-only. */
  heldOut?: string;
  guard: GuardConfig;
  /** Files hashed at session start to detect tampering. */
  integrityFiles: string[];
}

const DEFAULT_MANIFEST: Manifest = {
  verify: "",
  guard: { denyRead: [], denyWrite: [] },
  integrityFiles: [],
};

let cached: Manifest | undefined;

export function loadManifest(cwd: string = process.cwd()): Manifest {
  if (cached) return cached;

  const path = resolve(cwd, "highness.config.json");
  if (!existsSync(path)) {
    cached = { ...DEFAULT_MANIFEST };
    return cached;
  }

  let parsed: Partial<Manifest>;
  try {
    parsed = JSON.parse(readFileSync(path, "utf-8"));
  } catch (error) {
    throw new Error(`highness.config.json is not valid JSON: ${String(error)}`);
  }

  cached = {
    verify: parsed.verify ?? "",
    heldOut: parsed.heldOut,
    guard: {
      denyRead: parsed.guard?.denyRead ?? [],
      denyWrite: parsed.guard?.denyWrite ?? [],
    },
    integrityFiles: parsed.integrityFiles ?? [],
  };
  return cached;
}

export function resetManifestCache(): void {
  cached = undefined;
}