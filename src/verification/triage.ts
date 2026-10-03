export type FailureKind =
  | "compile_error"
  | "type_error"
  | "resolution_error"
  | "syntax_error"
  | "timeout"
  | "empty_suite"
  | "assertion_failure"
  | "unknown";

export interface Triage {
  kind: FailureKind;
  /** Failing test names, when the runner named any. */
  cases: string[];
  /** Human-readable one-liners pulled from the log. */
  highlights: string[];
}

// Order matters: patterns are tested top to bottom and must run specific to
// general. `Cannot find module` also contains "error:", so resolution has to be
// checked before the broader compile_error rule.
const CLASSIFIERS: { kind: FailureKind; pattern: RegExp }[] = [
  { kind: "empty_suite", pattern: /No tests? found|No test files found|no tests ran/i },
  { kind: "resolution_error", pattern: /Cannot find module|ModuleNotFoundError|could not find|no required module provides|ERR_MODULE_NOT_FOUND/ },
  { kind: "type_error", pattern: /\berror TS\d{3,4}\b|\bTS\d{3,4}:\s/ },
  { kind: "syntax_error", pattern: /SyntaxError|Unexpected token|expected .* but found|Parsing error/ },
  { kind: "timeout", pattern: /Exceeded timeout|test timed out|\bTimeout of \d+|\bETIMEDOUT\b/ },
  { kind: "compile_error", pattern: /compilation failed|\berror: cannot find function|\bundefined is not a function/i },
];

const CASE_PATTERNS = [
  /^\s*✕\s+(.+?)\s*(\(\d+\s*m?s\))?$/gm, // jest / vitest
  /^\s*●\s+(.+?)\s*$/gm, // jest console group header
  /^FAIL\s+(\S+)\s+(\S+)/gm, // go
  /^test\s+(\S+)\s+\.\.\.\s+FAIL/gm, // rust
  /^(FAILED|ERROR)\s+(\S+)/gm, // pytest
];

const HIGHLIGHT_PATTERNS = [
  /^\s*(?:Expected|Received|Actual|Expected|expected):.*$/gm,
  /^\s*at\s+.*:\d+:\d+/gm,
  /^\s*\+.*$/gm,
  /^\s*-.*$/gm,
  /AssertionError.*$/gm,
  /^\s*\w+Error:.*$/gm,
];

function dedupe(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) continue;
    // Suite headers such as `FAIL test/calculator.test.ts` match the runner
    // patterns but name a file, not a case.
    if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Turns a raw runner log into a classification plus a small amount of evidence.
 *
 * The loop already truncates tool output, so the point here is to spend the
 * budget on signal: a model asked to repair a compile error does not need the
 * full stack trace of an unrelated assertion.
 */
export function triageFailure(output: string): Triage {
  for (const { kind, pattern } of CLASSIFIERS) {
    if (pattern.test(output)) {
      const highlights = collect(output, HIGHLIGHT_PATTERNS, 8);
      return { kind, cases: [], highlights };
    }
  }

  const cases = collect(output, CASE_PATTERNS, 10);
  const highlights = collect(output, HIGHLIGHT_PATTERNS, 8);

  return {
    kind: cases.length > 0 || highlights.length > 0 ? "assertion_failure" : "unknown",
    cases,
    highlights,
  };
}

function collect(output: string, patterns: RegExp[], limit: number): string[] {
  const found: string[] = [];
  for (const pattern of patterns) {
    // Patterns are module-level and therefore stateful with /g.
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(output)) !== null) {
      found.push(match[1] ?? match[0]);
      if (found.length > limit * 4) break;
    }
  }
  return dedupe(found, limit);
}

const GUIDANCE: Record<FailureKind, string> = {
  compile_error: "The code does not compile. Fix the reported error before anything else.",
  type_error: "A type error was reported. Correct the types; do not silence them.",
  resolution_error: "A module or symbol could not be resolved. Check the import path and that the file exists.",
  syntax_error: "The source does not parse. Fix the syntax error.",
  timeout: "A test exceeded its time limit. Look for an infinite loop or an unbounded wait.",
  empty_suite: "No tests were discovered. The verification ran nothing.",
  assertion_failure: "An assertion did not hold. Compare expected against received.",
  unknown: "The failure could not be classified. Read the output directly.",
};

export function formatTriage(triage: Triage, maxChars = 1200): string {
  const lines: string[] = [`Failure class: ${triage.kind}`, GUIDANCE[triage.kind]];

  if (triage.cases.length > 0) {
    lines.push("", `Failing cases (${triage.cases.length}):`);
    for (const name of triage.cases) lines.push(`  - ${name}`);
  }

  if (triage.highlights.length > 0) {
    lines.push("", "Evidence:");
    for (const item of triage.highlights) lines.push(`  ${item}`);
  }

  const text = lines.join("\n");
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}\n  [truncated]`;
}