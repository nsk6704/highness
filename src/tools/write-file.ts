import { Tool, ToolResult } from "../agent/messages.js";
import { resolvePath } from "../utils/paths.js";
import { writeFile, mkdir } from "fs/promises";
import { dirname } from "path";

const WriteFileParams = {
  type: "object",
  properties: {
    path: { type: "string", description: "Path to the file to write" },
    content: { type: "string", description: "Content to write to the file" },
  },
  required: ["path", "content"],
};

export const writeFileTool: Tool = {
  definition: {
    name: "write_file",
    description: "Create or overwrite a file with the given content",
    parameters: WriteFileParams,
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const path = resolvePath(args.path as string);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, args.content as string, "utf-8");
      return { success: true, output: `File written: ${args.path}` };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },
};