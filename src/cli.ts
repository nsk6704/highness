import "dotenv/config";
import { OllamaModel } from "./model/index.js";
import { runAgent, AgentEvent } from "./agent/loop.js";
import { Session } from "./agent/messages.js";

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
  if (passed) {
    console.log("✓ Tests passed");
    console.log("✓ Verification successful\n");
  } else {
    console.log(`✗ Verification failed\n${output}\n`);
    if (attempt < maxAttempts) {
      console.log(`Repair attempt ${attempt + 1}/${maxAttempts}`);
      console.log("────────────────────────────────────\n");
    }
  }
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

  const model = new OllamaModel();

  const session = await runAgent({
    model,
    task,
    verifyCommand,
    maxAttempts,
    onEvent: (event: AgentEvent) => {
      switch (event.type) {
        case "agent_thinking":
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
          printComplete(event.success, event.attempts);
          break;
      }
    },
  });

  process.exit(session.verificationResults[session.verificationResults.length - 1]?.passed ? 0 : 1);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});