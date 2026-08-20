import { getDirname, getBasename, joinPaths } from "./note-path";

export function generateConflictPath(originalPath: string): string {
  const dir = getDirname(originalPath);
  const base = getBasename(originalPath);
  const nameWithoutExt = base.endsWith(".md") ? base.slice(0, -3) : base;

  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  const conflictFilename = `${nameWithoutExt}.conflict-${timestamp}.md`;
  return dir ? joinPaths(dir, conflictFilename) : conflictFilename;
}
