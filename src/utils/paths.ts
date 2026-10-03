import { resolve, relative, isAbsolute } from "path";

export const cwd = process.cwd();

/** Resolves a repo-relative path and rejects traversal outside the repository. */
export function resolvePath(userPath: string): string {
  const resolved = resolve(cwd, userPath);
  const relativePath = relative(cwd, resolved);

  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error(`Path traversal not allowed: ${userPath}`);
  }

  return resolved;
}

export function getCwd(): string {
  return cwd;
}

export function makeRelative(path: string): string {
  return relative(cwd, path);
}