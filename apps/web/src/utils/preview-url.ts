import { getDirname } from "./note-path";

export function resolveMarkdownPreviewUrl(
  notePath: string,
  src: string,
): string {
  if (!src) return src;

  let cleanSrc = src.trim();
  if (cleanSrc.startsWith("<") && cleanSrc.endsWith(">")) {
    cleanSrc = cleanSrc.slice(1, -1).trim();
  }

  // Do not rewrite external URLs, data URLs, or already-resolved API URLs
  if (
    cleanSrc.startsWith("http://") ||
    cleanSrc.startsWith("https://") ||
    cleanSrc.startsWith("data:") ||
    cleanSrc.startsWith("/api/raw/") ||
    cleanSrc.startsWith("//")
  ) {
    return cleanSrc;
  }

  if (cleanSrc.startsWith("/")) {
    return `/api/raw${cleanSrc}`;
  }

  const noteDir = getDirname(notePath);
  const combined = noteDir ? `${noteDir}/${cleanSrc}` : cleanSrc;

  // Normalize path segments (e.g. resolve ".." and ".")
  const segments = combined.replaceAll("\\", "/").split("/");
  const resolvedSegments: string[] = [];

  for (const seg of segments) {
    if (!seg || seg === ".") {
      continue;
    }
    if (seg === "..") {
      if (resolvedSegments.length > 0) {
        resolvedSegments.pop();
      }
    } else {
      resolvedSegments.push(seg);
    }
  }

  const normalizedPath = resolvedSegments.join("/");
  return `/api/raw/${normalizedPath}`;
}
