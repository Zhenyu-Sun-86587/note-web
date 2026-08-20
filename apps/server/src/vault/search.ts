import fs from "node:fs";
import path from "node:path";

export interface SearchMatch {
  path: string;
  line: number;
  snippet: string;
}

export async function searchVault(
  vaultRoot: string,
  query: string,
  limit = 50,
  maxNoteBytes = 2097152,
): Promise<{ items: SearchMatch[] }> {
  const matches: SearchMatch[] = [];
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return { items: [] };
  }

  async function walkDir(dirFullPath: string, relativeDir: string, isRoot: boolean): Promise<void> {
    if (matches.length >= limit) {
      return;
    }

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dirFullPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (matches.length >= limit) {
        break;
      }
      if (entry.name.startsWith(".")) {
        continue;
      }
      if (isRoot && entry.name.toLowerCase() === "attachments") {
        continue;
      }
      if (entry.isSymbolicLink()) {
        continue;
      }

      const entryRelPath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      const entryFullPath = path.join(dirFullPath, entry.name);

      if (entry.isDirectory()) {
        await walkDir(entryFullPath, entryRelPath, false);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        try {
          const stat = await fs.promises.stat(entryFullPath);
          let fileMatches = 0;

          // Check filename match
          if (entryRelPath.toLowerCase().includes(normalizedQuery)) {
            matches.push({
              path: entryRelPath,
              line: 1,
              snippet: entry.name,
            });
            fileMatches++;
          }

          // Check content match if not exceeding max size
          if (stat.size <= maxNoteBytes && fileMatches < 3 && matches.length < limit) {
            const content = await fs.promises.readFile(entryFullPath, "utf8");
            const lines = content.split("\n");

            for (let i = 0; i < lines.length; i++) {
              if (fileMatches >= 3 || matches.length >= limit) {
                break;
              }
              const line = lines[i];
              if (line.toLowerCase().includes(normalizedQuery)) {
                let snippet = line.trim();
                if (snippet.length > 120) {
                  const idx = snippet.toLowerCase().indexOf(normalizedQuery);
                  const start = Math.max(0, idx - 40);
                  snippet = (start > 0 ? "..." : "") + snippet.slice(start, start + 100) + "...";
                }
                matches.push({
                  path: entryRelPath,
                  line: i + 1,
                  snippet,
                });
                fileMatches++;
              }
            }
          }
        } catch {
          // ignore file read error
        }
      }
    }
  }

  await walkDir(vaultRoot, "", true);
  return { items: matches.slice(0, limit) };
}
