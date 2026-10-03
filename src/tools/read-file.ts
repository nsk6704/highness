import { Tool, ToolResult } from "../agent/messages.js";
import { resolvePath, cwd } from "../utils/paths.js";
import { assertReadable } from "./guard.js";
import { readFile } from "fs/promises";

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
      assertReadable(cwd, path);
      const content = await readFile(path, "utf-8");
      return { success: true, output: content };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },
};