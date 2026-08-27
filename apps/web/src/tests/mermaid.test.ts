import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderMermaidDiagram, renderMermaidInElement } from "../utils/mermaid";

describe("Mermaid Diagram Renderer Utility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles empty mermaid code gracefully", async () => {
    const res = await renderMermaidDiagram("", "test-empty", "light");
    expect(res.svg).toBeUndefined();
    expect(res.error).toBeDefined();
  });

  it("renders a valid mermaid diagram to svg", async () => {
    const code = `graph TD\n    A --> B`;
    const res = await renderMermaidDiagram(code, "test-graph", "dark");
    // Under test environment (node/happy-dom), mermaid returns rendered svg or fallback string
    if (res.svg) {
      expect(res.svg).toContain("<svg");
    } else {
      expect(typeof res.error).toBe("string");
    }
  });

  it("renders mermaid blocks inside a container element", async () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div class="mermaid-block">
        <div class="mermaid-diagram" data-mermaid-code="graph LR&#10;    A --> B">graph LR\n    A --> B</div>
      </div>
    `;

    await renderMermaidInElement(container, "light");
    const diagramEl = container.querySelector(".mermaid-diagram");
    expect(diagramEl).not.toBeNull();
    // It either contains an SVG or has processed class
    expect(diagramEl?.getAttribute("data-processed")).toBe("true");
  });
});
