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
  // 1. Extract inline code blocks with neutral delimiter to protect them
  const codeTokens: string[] = [];
  let processed = text.replace(/`([^`]+)`/g, (_match, code) => {
    const idx = codeTokens.length;
    codeTokens.push(`<code>${escapeHtml(code)}</code>`);
    return `\uFFF0CODE${idx}\uFFF0`;
  });

  // 2. Extract markdown images: ![alt](url "optional title")
  const imgTokens: string[] = [];
  processed = processed.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (_match, alt, srcWithTitle) => {
      const idx = imgTokens.length;
      const urlMatch = srcWithTitle.trim().match(/^<?([^\s>]+)>?(?:\s+["'](.*)["'])?$/);
      const cleanSrc = urlMatch ? urlMatch[1] : srcWithTitle.trim();
      const title = urlMatch && urlMatch[2] ? urlMatch[2] : "";
      const resolved = resolveMarkdownPreviewUrl(notePath, cleanSrc);
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
      imgTokens.push(
        `<img src="${escapeHtml(resolved)}" alt="${escapeHtml(alt)}"${titleAttr} loading="lazy" />`,
      );
      return `\uFFF0IMG${idx}\uFFF0`;
    },
  );

  // 3. Extract raw HTML <img> tags in markdown: <img ... src="..." ...>
  processed = processed.replace(
    /<img\s+([^>]*?)src=(["'])([^"']+)\2([^>]*?)\/?>/gi,
    (_match, before, _quote, src, after) => {
      const idx = imgTokens.length;
      const cleanSrc = src.trim();
      const resolved = resolveMarkdownPreviewUrl(notePath, cleanSrc);
      const beforeStr = before.trim() ? ` ${before.trim()}` : "";
      const afterStr = after.trim() ? ` ${after.trim()}` : "";
      imgTokens.push(
        `<img${beforeStr} src="${escapeHtml(resolved)}"${afterStr} loading="lazy" />`,
      );
      return `\uFFF0IMG${idx}\uFFF0`;
    },
  );

  // 4. Extract markdown links: [text](url "optional title")
  const linkTokens: string[] = [];
  processed = processed.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_match, linkText, urlWithTitle) => {
      const idx = linkTokens.length;
      const urlMatch = urlWithTitle.trim().match(/^<?([^\s>]+)>?(?:\s+["'](.*)["'])?$/);
      const cleanUrl = urlMatch ? urlMatch[1] : urlWithTitle.trim();
      const title = urlMatch && urlMatch[2] ? urlMatch[2] : "";
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
      linkTokens.push(
        `<a href="${escapeHtml(cleanUrl)}"${titleAttr} target="_blank" rel="noopener noreferrer">${linkText}</a>`,
      );
      return `\uFFF0LINK${idx}\uFFF0`;
    },
  );

  // 5. Escape HTML in the remaining surrounding text
  processed = escapeHtml(processed);

  // 6. Bold + Italic: ***text***
  processed = processed.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");

  // 7. Bold: **text** or __text__
  processed = processed.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  processed = processed.replace(/__([^_]+)__/g, "<strong>$1</strong>");

  // 8. Italic: *text* or _text_
  processed = processed.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  processed = processed.replace(/_([^_]+)_/g, "<em>$1</em>");

  // 9. Strikethrough: ~~text~~
  processed = processed.replace(/~~([^~]+)~~/g, "<del>$1</del>");

  // 10. Auto link plain URLs (not inside tags)
  processed = processed.replace(
    /(^|[\s(])(https?:\/\/[^\s<)]+)/g,
    '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>',
  );

  // 11. Restore tokens in reverse order: LINKS -> IMGS -> CODES
  processed = processed.replace(/\uFFF0LINK(\d+)\uFFF0/g, (_match, idx) => {
    let linkHtml = linkTokens[Number(idx)] || "";
    // Apply bold/italic/strike on inner link text if needed
    linkHtml = linkHtml
      .replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/__([^_]+)__/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/_([^_]+)_/g, "<em>$1</em>")
      .replace(/~~([^~]+)~~/g, "<del>$1</del>");
    return linkHtml;
  });

  processed = processed.replace(/\uFFF0IMG(\d+)\uFFF0/g, (_match, idx) => {
    return imgTokens[Number(idx)] || "";
  });

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
        `<h${level} id="${id}" data-source-line="${startLine}">${renderInline(text, notePath)}</h${level}>`,
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
        tableHtml += `  <th style="text-align: ${align}">${renderInline(cell, notePath)}</th>\n`;
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
          tableHtml += `  <td style="text-align: ${align}">${renderInline(cell, notePath)}</td>\n`;
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
          const itemContent = renderInline(taskMatch[2], notePath);
          listHtml += `  <li class="task-list-item" data-source-line="${item.line}"><input type="checkbox" disabled ${isChecked ? 'checked="" ' : ""}/> ${itemContent}</li>\n`;
        } else {
          listHtml += `  <li data-source-line="${item.line}">${renderInline(item.text, notePath)}</li>\n`;
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
        .map((l) => renderInline(l, notePath))
        .join("<br />");
      out.push(
        `<p data-source-line="${startLine}" data-source-end-line="${endLine}">${pContent}</p>`,
      );
    }
  }

  return out.join("\n\n");
}
