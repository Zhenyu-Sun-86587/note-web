import { describe, it, expect } from "vitest";
import { renderMarkdown, escapeHtml } from "../utils/markdown-renderer";

describe("Markdown Renderer for Vim Preview", () => {
  it("escapes special HTML characters properly", () => {
    expect(escapeHtml("<div>&'\"</div>")).toBe("&lt;div&gt;&amp;&#39;&quot;&lt;/div&gt;");
  });

  it("renders headings H1 to H6 with data-source-line", () => {
    const md = "# Title 1\n## Title 2\n### Title 3\n#### Title 4\n##### Title 5\n###### Title 6";
    const html = renderMarkdown(md, "inbox/note.md");
    expect(html).toContain('<h1 id="heading-1" data-source-line="1">Title 1</h1>');
    expect(html).toContain('<h2 id="heading-2" data-source-line="2">Title 2</h2>');
    expect(html).toContain('<h3 id="heading-3" data-source-line="3">Title 3</h3>');
    expect(html).toContain('<h4 id="heading-4" data-source-line="4">Title 4</h4>');
    expect(html).toContain('<h5 id="heading-5" data-source-line="5">Title 5</h5>');
    expect(html).toContain('<h6 id="heading-6" data-source-line="6">Title 6</h6>');
  });

  it("renders inline styles: bold, italic, code, strikethrough", () => {
    const md = "**Bold text** and *italic text* and `code snippet` and ~~strike~~";
    const html = renderMarkdown(md, "inbox/note.md");
    expect(html).toContain("<strong>Bold text</strong>");
    expect(html).toContain("<em>italic text</em>");
    expect(html).toContain("<code>code snippet</code>");
    expect(html).toContain("<del>strike</del>");
  });

  it("renders fenced code blocks with data-source-line and data-source-end-line", () => {
    const md = "```typescript\nconst x: number = 1 < 2;\n// **Not Bold**\n```";
    const html = renderMarkdown(md, "inbox/note.md");
    expect(html).toContain('<pre data-source-line="1" data-source-end-line="4"><code class="language-typescript">const x: number = 1 &lt; 2;\n// **Not Bold**</code></pre>');
  });

  it("renders blockquotes with data-source-line", () => {
    const md = "> This is a quote\n> Second line";
    const html = renderMarkdown(md, "inbox/note.md");
    expect(html).toContain('<blockquote data-source-line="1" data-source-end-line="2">');
    expect(html).toContain("This is a quote");
  });

  it("renders unordered and ordered lists with data-source-line", () => {
    const ulMd = "- Item 1\n- Item 2";
    const ulHtml = renderMarkdown(ulMd, "inbox/note.md");
    expect(ulHtml).toContain('<ul data-source-line="1" data-source-end-line="2">');
    expect(ulHtml).toContain('<li data-source-line="1">Item 1</li>');
    expect(ulHtml).toContain('<li data-source-line="2">Item 2</li>');

    const olMd = "1. First\n2. Second";
    const olHtml = renderMarkdown(olMd, "inbox/note.md");
    expect(olHtml).toContain('<ol data-source-line="1" data-source-end-line="2">');
    expect(olHtml).toContain('<li data-source-line="1">First</li>');
    expect(olHtml).toContain('<li data-source-line="2">Second</li>');
  });

  it("renders task lists with checkboxes and data-source-line", () => {
    const taskMd = "- [x] Finished task\n- [ ] Pending task";
    const html = renderMarkdown(taskMd, "inbox/note.md");
    expect(html).toContain('<li class="task-list-item" data-source-line="1"><input type="checkbox" disabled checked="" /> Finished task</li>');
    expect(html).toContain('<li class="task-list-item" data-source-line="2"><input type="checkbox" disabled /> Pending task</li>');
  });

  it("renders markdown tables with headers, rows, and data-source-line", () => {
    const tableMd = [
      "| Name | Role | Location |",
      "| :--- | :---: | ---: |",
      "| Alice | Dev | Shanghai |",
      "| Bob | Designer | Beijing |",
    ].join("\n");

    const html = renderMarkdown(tableMd, "inbox/note.md");
    expect(html).toContain('<table data-source-line="1" data-source-end-line="4">');
    expect(html).toContain("<th style=\"text-align: left\">Name</th>");
    expect(html).toContain("<th style=\"text-align: center\">Role</th>");
    expect(html).toContain("<th style=\"text-align: right\">Location</th>");
    expect(html).toContain("<td style=\"text-align: left\">Alice</td>");
    expect(html).toContain("<td style=\"text-align: center\">Dev</td>");
    expect(html).toContain("<td style=\"text-align: right\">Shanghai</td>");
  });

  it("resolves relative image paths to /api/raw/... URL without modifying source markdown", () => {
    const md = "![My Image](../attachments/photo.png)";
    const html = renderMarkdown(md, "projects/work.md");
    expect(html).toContain('<img src="/api/raw/attachments/photo.png" alt="My Image" loading="lazy" />');
  });

  it("leaves absolute / remote image URLs untouched", () => {
    const md = "![Remote](https://example.com/logo.png)";
    const html = renderMarkdown(md, "projects/work.md");
    expect(html).toContain('<img src="https://example.com/logo.png" alt="Remote" loading="lazy" />');
  });

  it("renders links with target=_blank and rel=noopener", () => {
    const md = "[Google](https://google.com)";
    const html = renderMarkdown(md, "inbox/note.md");
    expect(html).toContain('<a href="https://google.com" target="_blank" rel="noopener noreferrer">Google</a>');
  });

  it("renders horizontal rules with data-source-line", () => {
    const md = "Paragraph 1\n\n---\n\nParagraph 2";
    const html = renderMarkdown(md, "inbox/note.md");
    expect(html).toContain('<hr data-source-line="3" />');
  });

  it("handles empty or whitespace-only markdown gracefully", () => {
    const html = renderMarkdown("   ", "inbox/note.md");
    expect(html).toContain("无内容");
  });

  it("correctly resolves vim/tmp orca-paste images without corruption from underscores", () => {
    const md = "![orca-paste-1787334465553-00f21410-bcc9-459b-aed8-dab32b8ccb4b.png](vim/tmp/orca-paste-1787334465553-00f21410-bcc9-459b-aed8-dab32b8ccb4b.png)";
    const html = renderMarkdown(md, "test.md");
    expect(html).toContain(
      '<img src="/api/raw/vim/tmp/orca-paste-1787334465553-00f21410-bcc9-459b-aed8-dab32b8ccb4b.png" alt="orca-paste-1787334465553-00f21410-bcc9-459b-aed8-dab32b8ccb4b.png" loading="lazy" />',
    );
    expect(html).not.toContain("<em>");
  });

  it("preserves image URLs with multiple underscores alongside italic and bold text", () => {
    const md = "_italic_ ![Snipaste_2026-08-20_23-05-54.png](../attachments/2026/08/1787238353952-Snipaste_2026-08-20_23-05-54.png) **bold_text**";
    const html = renderMarkdown(md, "保研复习/Paper.md");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<strong>bold_text</strong>");
    expect(html).toContain(
      '<img src="/api/raw/attachments/2026/08/1787238353952-Snipaste_2026-08-20_23-05-54.png" alt="Snipaste_2026-08-20_23-05-54.png" loading="lazy" />',
    );
  });

  it("handles image titles and angle bracket formatting", () => {
    const md = '![Alt Text](<vim/tmp/orca-paste.png> "Custom Image Title")';
    const html = renderMarkdown(md, "test.md");
    expect(html).toContain(
      '<img src="/api/raw/vim/tmp/orca-paste.png" alt="Alt Text" title="Custom Image Title" loading="lazy" />',
    );
  });

  it("renders raw HTML img tags with resolved relative src", () => {
    const md = '<img src="vim/tmp/orca-paste-1787334465553-00f21410-bcc9-459b-aed8-dab32b8ccb4b.png" alt="Screenshot" width="400" />';
    const html = renderMarkdown(md, "test.md");
    expect(html).toContain(
      '<img src="/api/raw/vim/tmp/orca-paste-1787334465553-00f21410-bcc9-459b-aed8-dab32b8ccb4b.png" alt="Screenshot" width="400" loading="lazy" />',
    );
  });

  it("renders link-wrapped images properly", () => {
    const md = "[![Screenshot](vim/tmp/orca-paste.png)](https://example.com)";
    const html = renderMarkdown(md, "test.md");
    expect(html).toContain(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer"><img src="/api/raw/vim/tmp/orca-paste.png" alt="Screenshot" loading="lazy" /></a>',
    );
  });

  it("renders mermaid fenced code blocks with mermaid-block and mermaid-diagram", () => {
    const md = "```mermaid\ngraph TD\n    A[Start] --> B[End]\n```";
    const html = renderMarkdown(md, "inbox/note.md");
    expect(html).toContain('<div class="mermaid-block" data-source-line="1" data-source-end-line="4">');
    expect(html).toContain('<div class="mermaid-diagram" data-mermaid-code="graph TD\n    A[Start] --&gt; B[End]">graph TD\n    A[Start] --&gt; B[End]</div>');
  });
});
