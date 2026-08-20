export function getBasename(filePath: string): string {
  const normalized = filePath.replaceAll("\\", "/");
  const segments = normalized.split("/").filter(Boolean);
  return segments.pop() || "";
}

export function getDirname(filePath: string): string {
  const normalized = filePath.replaceAll("\\", "/");
  const segments = normalized.split("/").filter(Boolean);
  segments.pop();
  return segments.join("/");
}

export function joinPaths(...parts: string[]): string {
  return parts
    .map((p) => p.replaceAll("\\", "/").replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

export function ensureMdExtension(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  return trimmed.endsWith(".md") ? trimmed : `${trimmed}.md`;
}

export function removeMdExtension(name: string): string {
  return name.endsWith(".md") ? name.slice(0, -3) : name;
}
