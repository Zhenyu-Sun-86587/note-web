import type {
  NativeHostRequest,
  NativeHostResponse,
  VimCompanionBridgeRequest,
  VimCompanionBridgeResponse,
} from "./protocol";

const NATIVE_HOST_NAME = "com.noteweb.ime";
const REQUEST_TIMEOUT_MS = 600;

let nativePort: chrome.runtime.Port | null = null;
let ownerTabId: number | null = null;

interface PendingRequest {
  resolve: (res: VimCompanionBridgeResponse) => void;
  timer: ReturnType<typeof setTimeout>;
  action: string;
}

const pendingRequests = new Map<string, PendingRequest>();

function getOrCreateNativePort(): chrome.runtime.Port | null {
  if (nativePort) {
    return nativePort;
  }

  try {
    const port = chrome.runtime.connectNative(NATIVE_HOST_NAME);

    port.onMessage.addListener((msg: NativeHostResponse) => {
      if (!msg || typeof msg.id !== "string") return;

      const pending = pendingRequests.get(msg.id);
      if (pending) {
        clearTimeout(pending.timer);
        pendingRequests.delete(msg.id);

        const bridgeResp: VimCompanionBridgeResponse = {
          source: "note-web-companion",
          channel: "vim-ime",
          id: msg.id,
          ok: msg.ok,
          action: msg.action,
          strategy: msg.strategy,
          verified: msg.verified,
          targetPid: msg.targetPid,
          targetHwnd: msg.targetHwnd,
          elapsedMs: msg.elapsedMs,
          message: msg.message,
          code: msg.code,
          restored: msg.restored,
        };
        pending.resolve(bridgeResp);
      }
    });

    port.onDisconnect.addListener(() => {
      const lastError = chrome.runtime.lastError;
      const errorMsg =
        lastError?.message || "Native Messaging host disconnected";
      console.warn("[note-web-companion background] Port disconnected:", errorMsg);

      for (const [id, pending] of pendingRequests.entries()) {
        clearTimeout(pending.timer);
        pending.resolve({
          source: "note-web-companion",
          channel: "vim-ime",
          id,
          ok: false,
          action: pending.action,
          code: "NATIVE_HOST_DISCONNECTED",
          message: errorMsg,
        });
      }
      pendingRequests.clear();
      nativePort = null;
      ownerTabId = null;
    });

    nativePort = port;
    return nativePort;
  } catch (e: any) {
    console.error("[note-web-companion background] connectNative failed:", e);
    nativePort = null;
    return null;
  }
}

function sendToNativeHost(
  req: NativeHostRequest,
): Promise<VimCompanionBridgeResponse> {
  return new Promise((resolve) => {
    const port = getOrCreateNativePort();
    if (!port) {
      resolve({
        source: "note-web-companion",
        channel: "vim-ime",
        id: req.id,
        ok: false,
        action: req.action,
        code: "NATIVE_HOST_UNAVAILABLE",
        message: "Failed to connect to com.noteweb.ime native host",
      });
      return;
    }

    const timer = setTimeout(() => {
      pendingRequests.delete(req.id);
      resolve({
        source: "note-web-companion",
        channel: "vim-ime",
        id: req.id,
        ok: false,
        action: req.action,
        code: "TIMEOUT",
        message: `Native host request timed out after ${REQUEST_TIMEOUT_MS}ms`,
      });
    }, REQUEST_TIMEOUT_MS);

    pendingRequests.set(req.id, {
      resolve,
      timer,
      action: req.action,
    });

    try {
      port.postMessage(req);
    } catch (err: any) {
      clearTimeout(timer);
      pendingRequests.delete(req.id);
      resolve({
        source: "note-web-companion",
        channel: "vim-ime",
        id: req.id,
        ok: false,
        action: req.action,
        code: "PORT_POST_FAILED",
        message: err?.message || "Failed to post message to native port",
      });
    }
  });
}

chrome.runtime.onMessage.addListener(
  (
    message: VimCompanionBridgeRequest,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: VimCompanionBridgeResponse) => void,
  ) => {
    if (!message || message.source !== "note-web" || message.channel !== "vim-ime") {
      return false;
    }

    const senderTabId = sender.tab?.id ?? null;

    // Handle tab ownership transfer for switch_ascii
    if (message.action === "switch_ascii" && senderTabId !== null) {
      if (ownerTabId !== null && ownerTabId !== senderTabId) {
        // Restore previous owner before transferring ownership
        sendToNativeHost({
          id: `transfer-restore-${Date.now()}`,
          action: "restore",
        }).then(() => {
          ownerTabId = senderTabId;
          sendToNativeHost({
            id: message.id,
            action: message.action,
          }).then((resp) => {
            sendResponse(resp);
          });
        });
        return true;
      }
      ownerTabId = senderTabId;
    }

    if (message.action === "restore" && senderTabId !== null) {
      if (ownerTabId === senderTabId) {
        ownerTabId = null;
      }
    }

    sendToNativeHost({
      id: message.id,
      action: message.action,
    }).then((resp) => {
      sendResponse(resp);
    });

    return true; // Keep message channel open for async sendResponse
  },
);

chrome.tabs?.onRemoved?.addListener((tabId) => {
  if (ownerTabId === tabId) {
    ownerTabId = null;
    sendToNativeHost({
      id: `tab-closed-${Date.now()}`,
      action: "restore",
    });
  }
});
