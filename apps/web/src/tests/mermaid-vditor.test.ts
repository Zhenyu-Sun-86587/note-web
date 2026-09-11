import { describe, it, expect, vi } from "vitest";
import mermaid from "mermaid";
import elkLayouts from "@mermaid-js/layout-elk";
import { prepareMermaidForVditor } from "../utils/mermaid-vditor";

describe("prepareMermaidForVditor", () => {
  it("registers global mermaid and injects vditorMermaidScript marker", () => {
    const registerSpy = vi.spyOn(mermaid, "registerLayoutLoaders");
    prepareMermaidForVditor();

    expect(registerSpy).toHaveBeenCalledWith(elkLayouts);
    registerSpy.mockRestore();

    // Check global mermaid exists
    expect((globalThis as any).mermaid).toBeDefined();

    // Check script marker exists
    const marker = document.getElementById("vditorMermaidScript");
    expect(marker).not.toBeNull();
    expect(marker?.tagName.toLowerCase()).toBe("script");
    expect(marker?.getAttribute("type")).toBe("application/json");
  });

  it("is idempotent when called multiple times without duplicate markers", () => {
    prepareMermaidForVditor();
    prepareMermaidForVditor();

    const markers = document.querySelectorAll("#vditorMermaidScript");
    expect(markers.length).toBe(1);
  });
});
