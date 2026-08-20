import { describe, it, expect } from "vitest";
import { resolveMarkdownPreviewUrl } from "../utils/preview-url";

describe("resolveMarkdownPreviewUrl", () => {
  it("resolves relative attachment paths from nested notes", () => {
    expect(
      resolveMarkdownPreviewUrl(
        "projects/backend/server.md",
        "../../attachments/2026/08/arch.png",
      ),
    ).toBe("/api/raw/attachments/2026/08/arch.png");

    expect(
      resolveMarkdownPreviewUrl(
        "inbox/welcome.md",
        "../attachments/2026/08/diagram.png",
      ),
    ).toBe("/api/raw/attachments/2026/08/diagram.png");

    expect(
      resolveMarkdownPreviewUrl(
        "welcome.md",
        "./attachments/2026/08/diagram.png",
      ),
    ).toBe("/api/raw/attachments/2026/08/diagram.png");
  });

  it("leaves absolute and external URLs untouched", () => {
    expect(
      resolveMarkdownPreviewUrl(
        "inbox/welcome.md",
        "https://example.com/image.png",
      ),
    ).toBe("https://example.com/image.png");

    expect(
      resolveMarkdownPreviewUrl(
        "inbox/welcome.md",
        "data:image/png;base64,xxxx",
      ),
    ).toBe("data:image/png;base64,xxxx");

    expect(
      resolveMarkdownPreviewUrl(
        "inbox/welcome.md",
        "/api/raw/attachments/test.png",
      ),
    ).toBe("/api/raw/attachments/test.png");
  });
});
