import "dotenv/config";
import OpenAI from "openai";
import { Model, ModelResponse, ToolDefinition, Message, DEFAULT_MODEL } from "../agent/messages.js";

const OLLAMA_BASE_URL = "https://ollama.com/v1";

type FunctionToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

function isFunctionToolCall(tc: unknown): tc is FunctionToolCall {
  const c = tc as Partial<FunctionToolCall> | undefined;
  return c?.type === "function" && typeof c?.function?.name === "string";
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export class OllamaModel implements Model {
  private client: OpenAI;
  private model: string;

  constructor(apiKey?: string, model: string = process.env.OLLAMA_MODEL || DEFAULT_MODEL) {
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OLLAMA_API_KEY || "",
      baseURL: OLLAMA_BASE_URL,
    });
    this.model = model;
  }

  async generate(messages: Message[], tools: ToolDefinition[]): Promise<ModelResponse> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: this.convertMessages(messages),
      tools: this.convertTools(tools),
      tool_choice: "auto",
      temperature: 0.1,
      max_tokens: 8192,
    });

    const choice = completion.choices[0];
    const message = choice.message;
    const call = message.tool_calls?.find(isFunctionToolCall);

    if (!call) {
      return {
        type: "final",
        content: message.content || "",
        message: { role: "assistant", content: message.content },
      };
    }

    if (choice.finish_reason === "length") {
      return {
        type: "tool_call",
        toolCall: {
          id: call.id,
          name: call.function.name,
          arguments: {
            ...parseArgs(call.function.arguments),
            __harness_error: "Response was truncated before arguments completed. Retry with shorter output.",
          },
        },
        message: { role: "assistant", content: message.content },
      };
    }

    return {
      type: "tool_call",
      toolCall: {
        id: call.id,
        name: call.function.name,
        arguments: parseArgs(call.function.arguments),
      },
      message: {
        role: "assistant",
        content: message.content,
        tool_calls: (message.tool_calls ?? []).filter(isFunctionToolCall).map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })),
      },
    };
  }

  private convertMessages(messages: Message[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    return messages.map((msg) => {
      switch (msg.role) {
        case "system":
          return { role: "system", content: msg.content };
        case "user":
          return { role: "user", content: msg.content };
        case "assistant":
          return { role: "assistant", content: msg.content, tool_calls: msg.tool_calls };
        case "tool":
          return { role: "tool", content: msg.content, tool_call_id: msg.tool_call_id };
        case "verification":
          return {
            role: "user",
            content: [
              "[VERIFICATION FAILED]",
              `The requested change has NOT been verified.`,
              `Command: ${msg.command}`,
              `Attempt: ${msg.attempt}`,
              "",
              msg.output,
              "",
              "Analyze the failure, repair the implementation, and try again.",
            ].join("\n"),
          };
      }
    });
  }

  private convertTools(tools: ToolDefinition[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
    return tools.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters as OpenAI.FunctionParameters,
      },
    }));
  }
}