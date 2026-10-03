import { createHash } from "crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";

import { loadManifest } from "./manifest.js";
import { matchesPattern, toRelative } from "../utils/glob.js";
import type { IntegrityViolation } from "../agent/messages.js";

export type { IntegrityViolation };

export interface IntegritySnapshot {
  hashes: Map<string, string>;
  protectedCount: number;
}

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "coverage", ".next"]);

function digest(contents: string | Buffer): string {
  return createHash("sha256").update(contents).digest("hex").slice(0, 16);
}

function collect(cwd: string, root: string, patterns: string[], out: Map<string, string>): void {
  if (!existsSync(root)) return;

  for (const pattern of patterns) {
    const bare = pattern.replace(/\*+$/, "").replace(/\/$/, "");
    const isGlob = bare !== pattern;

    if (isGlob) {
      // Globs are resolved against the tree rather than the filesystem so the
      // same matcher the guard uses defines what is protected.
      walk(cwd, root, (abs) => {
        const rel = toRelative(cwd, abs);
        if (matchesPattern(rel, pattern) && !out.has(rel)) {
          out.set(rel, digest(readFileSync(abs)));
        }
      });
      continue;
    }

    const abs = resolve(root, pattern);
    if (!existsSync(abs)) continue;

    if (statSync(abs).isDirectory()) {
      walk(cwd, abs, (file) => {
        const rel = toRelative(cwd, file);
        if (!out.has(rel)) out.set(rel, digest(readFileSync(file)));
      });
    } else {
      const rel = toRelative(cwd, abs);
      out.set(rel, digest(readFileSync(abs)));
    }
  }
}

function walk(cwd: string, dir: string, visit: (abs: string) => void): void {
  if (!existsSync(dir)) return;

  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const abs = join(dir, entry);
    let isDirectory: boolean;
    try {
      isDirectory = statSync(abs).isDirectory();
    } catch {
      continue;
    }
    if (isDirectory) walk(cwd, abs, visit);
    else visit(abs);
  }
}

/**
 * Hashes everything the harness depends on to decide success. Detects edits
 * that reach the filesystem without passing through a guarded tool, which is
 * the case the deny-list alone cannot cover.
 */
export function captureIntegrity(cwd: string = process.cwd()): IntegritySnapshot {
  const manifest = loadManifest(cwd);
  const hashes = new Map<string, string>();

  collect(cwd, cwd, manifest.guard.denyWrite, hashes);
  collect(cwd, cwd, manifest.guard.denyRead, hashes);

  for (const file of manifest.integrityFiles) {
    const abs = resolve(cwd, file);
    if (!existsSync(abs)) continue;
    if (statSync(abs).isDirectory()) {
      walk(cwd, abs, (f) => {
        const rel = toRelative(cwd, f);
        if (!hashes.has(rel)) hashes.set(rel, digest(readFileSync(f)));
      });
    } else {
      hashes.set(toRelative(cwd, abs), digest(readFileSync(abs)));
    }
  }

  return { hashes, protectedCount: hashes.size };
}

export function checkIntegrity(snapshot: IntegritySnapshot, cwd: string = process.cwd()): IntegrityViolation[] {
  const current = captureIntegrity(cwd);
  const violations: IntegrityViolation[] = [];

  for (const [path, expected] of snapshot.hashes) {
    const actual = current.hashes.get(path);
    if (actual === undefined) {
      violations.push({ path, kind: "deleted", expected, actual: "<missing>" });
    } else if (actual !== expected) {
      violations.push({ path, kind: "modified", expected, actual });
    }
  }

  return violations;
}

export function formatViolations(violations: IntegrityViolation[]): string {
  return violations
    .map((v) => {
      const action = v.kind === "deleted" ? "deleted" : "modified";
      return `  x ${v.path} ${action}\n    expected ${v.expected}, found ${v.actual}`;
    })
    .join("\n");
}