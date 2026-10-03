import { readFileTool } from "./read-file.js";
import { writeFileTool } from "./write-file.js";
import { editFileTool } from "./edit-file.js";
import { shellTool } from "./shell.js";

export { readFileTool, writeFileTool, editFileTool, shellTool };

export const allTools = [readFileTool, writeFileTool, editFileTool, shellTool];
export const toolDefinitions = allTools.map(t => t.definition);