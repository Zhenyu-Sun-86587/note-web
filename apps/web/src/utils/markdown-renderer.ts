import { resolveMarkdownPreviewUrl } from "./preview-url";

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Parses inline markdown: bold, italic, code, links, images, strike, auto links.
 */
export function renderInline(text: string, notePath: string): string {
  // 1. Extract inline code blocks with neutral delimiter to protect them from italic/bold matching
  const codeTokens: string[] = [];
  let processed = text.replace(/`([^`]+)`/g, (_match, code) => {
    const idx = codeTokens.length;
    codeTokens.push(`<code>${escapeHtml(code)}</code>`);
    return `\uFFF0CODE${idx}\uFFF0`;
  });

  // 2. Images: ![alt](url)
  processed = processed.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, src) => {
    const cleanSrc = src.trim();
    const resolved = resolveMarkdownPreviewUrl(notePath, cleanSrc);
    return `<img src="${escapeHtml(resolved)}" alt="${escapeHtml(alt)}" loading="lazy" />`;
  });

  // 3. Links: [text](url)
  processed = processed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, linkText, url) => {
    const cleanUrl = url.trim();
    return `<a href="${escapeHtml(cleanUrl)}" target="_blank" rel="noopener noreferrer">${renderInline(linkText, notePath)}</a>`;
  });

  // 4. Bold + Italic: ***text***
  processed = processed.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");

  // 5. Bold: **text** or __text__
  processed = processed.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  processed = processed.replace(/__([^_]+)__/g, "<strong>$1</strong>");

  // 6. Italic: *text* or _text_
  processed = processed.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  processed = processed.replace(/_([^_]+)_/g, "<em>$1</em>");

  // 7. Strikethrough: ~~text~~
  processed = processed.replace(/~~([^~]+)~~/g, "<del>$1</del>");

  // 8. Auto link plain URLs (not inside tags)
  processed = processed.replace(
    /(^|[\s(])(https?:\/\/[^\s<)]+)/g,
    '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>',
  );

  // 9. Restore code tokens
  processed = processed.replace(/\uFFF0CODE(\d+)\uFFF0/g, (_match, idx) => {
    return codeTokens[Number(idx)] || "";
  });

  return processed;
}

/**
 * Checks if a table separator row (e.g. |---|:---|---:|)
 */
function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("-")) return false;
  const cells = trimmed
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

/**
 * Renders full Markdown document into HTML with source-line metadata for bidirectional sync scroll.
 */
export function renderMarkdown(markdown: string, notePath: string): string {
  if (!markdown || !markdown.trim()) {
    return '<div class="preview-empty">无内容</div>';
  }

  const lines = markdown.split(/\r?\n/);
  const out: string[] = [];
  let i = 0;
  let headingCount = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // 1. Empty line
    if (!trimmed) {
      i++;
      continue;
    }

    // 2. Fenced Code Block (supporting ``` and ~~~ with matching character and length)
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fenceMatch) {
      const startLine = i + 1;
      const openingFence = fenceMatch[1];
      const fenceChar = openingFence[0];
      const fenceLen = openingFence.length;
      const lang = fenceMatch[2].trim();
      const codeLines: string[] = [];
      i++;

      while (i < lines.length) {
        const curLine = lines[i];
        const closeMatch = curLine.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
        if (
          closeMatch &&
          closeMatch[1][0] === fenceChar &&
          closeMatch[1].length >= fenceLen &&
          (fenceChar === "~" || !closeMatch[2].includes("`"))
        ) {
          i++; // consume closing fence
          break;
        }
        codeLines.push(curLine);
        i++;
      }

      const endLine = i;
      const codeContent = escapeHtml(codeLines.join("\n"));
      out.push(
        `<pre data-source-line="${startLine}" data-source-end-line="${endLine}"><code class="${lang ? `language-${escapeHtml(lang)}` : ""}">${codeContent}</code></pre>`,
      );
      continue;
    }

    // 3. Headings
    const headingMatch = line.match(/^ {0,3}(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const startLine = i + 1;
      const level = headingMatch[1].length;
      const text = headingMatch[2].replace(/\s+#+\s*$/, "").trim();
      headingCount++;
      const id = `heading-${headingCount}`;
      out.push(
        `<h${level} id="${id}" data-source-line="${startLine}">${renderInline(escapeHtml(text), notePath)}</h${level}>`,
      );
      i++;
      continue;
    }

    // 4. Horizontal Rule
    if (/^ {0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      const startLine = i + 1;
      out.push(`<hr data-source-line="${startLine}" />`);
      i++;
      continue;
    }

    // 5. Blockquote
    if (trimmed.startsWith(">")) {
      const startLine = i + 1;
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      const endLine = i;
      const quoteHtml = renderMarkdown(quoteLines.join("\n"), notePath);
      out.push(
        `<blockquote data-source-line="${startLine}" data-source-end-line="${endLine}">${quoteHtml}</blockquote>`,
      );
      continue;
    }

    // 6. Table detection: current line has '|', next line is table separator
    if (
      trimmed.includes("|") &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1])
    ) {
      const startLine = i + 1;
      const headerLine = lines[i];
      const sepLine = lines[i + 1];
      const headerCells = headerLine
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => c.trim());

      const alignments = sepLine
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => {
          const t = c.trim();
          if (t.startsWith(":") && t.endsWith(":")) return "center";
          if (t.endsWith(":")) return "right";
          if (t.startsWith(":")) return "left";
          return "left";
        });

      i += 2;
      const rowLines: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim().includes("|") &&
        !lines[i].trim().startsWith("#")
      ) {
        rowLines.push(lines[i]);
        i++;
      }
      const endLine = i;

      let tableHtml = `<table data-source-line="${startLine}" data-source-end-line="${endLine}">\n<thead>\n<tr>\n`;
      headerCells.forEach((cell, idx) => {
        const align = alignments[idx] || "left";
        tableHtml += `  <th style="text-align: ${align}">${renderInline(escapeHtml(cell), notePath)}</th>\n`;
      });
      tableHtml += "</tr>\n</thead>\n<tbody>\n";

      for (const row of rowLines) {
        const cells = row
          .trim()
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((c) => c.trim());
        tableHtml += "<tr>\n";
        headerCells.forEach((_, idx) => {
          const cell = cells[idx] || "";
          const align = alignments[idx] || "left";
          tableHtml += `  <td style="text-align: ${align}">${renderInline(escapeHtml(cell), notePath)}</td>\n`;
        });
        tableHtml += "</tr>\n";
      }

      tableHtml += "</tbody>\n</table>";
      out.push(tableHtml);
      continue;
    }

    // 7. Lists (Unordered, Ordered, Task Lists)
    const ulMatch = line.match(/^ {0,3}([-*+])\s+(.*)$/);
    const olMatch = line.match(/^ {0,3}(\d+)\.\s+(.*)$/);

    if (ulMatch || olMatch) {
      const startLine = i + 1;
      const isOrdered = Boolean(olMatch);
      const tag = isOrdered ? "ol" : "ul";
      const listItems: { text: string; line: number }[] = [];

      while (i < lines.length) {
        const currentLine = lines[i];
        const curUl = currentLine.match(/^ {0,3}([-*+])\s+(.*)$/);
        const curOl = currentLine.match(/^ {0,3}(\d+)\.\s+(.*)$/);

        if (isOrdered && curOl) {
          listItems.push({ text: curOl[2], line: i + 1 });
          i++;
        } else if (!isOrdered && curUl) {
          listItems.push({ text: curUl[2], line: i + 1 });
          i++;
        } else {
          break;
        }
      }
      const endLine = i;

      let listHtml = `<${tag} data-source-line="${startLine}" data-source-end-line="${endLine}">\n`;
      for (const item of listItems) {
        // Task list item check: [ ] or [x]
        const taskMatch = item.text.match(/^\[([ xX])\]\s*(.*)$/);
        if (taskMatch) {
          const isChecked = taskMatch[1].toLowerCase() === "x";
          const itemContent = renderInline(escapeHtml(taskMatch[2]), notePath);
          listHtml += `  <li class="task-list-item" data-source-line="${item.line}"><input type="checkbox" disabled ${isChecked ? 'checked="" ' : ""}/> ${itemContent}</li>\n`;
        } else {
          listHtml += `  <li data-source-line="${item.line}">${renderInline(escapeHtml(item.text), notePath)}</li>\n`;
        }
      }
      listHtml += `</${tag}>`;
      out.push(listHtml);
      continue;
    }

    // 8. Regular Paragraph
    const startLine = i + 1;
    const paragraphLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith("#") &&
      !lines[i].trim().startsWith(">") &&
      !lines[i].trim().startsWith("```") &&
      !lines[i].trim().startsWith("~~~") &&
      !/^ {0,3}([-*_])(\s*\1){2,}\s*$/.test(lines[i]) &&
      !lines[i].match(/^ {0,3}([-*+]|\d+\.)\s+/)
    ) {
      paragraphLines.push(lines[i]);
      i++;
    }
    const endLine = i;

    if (paragraphLines.length > 0) {
      const pContent = paragraphLines
        .map((l) => renderInline(escapeHtml(l), notePath))
        .join("<br />");
      out.push(
        `<p data-source-line="${startLine}" data-source-end-line="${endLine}">${pContent}</p>`,
      );
    }
  }

  return out.join("\n\n");
}
