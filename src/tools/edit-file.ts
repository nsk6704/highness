import { Tool, ToolResult } from "../agent/messages.js";
import { resolvePath, cwd } from "../utils/paths.js";
import { assertWritable } from "./guard.js";
import { writeFile, mkdir } from "fs/promises";
import { dirname } from "path";

const EditFileParams = {
  type: "object",
  properties: {
    path: { type: "string", description: "Path to the file to edit" },
    content: { type: "string", description: "Complete new content for the file" },
  },
  required: ["path", "content"],
};

export const editFileTool: Tool = {
  definition: {
    name: "edit_file",
    description: "Replace the entire content of a file (for MVP, this is equivalent to write_file)",
    parameters: EditFileParams,
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const path = resolvePath(args.path as string);
      assertWritable(cwd, path);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, args.content as string, "utf-8");
      return { success: true, output: `File edited: ${args.path}` };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },
};