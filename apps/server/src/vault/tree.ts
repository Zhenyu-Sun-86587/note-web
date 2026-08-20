import fs from "node:fs";
import path from "node:path";

export interface NoteNode {
  type: "note";
  name: string;
  path: string;
  modifiedAt: string;
  size: number;
}

export interface FolderNode {
  type: "folder";
  name: string;
  path: string;
  children: TreeNode[];
}

export type TreeNode = FolderNode | NoteNode;

export async function scanTree(vaultRoot: string): Promise<{ items: TreeNode[] }> {
  async function scanDirectory(
    dirFullPath: string,
    relativeDir: string,
    isRoot: boolean,
  ): Promise<TreeNode[]> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dirFullPath, { withFileTypes: true });
    } catch {
      return [];
    }

    const folders: FolderNode[] = [];
    const notes: NoteNode[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      if (isRoot && entry.name.toLowerCase() === "attachments") {
        continue;
      }

      const entryRelPath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      const entryFullPath = path.join(dirFullPath, entry.name);

      if (entry.isSymbolicLink()) {
        continue;
      }

      if (entry.isDirectory()) {
        const children = await scanDirectory(entryFullPath, entryRelPath, false);
        folders.push({
          type: "folder",
          name: entry.name,
          path: entryRelPath,
          children,
        });
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        try {
          const stat = await fs.promises.stat(entryFullPath);
          notes.push({
            type: "note",
            name: entry.name,
            path: entryRelPath,
            modifiedAt: stat.mtime.toISOString(),
            size: stat.size,
          });
        } catch {
          // ignore unreadable files
        }
      }
    }

    folders.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
    );
    notes.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
    );

    return [...folders, ...notes];
  }

  const items = await scanDirectory(vaultRoot, "", true);
  return { items };
}
