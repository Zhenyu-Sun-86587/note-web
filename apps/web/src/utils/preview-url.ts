import { getDirname } from "./note-path";

export function resolveMarkdownPreviewUrl(
  notePath: string,
  src: string,
): string {
  if (!src) return src;

  // Do not rewrite external URLs, data URLs, or already-resolved API URLs
  if (
    src.startsWith("http://") ||
    src.startsWith("https://") ||
    src.startsWith("data:") ||
    src.startsWith("/api/raw/") ||
    src.startsWith("//")
  ) {
    return src;
  }

  if (src.startsWith("/")) {
    return `/api/raw${src}`;
  }

  const noteDir = getDirname(notePath);
  const combined = noteDir ? `${noteDir}/${src}` : src;

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
