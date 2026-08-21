import type {
  VimCompanionBridgeRequest,
  VimCompanionBridgeResponse,
} from "./protocol";

window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window) return;
  const data = event.data as VimCompanionBridgeRequest;
  if (!data || data.source !== "note-web" || data.channel !== "vim-ime") {
    return;
  }

  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    const errorResponse: VimCompanionBridgeResponse = {
      source: "note-web-companion",
      channel: "vim-ime",
      id: data.id,
      ok: false,
      action: data.action,
      code: "EXTENSION_UNAVAILABLE",
      message: "Chrome runtime is not available in current page context",
    };
    window.postMessage(errorResponse, "*");
    return;
  }

  chrome.runtime.sendMessage(data, (response: VimCompanionBridgeResponse) => {
    if (chrome.runtime.lastError) {
      const errResp: VimCompanionBridgeResponse = {
        source: "note-web-companion",
        channel: "vim-ime",
        id: data.id,
        ok: false,
        action: data.action,
        code: "EXTENSION_DISCONNECTED",
        message:
          chrome.runtime.lastError.message || "Extension runtime error occurred",
      };
      window.postMessage(errResp, "*");
      return;
    }

    if (response) {
      window.postMessage(response, "*");
    }
  });
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    try {
      chrome.runtime?.sendMessage({
        source: "note-web",
        channel: "vim-ime",
        id: `vis-${Date.now()}`,
        action: "restore",
      });
    } catch {
      // Ignore background communication error during page hide
    }
  }
});

window.addEventListener("pagehide", () => {
  try {
    chrome.runtime?.sendMessage({
      source: "note-web",
      channel: "vim-ime",
      id: `pagehide-${Date.now()}`,
      action: "restore",
    });
  } catch {
    // Ignore background communication error during page hide
  }
});
