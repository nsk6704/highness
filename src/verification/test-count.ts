export interface TestReport {
  /** A known test framework was recognised in the output. */
  recognised: boolean;
  framework: string | null;
  passed: number | null;
  failed: number | null;
  total: number | null;
  /** Output explicitly signalled that nothing was executed. */
  emptySignal: boolean;
}

const UNKNOWN: TestReport = {
  recognised: false,
  framework: null,
  passed: null,
  failed: null,
  total: null,
  emptySignal: false,
};

function num(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number.parseInt(value.replace(/[_,]/g, ""), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Extracts test counts from well-known runners.
 *
 * Only a positive match for a known framework sets `recognised`. That matters:
 * a project may verify with `tsc --noEmit` or a lint step, and the harness
 * must not invent a test count for output it does not understand.
 */
export function analyzeTestOutput(output: string): TestReport {
  // Explicit "nothing matched" markers carry no summary line, and under
  // `--passWithNoTests` the runner still exits 0. This has to be checked first:
  // it is the only signal that the run was vacuous.
  if (/No tests? found|No test files found|no tests ran/i.test(output)) {
    return {
      recognised: true,
      framework: "unknown",
      passed: 0,
      failed: 0,
      total: 0,
      emptySignal: true,
    };
  }

  // Jest / Vitest: "Tests:  1 failed, 16 passed, 17 total"
  const jestTotal = output.match(/\bTests:\s+(?:.*?)(\d+)\s+total/);
  if (jestTotal) {
    const passed = output.match(/\bTests:\s+(?:.*?)(\d+)\s+passed/);
    const failed = output.match(/\bTests:\s+(\d+)\s+failed/);
    return {
      recognised: true,
      framework: "jest",
      passed: num(passed?.[1]),
      failed: num(failed?.[1]),
      total: num(jestTotal[1]),
      emptySignal: /No tests? found/i.test(output),
    };
  }

  // Cargo: "test result: ok. 17 passed; 0 failed; ..."
  const cargo = output.match(/test result:\s*\w+\.\s*(\d+)\s+passed;\s*(\d+)\s+failed/);
  if (cargo) {
    return {
      recognised: true,
      framework: "cargo",
      passed: num(cargo[1]),
      failed: num(cargo[2]),
      total: (num(cargo[1]) ?? 0) + (num(cargo[2]) ?? 0),
      emptySignal: /test result:\s*\w+\.\s*0 passed;\s*0 failed/.test(output),
    };
  }

  // pytest: "=== 3 passed, 1 failed in 0.4s ===" / "=== no tests ran in 0.1s ==="
  // pytest frames its summary with '=' not '-', and older versions with '-'.
  if (/^[=-]{3,}.*(passed|failed|error|no tests ran)/m.test(output)) {
    const passed = output.match(/(\d+)\s+passed/);
    const failed = output.match(/(\d+)\s+failed/);
    const p = num(passed?.[1]) ?? 0;
    const f = num(failed?.[1]) ?? 0;
    return {
      recognised: true,
      framework: "pytest",
      passed: p,
      failed: f,
      total: p + f,
      emptySignal: /no tests ran/i.test(output),
    };
  }

  // Mocha: "17 passing (20ms)"
  const mocha = output.match(/(\d+)\s+passing/);
  if (mocha) {
    const failing = output.match(/(\d+)\s+failing/);
    const p = num(mocha[1]) ?? 0;
    const f = num(failing?.[1]) ?? 0;
    return {
      recognised: true,
      framework: "mocha",
      passed: p,
      failed: f,
      total: p + f,
      emptySignal: false,
    };
  }

  // Go: per-package "ok" lines, or an overall FAIL with no "ok" package.
  if (/^ok\s+\S+/m.test(output) || /^(FAIL|--- FAIL:)/m.test(output)) {
    const okPackages = output.match(/^ok\s+\S+/gm)?.length ?? 0;
    const failedPackages = output.match(/^FAIL\s+\S+/gm)?.length ?? 0;
    return {
      recognised: true,
      framework: "go",
      passed: okPackages,
      failed: failedPackages,
      total: okPackages + failedPackages,
      emptySignal: okPackages + failedPackages === 0,
    };
  }

  return UNKNOWN;
}

/**
 * True when the runner exited successfully but executed nothing. `npm test`
 * exits 0 under several configurations when zero tests match, so trusting the
 * exit code alone lets the harness report PASS for doing no work at all.
 */
export function ranNoTests(report: TestReport): boolean {
  if (!report.recognised) return false;
  return report.emptySignal || report.total === 0;
}

export function describeReport(report: TestReport): string {
  if (!report.recognised) return "Unrecognised test output";
  const parts: string[] = [];
  if (report.passed !== null) parts.push(`${report.passed} passed`);
  if (report.failed !== null && report.failed > 0) parts.push(`${report.failed} failed`);
  if (report.total !== null) parts.push(`${report.total} total`);
  return `${report.framework}: ${parts.join(", ")}`;
}