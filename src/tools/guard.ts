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

/** Splits a command into candidate path tokens, dropping flags and quotes. */
function tokenize(command: string): string[] {
  return command
    .split(/[\s;|&<>()]+/)
    .map((token) => token.replace(/^["']+|["']+$/g, ""))
    .filter(Boolean);
}

/** True for tokens that could plausibly denote a filesystem location. */
function hasSeparator(token: string): boolean {
  return token.includes("/") || token.includes("\\");
}

function namesASpecificFile(pattern: string): boolean {
  return /\.[A-Za-z0-9]+$/.test(pattern);
}

/**
 * Best-effort shell screening. Shell is not a security boundary: a determined
 * model can obfuscate a path or reach the suite through a generated script.
 * Integrity hashing is the layer that actually catches that.
 *
 * Matching is per token rather than a substring scan of the whole command.
 * A blanket scan cannot tell `npm test` from `cat test/calculator.test.ts`,
 * and blocking the first would stop the agent running the very suite it is
 * supposed to be fixing.
 */
export function assertShellAllowed(cwd: string, command: string): void {
  const { guard } = loadManifest(cwd);
  const patterns = [...new Set([...guard.denyRead, ...guard.denyWrite])].map(
    (p) => p.replace(/\*+$/, "").replace(/\/$/, "")
  );
  const normalized = command.replace(/\\/g, "/");
  const lowerCommand = normalized.toLowerCase();

  for (const token of tokenize(command)) {
    if (token.startsWith("-")) continue;
    const candidate = token.replace(/^\.\//, "");

    for (const pattern of patterns) {
      if (!pattern) continue;

      // A pattern naming a specific file is matched literally. SPEC.md cannot
      // plausibly be a script argument, so a bare reference is still an attempt.
      if (namesASpecificFile(pattern) && lowerCommand.includes(pattern.toLowerCase())) {
        throw new GuardViolation(
          pattern,
          "referencing a guarded file in a shell command is not permitted"
        );
      }

      // Directory and glob patterns only apply to path-like tokens, so
      // `npm test` and `npm run build` keep working while `cat test/x.ts` does not.
      if (hasSeparator(token) && matchesAny(candidate, [pattern])) {
        throw new GuardViolation(
          candidate,
          "referencing a guarded path in a shell command is not permitted"
        );
      }
    }
  }
}