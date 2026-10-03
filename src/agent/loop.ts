import { Model, Tool, Message, ToolResult, ToolDefinition, DEFAULT_MAX_ATTEMPTS, Session, IntegrityViolation } from "./messages.js";
import { allTools, toolDefinitions } from "../tools/index.js";
import { runSuites, CombinedVerdict, SuiteOutcome } from "../verification/verifier.js";
import { triageFailure, formatTriage } from "../verification/triage.js";
import { captureIntegrity, checkIntegrity } from "../verification/integrity.js";
import { loadManifest } from "../verification/manifest.js";
import { detectVerificationCommand } from "../verification/verifier.js";
import { cwd } from "../utils/paths.js";

const SYSTEM_PROMPT = `You are the coding agent running inside Highness.

Your job is to modify the repository to satisfy the user's request.

You have access to tools for reading files, modifying files, and executing commands.

Rules:

1. Inspect relevant files before modifying them.
2. Make the smallest reasonable changes.
3. Do not claim that the task is complete until the implementation has been tested.
4. When Highness reports a verification failure, analyze the failure and repair the implementation.
5. Do not modify unrelated files.
6. Use the available tools rather than describing commands for the user to run.
7. When you believe the implementation is complete, provide a concise summary.

The tests you can see are not the whole picture. Highness also runs a
held-out suite you cannot read, and that suite decides the outcome. Passing
the visible tests is necessary but not sufficient. When a held-out case
fails, treat its name and error as evidence about behaviour the visible
tests never covered, and reason from the task description.

You may not modify tests or weaken the verification command. Doing so is
terminated immediately and the result is void regardless of what the tests
report afterwards.`;

export interface AgentOptions {
  model: Model;
  task: string;
  verifyCommand?: string;
  maxAttempts?: number;
  onEvent?: (event: AgentEvent) => void;
}

export type AgentEvent =
  | { type: "start"; task: string }
  | { type: "integrity_baseline"; protectedFiles: number }
  | { type: "agent_thinking" }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_limit"; calls: number; limit: number }
  | { type: "tool_result"; name: string; result: ToolResult }
  | { type: "agent_message"; content: string }
  | { type: "verification_start"; command: string; attempt: number; maxAttempts: number }
  | { type: "verification_result"; result: { passed: boolean; output: string }; attempt: number; maxAttempts: number }
  | { type: "integrity_violation"; violations: IntegrityViolation[] }
  | { type: "complete"; success: boolean; attempts: number };

const MAX_TOOL_OUTPUT_CHARS = 4000;
const MAX_TOOL_CALLS_PER_ATTEMPT = 25;

function truncate(text: string, limit = MAX_TOOL_OUTPUT_CHARS): string {
  if (text.length <= limit) return text;
  const omitted = text.length - limit;
  return `${text.slice(0, limit)}\n... [truncated ${omitted} chars]`;
}

function serializeResult(result: ToolResult): string {
  const payload: ToolResult = {
    ...result,
    output: result.output ? truncate(result.output) : undefined,
    error: result.error ? truncate(result.error) : undefined,
  };
  return JSON.stringify(payload);
}

export async function runAgent(options: AgentOptions): Promise<Session> {
  const { model, task, verifyCommand, maxAttempts = DEFAULT_MAX_ATTEMPTS, onEvent } = options;
  
  const session: Session = {
    task,
    messages: [],
    attempts: 0,
    toolCalls: [],
    verificationResults: [],
  };

  const manifest = loadManifest(cwd);
  const verifyCmd = verifyCommand || manifest.verify || detectVerificationCommand() || "npm test";
  const heldOutCmd = manifest.heldOut;

  // Snapshot the definitions of success before the model gets a chance to
  // touch anything. Every later verdict is checked against this.
  const integrity = captureIntegrity(cwd);

  session.messages.push({ role: "system", content: SYSTEM_PROMPT });
  session.messages.push({ role: "user", content: task });

  onEvent?.({ type: "start", task });
  onEvent?.({ type: "integrity_baseline", protectedFiles: integrity.protectedCount });

  let attempt = 0;
  let success = false;

  while (attempt < maxAttempts && !success) {
    attempt++;
    session.attempts = attempt;

    // Agent loop - keep calling model until it says it's done
    let toolCalls = 0;
    while (true) {
      if (toolCalls >= MAX_TOOL_CALLS_PER_ATTEMPT) {
        onEvent?.({ type: "tool_limit", calls: toolCalls, limit: MAX_TOOL_CALLS_PER_ATTEMPT });
        break;
      }

      onEvent?.({ type: "agent_thinking" });

      const response = await model.generate(session.messages, toolDefinitions);

      if (response.type === "tool_call") {
        toolCalls++;
        const { toolCall, message } = response;
        session.messages.push(message);
        
        onEvent?.({ type: "tool_call", name: toolCall.name, args: toolCall.arguments });

        const tool = findTool(toolCall.name);
        if (!tool) {
          const errorResult: ToolResult = { success: false, error: `Unknown tool: ${toolCall.name}` };
          session.messages.push({
            role: "tool",
            content: JSON.stringify(errorResult),
            tool_call_id: toolCall.id,
          });
          session.toolCalls.push({ name: toolCall.name, args: toolCall.arguments, result: errorResult });
          continue;
        }

        const result = await tool.execute(toolCall.arguments);
        session.toolCalls.push({ name: toolCall.name, args: toolCall.arguments, result });
        
        onEvent?.({ type: "tool_result", name: toolCall.name, result });

        session.messages.push({
          role: "tool",
          content: serializeResult(result),
          tool_call_id: toolCall.id,
        });
      } else if (response.type === "final") {
        session.messages.push(response.message);
        onEvent?.({ type: "agent_message", content: response.content });
        break;
      }
    }

    // Integrity is checked before verification, never after. If the model
    // changed what success means, the run is void and no repair is offered.
    const violations = checkIntegrity(integrity, cwd);
    if (violations.length > 0) {
      session.integrityViolations = violations;
      onEvent?.({ type: "integrity_violation", violations });
      break;
    }

    // Run visible suite and, when configured, the harness-owned held-out suite.
    onEvent?.({ type: "verification_start", command: verifyCmd, attempt, maxAttempts });
    const verdict: CombinedVerdict = await runSuites(verifyCmd, heldOutCmd);

    for (const suite of verdict.suites) {
      session.verificationResults.push(suite.result);
    }

    const verificationOutput = formatVerdict(verdict, attempt, maxAttempts);
    onEvent?.({
      type: "verification_result",
      result: { passed: verdict.passed, output: verificationOutput },
      attempt,
      maxAttempts
    });

    if (verdict.passed) {
      success = true;
      break;
    }

    // Feed back the failing suite. The authoritative one decides, so when a
    // held-out suite exists that is the evidence the model gets.
    const failing = verdict.authoritative.result.passed
      ? verdict.suites.find((s) => !s.result.passed) ?? verdict.authoritative
      : verdict.authoritative;

    const raw = `${failing.result.stdout}\n${failing.result.stderr}`;
    const triage = triageFailure(raw);

    session.messages.push({
      role: "verification",
      status: "failed",
      command: failing.command,
      output: [
        failing.label === "heldOut"
          ? "These failures come from the held-out suite, which you cannot read. The case names and errors are the only evidence available."
          : "",
        "",
        formatTriage(triage),
        "",
        "Raw output:",
        truncate(failing.result.stdout, MAX_TOOL_OUTPUT_CHARS),
        truncate(failing.result.stderr, MAX_TOOL_OUTPUT_CHARS),
      ].filter(Boolean).join("\n"),
      attempt,
    });
  }

  onEvent?.({ type: "complete", success, attempts: attempt });

  return session;
}

function findTool(name: string): Tool | undefined {
  return allTools.find(t => t.definition.name === name);
}

const DIVIDER = "────────────────────────────────────";

function suiteLine(suite: SuiteOutcome): string {
  const { result } = suite;
  const mark = result.passed ? "✓" : "✗";
  const name = suite.label === "heldOut" ? "held-out" : "visible";
  const counts = result.testReport?.recognised
    ? ` ${result.testReport.passed ?? 0} passed, ${result.testReport.failed ?? 0} failed`
    : "";
  const reason = result.vacuous ? " (ran no tests)" : "";
  return `  ${mark} ${name}${counts}${reason}`;
}

function formatVerdict(verdict: CombinedVerdict, attempt: number, maxAttempts: number): string {
  const lines = ["Verification", DIVIDER];

  for (const suite of verdict.suites) {
    lines.push(suiteLine(suite));
  }

  if (verdict.passed) {
    const hadHeldOut = verdict.suites.some((s) => s.label === "heldOut");
    lines.push(
      "",
      hadHeldOut
        ? "✓ Visible and held-out suites both green"
        : "✓ Verification successful"
    );
    return lines.join("\n");
  }

  lines.push("", `✗ Verification failed (attempt ${attempt}/${maxAttempts})`);
  return lines.join("\n");
}