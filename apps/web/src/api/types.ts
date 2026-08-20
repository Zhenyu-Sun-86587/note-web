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

export interface NoteDocument {
  path: string;
  content: string;
  revision: string;
  modifiedAt: string;
  size: number;
}

export type SaveStatus =
  | "idle"
  | "dirty"
  | "saving"
  | "saved"
  | "conflict"
  | "error";

export interface SearchMatch {
  path: string;
  line: number;
  snippet: string;
}

export interface AssetUploadResult {
  name: string;
  vaultPath: string;
  markdownPath: string;
  previewUrl: string;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
  currentRevision?: string;
}
