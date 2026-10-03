import { Tool, ToolResult } from "../agent/messages.js";
import { cwd } from "../utils/paths.js";
import { assertShellAllowed } from "./guard.js";
import { spawn } from "child_process";

const ShellParams = {
  type: "object",
  properties: {
    command: { type: "string", description: "Shell command to execute" },
    timeout: { type: "number", description: "Timeout in milliseconds", default: 60000 },
  },
  required: ["command"],
};

export const shellTool: Tool = {
  definition: {
    name: "shell",
    description: "Execute a shell command and return the result",
    parameters: ShellParams,
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const command = args.command as string;
    const timeout = (args.timeout as number) || 60000;

    try {
      assertShellAllowed(cwd, command);
    } catch (error) {
      return { success: false, error: String(error) };
    }

    return new Promise((resolve) => {
      const proc = spawn(command, {
        shell: true,
        stdio: ["ignore", "pipe", "pipe"],
        cwd,
      });

      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill("SIGTERM");
      }, timeout);

      proc.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        clearTimeout(timer);
        if (timedOut) {
          resolve({
            success: false,
            error: `Command timed out after ${timeout}ms`,
            output: stdout + stderr,
          });
        } else {
          resolve({
            success: code === 0,
            output: stdout + stderr,
            error: code !== 0 ? `Exit code: ${code}` : undefined,
          });
        }
      });

      proc.on("error", (error) => {
        clearTimeout(timer);
        resolve({ success: false, error: String(error) });
      });
    });
  },
};