import { VerificationResult } from "../agent/messages.js";
import { analyzeTestOutput, ranNoTests, TestReport } from "./test-count.js";
import { spawn } from "child_process";

export function detectVerificationCommand(): string | null {
  const fs = require("fs");
  const cwd = process.cwd();
  
  if (fs.existsSync(`${cwd}/package.json`)) {
    const pkg = JSON.parse(fs.readFileSync(`${cwd}/package.json`, "utf-8"));
    if (pkg.scripts?.test) {
      return "npm test";
    }
  }
  
  if (fs.existsSync(`${cwd}/pyproject.toml`) || fs.existsSync(`${cwd}/pytest.ini`)) {
    return "pytest";
  }
  
  if (fs.existsSync(`${cwd}/Cargo.toml`)) {
    return "cargo test";
  }
  
  if (fs.existsSync(`${cwd}/go.mod`)) {
    return "go test ./...";
  }
  
  return null;
}

export async function runVerification(command: string): Promise<VerificationResult> {
  return new Promise((resolve) => {
    const proc = spawn(command, {
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      cwd: process.cwd(),
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      const combined = stdout + stderr;
      const report = analyzeTestOutput(combined);

      // A runner that exits 0 without executing anything has not verified
      // anything. Treating that as PASS would let the harness certify work
      // that was never exercised.
      const vacuous = code === 0 && ranNoTests(report);

      resolve({
        passed: code === 0 && !vacuous,
        command,
        exitCode: code ?? -1,
        stdout,
        stderr,
        testReport: report,
        vacuous,
      });
    });

    proc.on("error", (error) => {
      resolve({
        passed: false,
        command,
        exitCode: -1,
        stdout: "",
        stderr: String(error),
        testReport: analyzeTestOutput(""),
        vacuous: false,
      });
    });
  });
}

export interface SuiteOutcome {
  label: "visible" | "heldOut";
  command: string;
  result: VerificationResult;
}

export interface CombinedVerdict {
  passed: boolean;
  suites: SuiteOutcome[];
  /** The suite that decides the verdict. Held-out when configured. */
  authoritative: SuiteOutcome;
}

/**
 * Runs the visible suite and, when configured, the held-out suite.
 *
 * Both must be green. A held-out pass does not excuse a broken visible suite,
 * because that still means the repository does not work.
 */
export async function runSuites(
  visibleCommand: string,
  heldOutCommand?: string
): Promise<CombinedVerdict> {
  const visible = await runVerification(visibleCommand);
  const suites: SuiteOutcome[] = [{ label: "visible", command: visibleCommand, result: visible }];

  if (heldOutCommand) {
    const heldOut = await runVerification(heldOutCommand);
    suites.push({ label: "heldOut", command: heldOutCommand, result: heldOut });
  }

  const authoritative = suites.find((s) => s.label === "heldOut") ?? suites[0];

  return {
    passed: suites.every((s) => s.result.passed),
    suites,
    authoritative,
  };
}

export function formatVerificationOutput(result: VerificationResult, attempt: number, maxAttempts: number): string {
  const divider = "────────────────────────────────────";

  if (result.vacuous) {
    return [
      "Verification",
      divider,
      `✗ ${result.command} exited 0 but ran no tests`,
      "",
      "The runner matched zero tests, so nothing was verified. This is a",
      "failure, not a pass. Check that test files exist and are discovered.",
    ].join("\n");
  }

  const counts = result.testReport?.recognised
    ? ` (${result.testReport.passed ?? 0} passed, ${result.testReport.failed ?? 0} failed)`
    : "";

  if (result.passed) {
    return [
      "Verification",
      divider,
      `✓ Tests passed${counts}`,
      "✓ Verification successful",
    ].join("\n");
  }

  return [
    "Verification",
    divider,
    `✗ ${result.command} failed (exit code: ${result.exitCode})${counts}`,
    result.stdout,
    result.stderr,
    "",
    `Repair attempt ${attempt}/${maxAttempts}`,
    divider,
  ].join("\n");
}