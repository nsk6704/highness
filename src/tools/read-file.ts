import { Tool, ToolDefinition, ToolResult } from "../agent/messages.js";
import { resolvePath } from "../utils/paths.js";
import { readFile, writeFile } from "fs/promises";

const ReadFileParams = {
  type: "object",
  properties: {
    path: { type: "string", description: "Path to the file to read" },
  },
  required: ["path"],
};

export const readFileTool: Tool = {
  definition: {
    name: "read_file",
    description: "Read the contents of a file",
    parameters: ReadFileParams,
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const path = resolvePath(args.path as string);
      const content = await readFile(path, "utf-8");
      return { success: true, output: content };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },
};