#!/usr/bin/env node
import "dotenv/config";
import { config as loadEnvFile } from "dotenv";
import { resolve } from "path";
import { existsSync } from "fs";
import { OllamaModel } from "./model/index.js";
import { runAgent, AgentEvent } from "./agent/loop.js";
import { Session } from "./agent/messages.js";

/**
 * `dotenv/config` only reads a .env in the current working directory. Since
 * the harness runs against a target project, that is usually the project
 * rather than this package, so the documented root .env would never load.
 * Fall back to the one beside the installed package.
 */
function ensureApiKey(): void {
  if (process.env.OLLAMA_API_KEY) return;
  const path = resolve(__dirname, "..", ".env");
  if (existsSync(path)) loadEnvFile({ path });
}

function printBanner() {
  console.log("\nHighness");
  console.log("────────────────────────────────────\n");
}

function printTask(task: string) {
  console.log("Task");
  console.log(`  ${task}\n`);
}

function printAgentMessage(content: string) {
  console.log("Agent");
  console.log(`  ${content}\n`);
}

function printToolCall(name: string, args: Record<string, unknown>) {
  console.log("Tool");
  console.log(`  ${name}(${JSON.stringify(args)})\n`);
}

function printToolResult(name: string, result: { success: boolean; output?: string; error?: string }) {
  if (result.success) {
    console.log(`  → ${result.output || "OK"}\n`);
  } else {
    console.log(`  ✗ ${result.error}\n`);
  }
}

function printVerificationStart(command: string, attempt: number, maxAttempts: number) {
  console.log("Verification");
  console.log(`────────────────────────────────────`);
  console.log(`  Running: ${command} (attempt ${attempt}/${maxAttempts})\n`);
}

function printVerificationResult(passed: boolean, output: string, attempt: number, maxAttempts: number) {
  // The output already contains the per-suite lines, so this only frames it.
  console.log(output);
  if (!passed && attempt < maxAttempts) {
    console.log(`Repair attempt ${attempt + 1}/${maxAttempts}`);
    console.log("────────────────────────────────────\n");
  } else {
    console.log("");
  }
}

function printIntegrityBaseline(protectedFiles: number) {
  console.log("Guard");
  console.log("────────────────────────────────────");
  console.log(`  ✓ ${protectedFiles} protected file${protectedFiles === 1 ? "" : "s"} hashed`);
  if (protectedFiles === 0) {
    console.log("  ! No highness.config.json found, running unguarded.");
  }
  console.log("");
}

function printIntegrityViolation(violations: { path: string; kind: string }[]) {
  console.log("INTEGRITY VIOLATION");
  console.log("────────────────────────────────────");
  for (const v of violations) {
    console.log(`  ✗ ${v.path} ${v.kind}`);
  }
  console.log("");
  console.log("The files that define success were changed.");
  console.log("This result is void. Modifying tests or weakening the");
  console.log("verification command is not a repair, it is a failed run.");
  console.log("────────────────────────────────────\n");
}

function printComplete(success: boolean, attempts: number) {
  console.log("HIGHNESS");
  console.log("────────────────────────────────────");
  if (success) {
    console.log("✓ Task verified");
    console.log(`  Attempts: ${attempts}\n`);
  } else {
    console.log("✗ Verification failed after maximum attempts");
    console.log(`  Attempts: ${attempts}\n`);
  }
}

export async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(`
Highness — Minimal verification-first coding agent harness

Usage:
  highness "Your coding task"
  highness --max-attempts 3 "Your coding task"
  highness --verify "npm test" "Your coding task"

Options:
  --max-attempts, -n  Maximum repair attempts (default: 3)
  --verify, -v        Verification command (auto-detected if omitted)
  --help, -h          Show this help

Environment:
  OLLAMA_API_KEY      Required - Create one at https://ollama.com/settings/keys
  OLLAMA_MODEL        Optional - Default: gpt-oss:120b
`);
    process.exit(0);
  }

  let maxAttempts = 3;
  let verifyCommand: string | undefined;
  let task = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--max-attempts" || args[i] === "-n") {
      maxAttempts = parseInt(args[++i], 10) || 3;
    } else if (args[i] === "--verify" || args[i] === "-v") {
      verifyCommand = args[++i];
    } else {
      task = args.slice(i).join(" ");
      break;
    }
  }

  if (!task) {
    console.error("Error: No task provided");
    process.exit(1);
  }

  printBanner();
  printTask(task);

  ensureApiKey();
  const model = new OllamaModel();

  let finalSuccess = false;
  let sawIntegrityViolation = false;

  const session = await runAgent({
    model,
    task,
    verifyCommand,
    maxAttempts,
    onEvent: (event: AgentEvent) => {
      switch (event.type) {
        case "agent_thinking":
          break;
        case "integrity_baseline":
          printIntegrityBaseline(event.protectedFiles);
          break;
        case "integrity_violation":
          sawIntegrityViolation = true;
          printIntegrityViolation(event.violations);
          break;
        case "agent_message":
          printAgentMessage(event.content);
          break;
        case "tool_call":
          printToolCall(event.name, event.args);
          break;
        case "tool_result":
          printToolResult(event.name, event.result);
          break;
        case "tool_limit":
          console.log(`  ! Tool call limit reached (${event.calls}/${event.limit}), stopping to verify.\n`);
          break;
        case "verification_start":
          printVerificationStart(event.command, event.attempt, event.maxAttempts);
          break;
        case "verification_result":
          printVerificationResult(event.result.passed, event.result.output, event.attempt, event.maxAttempts);
          break;
        case "complete":
          finalSuccess = event.success;
          if (!sawIntegrityViolation) printComplete(event.success, event.attempts);
          break;
      }
    },
  });

  // An integrity violation voids the run regardless of any test result, so it
  // takes precedence over the last suite's exit code.
  const lastPassed = session.verificationResults[session.verificationResults.length - 1]?.passed ?? false;
  process.exit(finalSuccess && lastPassed && !sawIntegrityViolation ? 0 : 1);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});