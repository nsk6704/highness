import { Model, Tool, Message, ToolResult, ToolDefinition, DEFAULT_MAX_ATTEMPTS, Session } from "./messages.js";
import { allTools, toolDefinitions } from "../tools/index.js";
import { runVerification, formatVerificationOutput, detectVerificationCommand } from "../verification/verifier.js";

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
7. When you believe the implementation is complete, provide a concise summary.`;

export interface AgentOptions {
  model: Model;
  task: string;
  verifyCommand?: string;
  maxAttempts?: number;
  onEvent?: (event: AgentEvent) => void;
}

export type AgentEvent =
  | { type: "start"; task: string }
  | { type: "agent_thinking" }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_limit"; calls: number; limit: number }
  | { type: "tool_result"; name: string; result: ToolResult }
  | { type: "agent_message"; content: string }
  | { type: "verification_start"; command: string; attempt: number; maxAttempts: number }
  | { type: "verification_result"; result: { passed: boolean; output: string }; attempt: number; maxAttempts: number }
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

  const verifyCmd = verifyCommand || detectVerificationCommand() || "npm test";

  session.messages.push({ role: "system", content: SYSTEM_PROMPT });
  session.messages.push({ role: "user", content: task });

  onEvent?.({ type: "start", task });

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

    // Run verification
    onEvent?.({ type: "verification_start", command: verifyCmd, attempt, maxAttempts });
    const verificationResult = await runVerification(verifyCmd);
    session.verificationResults.push(verificationResult);
    
    const verificationOutput = formatVerificationOutput(verificationResult, attempt, maxAttempts);
    onEvent?.({ 
      type: "verification_result", 
      result: { passed: verificationResult.passed, output: verificationOutput }, 
      attempt, 
      maxAttempts 
    });

    if (verificationResult.passed) {
      success = true;
      break;
    }

    // Add verification failure to conversation for repair
    session.messages.push({
      role: "verification",
      status: "failed",
      command: verifyCmd,
      output: [
        `Exit code: ${verificationResult.exitCode}`,
        "",
        "Stdout:",
        truncate(verificationResult.stdout, MAX_TOOL_OUTPUT_CHARS),
        "",
        "Stderr:",
        truncate(verificationResult.stderr, MAX_TOOL_OUTPUT_CHARS),
      ].join("\n"),
      attempt,
    });
  }

  onEvent?.({ type: "complete", success, attempts: attempt });

  return session;
}

function findTool(name: string): Tool | undefined {
  return allTools.find(t => t.definition.name === name);
}