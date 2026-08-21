export interface HeadingItem {
  id: string;
  level: number;
  text: string;
  line: number;
  index: number;
}

/**
 * Parses markdown headings H1-H6 from raw text in real-time.
 * Ignores headings enclosed in fenced code blocks (``` or ~~~).
 */
export function parseHeadings(content: string): HeadingItem[] {
  if (!content) return [];

  const lines = content.split(/\r?\n/);
  const headings: HeadingItem[] = [];
  let fenceChar: string | null = null;
  let fenceLength = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for code fences (``` or ~~~) with CommonMark rules
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fenceMatch) {
      const matchFence = fenceMatch[1];
      const matchChar = matchFence[0];
      const matchLength = matchFence.length;
      const rest = fenceMatch[2].trim();

      if (fenceChar === null) {
        // Opening fence
        fenceChar = matchChar;
        fenceLength = matchLength;
        continue;
      } else if (
        matchChar === fenceChar &&
        matchLength >= fenceLength &&
        (matchChar === "~" || !rest.includes("`"))
      ) {
        // Closing fence must match opening fence char and length >= opening length
        fenceChar = null;
        fenceLength = 0;
        continue;
      }
    }

    if (fenceChar !== null) {
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
          index: headings.length,
        });
      }
    }
  }

  return headings;
}
