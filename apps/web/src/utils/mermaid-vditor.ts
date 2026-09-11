import mermaid from "mermaid";
import elkLayouts from "@mermaid-js/layout-elk";

let prepared = false;

export function prepareMermaidForVditor() {
  if (prepared) return;
  prepared = true;

  mermaid.registerLayoutLoaders(elkLayouts);

  // Vditor 内部直接使用全局 mermaid
  (globalThis as any).mermaid = mermaid;

  // Vditor 会通过这个 id 判断是否已经加载 Mermaid，
  // 提前放 marker，避免它再加载自己的 CDN mermaid 覆盖掉我们这个实例
  if (!document.getElementById("vditorMermaidScript")) {
    const marker = document.createElement("script");
    marker.id = "vditorMermaidScript";
    marker.type = "application/json";
    document.head.appendChild(marker);
  }
}
