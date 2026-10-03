import { z } from "zod";

export const ToolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: z.record(z.unknown()),
});

export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;

export const ToolResultSchema = z.object({
  success: z.boolean(),
  output: z.string().optional(),
  error: z.string().optional(),
});

export type ToolResult = z.infer<typeof ToolResultSchema>;

export interface Tool {
  definition: ToolDefinition;
  execute(args: Record<string, unknown>): Promise<ToolResult>;
}

const SystemMessageSchema = z.object({
  role: z.literal("system"),
  content: z.string(),
});

const UserMessageSchema = z.object({
  role: z.literal("user"),
  content: z.string(),
});

const AssistantMessageSchema = z.object({
  role: z.literal("assistant"),
  content: z.string().nullable(),
  tool_calls: z.array(z.object({
    id: z.string(),
    type: z.literal("function"),
    function: z.object({
      name: z.string(),
      arguments: z.string(),
    }),
  })).optional(),
});

const ToolMessageSchema = z.object({
  role: z.literal("tool"),
  content: z.string(),
  tool_call_id: z.string(),
});

const VerificationMessageSchema = z.object({
  role: z.literal("verification"),
  status: z.enum(["passed", "failed"]),
  command: z.string(),
  output: z.string(),
  attempt: z.number(),
});

export const MessageSchema = z.discriminatedUnion("role", [
  SystemMessageSchema,
  UserMessageSchema,
  AssistantMessageSchema,
  ToolMessageSchema,
  VerificationMessageSchema,
]);

export type Message = z.infer<typeof MessageSchema>;
export type SystemMessage = z.infer<typeof SystemMessageSchema>;
export type UserMessage = z.infer<typeof UserMessageSchema>;
export type AssistantMessage = z.infer<typeof AssistantMessageSchema>;
export type ToolMessage = z.infer<typeof ToolMessageSchema>;
export type VerificationMessage = z.infer<typeof VerificationMessageSchema>;

export const ModelResponseSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("tool_call"),
    toolCall: z.object({
      id: z.string(),
      name: z.string(),
      arguments: z.record(z.unknown()),
    }),
    message: AssistantMessageSchema,
  }),
  z.object({
    type: z.literal("final"),
    content: z.string(),
    message: AssistantMessageSchema,
  }),
]);

export type ModelResponse = z.infer<typeof ModelResponseSchema>;

export interface Model {
  generate(messages: Message[], tools: ToolDefinition[]): Promise<ModelResponse>;
}

export interface VerificationResult {
  passed: boolean;
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface Session {
  task: string;
  messages: Message[];
  attempts: number;
  toolCalls: Array<{ name: string; args: Record<string, unknown>; result: ToolResult }>;
  verificationResults: VerificationResult[];
}

export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_MODEL = "gpt-oss:120b";