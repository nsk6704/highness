import { loadManifest } from "../verification/manifest.js";
import { matchesAny, toRelative } from "../utils/glob.js";

export class GuardViolation extends Error {
  readonly path: string;
  readonly reason: string;

  constructor(path: string, reason: string) {
    super(`Guard violation: ${reason} (${path})`);
    this.name = "GuardViolation";
    this.path = path;
    this.reason = reason;
  }
}

function check(cwd: string, target: string, patterns: string[], verb: string): void {
  const rel = toRelative(cwd, target);
  const hit = matchesAny(rel, patterns);
  if (hit) {
    throw new GuardViolation(rel, `${verb} is not permitted (matched ${hit})`);
  }
}

export function assertReadable(cwd: string, absolutePath: string): void {
  check(cwd, absolutePath, loadManifest(cwd).guard.denyRead, "reading");
}

export function assertWritable(cwd: string, absolutePath: string): void {
  const { denyWrite, denyRead } = loadManifest(cwd).guard;
  check(cwd, absolutePath, denyWrite, "modifying");
  // Anything the agent cannot read, it has no business writing either.
  check(cwd, absolutePath, denyRead, "modifying");
}

/**
 * Best-effort shell screening. Shell is not a security boundary: a determined
 * model can obfuscate paths or reach the suite through a glob. This blocks the
 * direct attempts, which is enough to keep the harness honest in practice.
 */
export function assertShellAllowed(cwd: string, command: string): void {
  const { denyRead, denyWrite } = loadManifest(cwd).guard;
  const patterns = [...new Set([...denyRead, ...denyWrite])];

  const normalized = command.replace(/\\/g, "/");
  for (const pattern of patterns) {
    const literal = pattern.replace(/\*+/g, "").replace(/\/$/, "");
    if (literal.length > 0 && normalized.includes(literal)) {
      throw new GuardViolation(literal, "referencing guarded paths in a shell command is not permitted");
    }
  }
}