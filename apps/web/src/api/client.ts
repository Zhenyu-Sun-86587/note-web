import type {
  TreeNode,
  NoteDocument,
  SearchMatch,
  AssetUploadResult,
  ApiError,
} from "./types";

export class ClientError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number,
    public currentRevision?: string,
  ) {
    super(message);
    this.name = "ClientError";
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errPayload: ApiError | null = null;
    try {
      errPayload = (await res.json()) as ApiError;
    } catch {
      // not json
    }
    const code = errPayload?.error?.code || `HTTP_${res.status}`;
    const message =
      errPayload?.error?.message || `Request failed with status ${res.status}`;
    const currentRevision = errPayload?.currentRevision;
    throw new ClientError(code, message, res.status, currentRevision);
  }

  if (res.status === 204) {
    return undefined as unknown as T;
  }

  return (await res.json()) as T;
}

export async function fetchTree(): Promise<{ items: TreeNode[] }> {
  const res = await fetch("/api/tree");
  return handleResponse<{ items: TreeNode[] }>(res);
}

export async function fetchNote(path: string): Promise<NoteDocument> {
  const res = await fetch(`/api/note?path=${encodeURIComponent(path)}`);
  return handleResponse<NoteDocument>(res);
}

export async function createNote(
  path: string,
  content = "",
): Promise<NoteDocument> {
  const res = await fetch("/api/note", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, content }),
  });
  return handleResponse<NoteDocument>(res);
}

export async function saveNote(
  path: string,
  content: string,
  baseRevision: string,
): Promise<NoteDocument> {
  const res = await fetch(`/api/note?path=${encodeURIComponent(path)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, baseRevision }),
  });
  return handleResponse<NoteDocument>(res);
}

export async function renameOrMoveNote(
  path: string,
  newPath: string,
): Promise<{ ok: boolean; path: string }> {
  const res = await fetch(`/api/note?path=${encodeURIComponent(path)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newPath }),
  });
  return handleResponse<{ ok: boolean; path: string }>(res);
}

export async function deleteNote(path: string): Promise<void> {
  const res = await fetch(`/api/note?path=${encodeURIComponent(path)}`, {
    method: "DELETE",
  });
  return handleResponse<void>(res);
}

export async function createFolder(
  path: string,
): Promise<{ ok: boolean; path: string }> {
  const res = await fetch("/api/folder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  return handleResponse<{ ok: boolean; path: string }>(res);
}

export async function deleteFolder(path: string): Promise<void> {
  const res = await fetch(`/api/folder?path=${encodeURIComponent(path)}`, {
    method: "DELETE",
  });
  return handleResponse<void>(res);
}

export async function searchNotes(
  query: string,
  limit = 50,
): Promise<{ items: SearchMatch[] }> {
  const res = await fetch(
    `/api/search?q=${encodeURIComponent(query)}&limit=${limit}`,
  );
  return handleResponse<{ items: SearchMatch[] }>(res);
}

export async function uploadAsset(
  file: File,
  notePath: string,
): Promise<AssetUploadResult> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("notePath", notePath);

  const res = await fetch("/api/assets", {
    method: "POST",
    body: formData,
  });
  return handleResponse<AssetUploadResult>(res);
}
