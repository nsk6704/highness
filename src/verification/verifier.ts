import { VerificationResult } from "../agent/messages.js";
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
      resolve({
        passed: code === 0,
        command,
        exitCode: code ?? -1,
        stdout,
        stderr,
      });
    });

    proc.on("error", (error) => {
      resolve({
        passed: false,
        command,
        exitCode: -1,
        stdout: "",
        stderr: String(error),
      });
    });
  });
}

export function formatVerificationOutput(result: VerificationResult, attempt: number, maxAttempts: number): string {
  const status = result.passed ? "✓" : "✗";
  const header = result.passed 
    ? `Verification\n────────────────────────────────────\n${status} Tests passed\n${status} Verification successful`
    : `Verification\n────────────────────────────────────\n${status} ${result.command} failed (exit code: ${result.exitCode})\n${result.stdout}\n${result.stderr}\n\nRepair attempt ${attempt}/${maxAttempts}\n────────────────────────────────────`;
  
  return header;
}