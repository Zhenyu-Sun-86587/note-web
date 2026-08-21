import { describe, it, expect } from "vitest";
import { parseHeadings } from "../utils/outline-parser";

describe("Outline / Heading Parser", () => {
  it("parses H1 to H6 headings with line numbers and levels", () => {
    const md = [
      "# Heading 1",
      "Some paragraph text",
      "## Heading 2",
      "### Heading 3",
      "#### Heading 4",
      "##### Heading 5",
      "###### Heading 6",
    ].join("\n");

    const headings = parseHeadings(md);
    expect(headings).toHaveLength(6);
    expect(headings[0]).toEqual({
      id: "heading-1-1",
      level: 1,
      text: "Heading 1",
      line: 1,
      index: 0,
    });
    expect(headings[1]).toEqual({
      id: "heading-3-2",
      level: 2,
      text: "Heading 2",
      line: 3,
      index: 1,
    });
    expect(headings[2]).toEqual({
      id: "heading-4-3",
      level: 3,
      text: "Heading 3",
      line: 4,
      index: 2,
    });
    expect(headings[3]).toEqual({
      id: "heading-5-4",
      level: 4,
      text: "Heading 4",
      line: 5,
      index: 3,
    });
    expect(headings[4]).toEqual({
      id: "heading-6-5",
      level: 5,
      text: "Heading 5",
      line: 6,
      index: 4,
    });
    expect(headings[5]).toEqual({
      id: "heading-7-6",
      level: 6,
      text: "Heading 6",
      line: 7,
      index: 5,
    });
  });

  it("ignores headings inside backtick fenced code blocks", () => {
    const md = [
      "# Real Heading 1",
      "```typescript",
      "# Not a heading",
      "## Also not a heading",
      "```",
      "## Real Heading 2",
    ].join("\n");

    const headings = parseHeadings(md);
    expect(headings).toHaveLength(2);
    expect(headings[0].text).toBe("Real Heading 1");
    expect(headings[0].line).toBe(1);
    expect(headings[0].index).toBe(0);
    expect(headings[1].text).toBe("Real Heading 2");
    expect(headings[1].line).toBe(6);
    expect(headings[1].index).toBe(1);
  });

  it("ignores headings inside tilde fenced code blocks", () => {
    const md = [
      "# Top Title",
      "~~~bash",
      "### Comment in bash",
      "~~~",
      "### Sub Title",
    ].join("\n");

    const headings = parseHeadings(md);
    expect(headings).toHaveLength(2);
    expect(headings[0].text).toBe("Top Title");
    expect(headings[1].text).toBe("Sub Title");
    expect(headings[1].line).toBe(5);
  });

  it("requires closing fence to use the same character and matching length", () => {
    const md = [
      "# Heading A",
      "````markdown",
      "# Inside 4-backtick block",
      "```", // 3 backticks cannot close 4 backticks
      "## Still inside",
      "~~~", // tildes cannot close backticks
      "### Still inside",
      "````", // closes 4-backtick block
      "# Heading B",
    ].join("\n");

    const headings = parseHeadings(md);
    expect(headings).toHaveLength(2);
    expect(headings[0].text).toBe("Heading A");
    expect(headings[0].line).toBe(1);
    expect(headings[1].text).toBe("Heading B");
    expect(headings[1].line).toBe(9);
  });

  it("handles trailing hashes and whitespace in headings", () => {
    const md = "## Heading with trailing hashes ###   \n### Another ##";
    const headings = parseHeadings(md);
    expect(headings).toHaveLength(2);
    expect(headings[0].text).toBe("Heading with trailing hashes");
    expect(headings[1].text).toBe("Another");
  });

  it("returns empty array for content without headings or empty string", () => {
    expect(parseHeadings("")).toEqual([]);
    expect(parseHeadings("Just some plain paragraph\nwith multiple lines")).toEqual([]);
  });

  it("handles indented headings up to 3 spaces", () => {
    const md = "   # Indented 3 spaces\n    # Indented 4 spaces (code block in MD)";
    const headings = parseHeadings(md);
    expect(headings).toHaveLength(1);
    expect(headings[0].text).toBe("Indented 3 spaces");
  });
});
