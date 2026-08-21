export interface HeadingItem {
  id: string;
  level: number;
  text: string;
  line: number;
}

/**
 * Parses markdown headings H1-H6 from raw text in real-time.
 * Ignores headings enclosed in fenced code blocks (``` or ~~~).
 */
export function parseHeadings(content: string): HeadingItem[] {
  if (!content) return [];

  const lines = content.split(/\r?\n/);
  const headings: HeadingItem[] = [];
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();

    // Check for code fences (``` or ~~~)
    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) {
      continue;
    }

    // CommonMark: up to 3 leading spaces allowed before #
    const match = line.match(/^ {0,3}(#{1,6})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      // Strip trailing optional heading hashes (e.g. "## Heading 2 ##")
      const text = match[2].replace(/\s+#+\s*$/, "").trim();
      if (text) {
        headings.push({
          id: `heading-${i + 1}-${level}`,
          level,
          text,
          line: i + 1,
        });
      }
    }
  }

  return headings;
}
