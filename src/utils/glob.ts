import { relative } from "path";

/**
 * Minimal glob matcher for the subset used in guard patterns.
 *
 * Supports `*` (within a segment), `**` (across segments), and `?`. Patterns
 * containing no `/` match a path segment at any depth, matching gitignore
 * convention so `*.test.ts` behaves the way people expect.
 */
function globToRegExp(pattern: string): RegExp {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        i++;
        if (pattern[i + 1] === "/") {
          i++;
          out += "(?:.*/)?";
        } else {
          out += ".*";
        }
      } else {
        out += "[^/]*";
      }
    } else if (c === "?") {
      out += "[^/]";
    } else {
      out += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${out}$`);
}

export function matchesPattern(relPath: string, pattern: string): boolean {
  const normalized = relPath.replace(/\\/g, "/").replace(/^\.\//, "");
  const normalizedPattern = pattern.replace(/\\/g, "/").replace(/\/+$/, "");

  const candidates = normalizedPattern.includes("/")
    ? [normalized]
    : [normalized, normalized.split("/").pop() ?? normalized];

  return candidates.some((candidate) => {
    // A bare directory name guards everything beneath it.
    if (!normalizedPattern.includes("*") && !normalizedPattern.includes("?")) {
      return candidate === normalizedPattern || normalized.startsWith(`${normalizedPattern}/`);
    }
    return globToRegExp(normalizedPattern).test(candidate);
  });
}

export function matchesAny(relPath: string, patterns: string[]): string | undefined {
  for (const pattern of patterns) {
    if (matchesPattern(relPath, pattern)) return pattern;
  }
  return undefined;
}

export function toRelative(cwd: string, absolute: string): string {
  return relative(cwd, absolute).replace(/\\/g, "/");
}