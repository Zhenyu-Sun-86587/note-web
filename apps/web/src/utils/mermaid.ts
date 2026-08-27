import mermaid from "mermaid";

let currentTheme: "light" | "dark" | null = null;
let idCounter = 0;

/**
 * Initializes mermaid with light/dark theme variables.
 */
export function initMermaid(theme: "light" | "dark" = "dark") {
  if (currentTheme !== theme) {
    try {
      mermaid.initialize({
        startOnLoad: false,
        theme: theme === "dark" ? "dark" : "default",
        securityLevel: "loose",
        fontFamily: "var(--font-ui, -apple-system, BlinkMacSystemFont, sans-serif)",
        flowchart: {
          useMaxWidth: true,
          htmlLabels: true,
          curve: "basis",
        },
        sequence: {
          useMaxWidth: true,
          showSequenceNumbers: false,
        },
        themeVariables:
          theme === "dark"
            ? {
                darkMode: true,
                background: "transparent",
                mainBkg: "#24283b",
                nodeBorder: "#7aa2f7",
                clusterBkg: "#1f2335",
                clusterBorder: "#3b4261",
                titleColor: "#c0caf5",
                textColor: "#c0caf5",
                lineColor: "#7aa2f7",
                edgeLabelBackground: "#1a1b26",
                actorBorder: "#7aa2f7",
                actorBkg: "#24283b",
                actorTextColor: "#c0caf5",
                actorLineColor: "#7aa2f7",
                signalColor: "#c0caf5",
                signalTextColor: "#c0caf5",
                labelBoxBkgColor: "#24283b",
                labelBoxBorderColor: "#7aa2f7",
                labelTextColor: "#c0caf5",
              }
            : {
                darkMode: false,
                background: "transparent",
                mainBkg: "#f8f9fa",
                nodeBorder: "#4f6ef7",
                clusterBkg: "#f1f3f5",
                clusterBorder: "#dee2e6",
                titleColor: "#212529",
                textColor: "#212529",
                lineColor: "#4f6ef7",
                edgeLabelBackground: "#ffffff",
                actorBorder: "#4f6ef7",
                actorBkg: "#e7f1ff",
                actorTextColor: "#212529",
                actorLineColor: "#4f6ef7",
                signalColor: "#212529",
                signalTextColor: "#212529",
                labelBoxBkgColor: "#e7f1ff",
                labelBoxBorderColor: "#4f6ef7",
                labelTextColor: "#212529",
              },
      });
      currentTheme = theme;
    } catch {
      // ignore init errors in test environments
    }
  }
}

/**
 * Renders a single Mermaid code string into SVG HTML.
 */
export async function renderMermaidDiagram(
  code: string,
  id: string,
  theme: "light" | "dark" = "dark",
): Promise<{ svg?: string; error?: string }> {
  const trimmed = code.trim();
  if (!trimmed) {
    return { error: "图表代码为空" };
  }

  try {
    initMermaid(theme);
    const uniqueId = `mermaid-${id.replace(/[^a-zA-Z0-9_-]/g, "_")}-${++idCounter}`;
    const { svg } = await mermaid.render(uniqueId, trimmed);
    return { svg };
  } catch (err: unknown) {
    if (typeof document !== "undefined") {
      // Clean up any stray error element added by mermaid
      const stray = document.querySelectorAll(`[id^="dmermaid-"]`);
      stray.forEach((el) => el.remove());
    }
    const message = err instanceof Error ? err.message : String(err);
    return { error: message };
  }
}

/**
 * Finds all mermaid diagrams inside a DOM container and replaces them with rendered SVG diagrams.
 */
export async function renderMermaidInElement(
  container: HTMLElement | null,
  theme: "light" | "dark" = "dark",
) {
  if (!container) return;
  const elements = container.querySelectorAll<HTMLElement>(
    ".mermaid-diagram, .mermaid, pre code.language-mermaid",
  );
  if (elements.length === 0) return;

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const rawCode =
      el.getAttribute("data-mermaid-code") || el.textContent || "";
    const code = rawCode.trim();
    if (!code) continue;

    el.setAttribute("data-processed", "true");
    const id = `diag-${Date.now()}-${i}`;

    try {
      const result = await renderMermaidDiagram(code, id, theme);
      if (result.svg) {
        el.innerHTML = result.svg;
        el.classList.add("mermaid-rendered");
        el.classList.remove("mermaid-error");
      } else if (result.error) {
        el.classList.add("mermaid-error");
        el.classList.remove("mermaid-rendered");
        el.innerHTML = `
          <div class="mermaid-error-box">
            <div class="mermaid-error-title">⚠️ Mermaid 图表渲染错误</div>
            <div class="mermaid-error-text">${escapeHtmlForMermaid(result.error)}</div>
            <pre class="mermaid-error-source"><code>${escapeHtmlForMermaid(code)}</code></pre>
          </div>
        `;
      }
    } catch {
      // Graceful fallback
    }
  }
}

function escapeHtmlForMermaid(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
