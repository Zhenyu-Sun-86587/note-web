/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  VimCompanionService,
  vimCompanion,
} from "../utils/vim-companion";
import {
  attachVimImeProxy,
} from "../utils/vim-ime";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { vim } from "@replit/codemirror-vim";

describe("VimCompanionService and State Machine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vimCompanion._mockSetAvailability("available");
    vimCompanion._mockSetInputState("unavailable");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("initializes singleton service with default availability", () => {
    const service = VimCompanionService.getInstance();
    expect(service).toBe(vimCompanion);
    expect(["available", "unavailable", "checking"]).toContain(
      service.getAvailability(),
    );
  });

  it("switchToCommandInput sets state to normal-pending immediately, and normal-ready on ACK", async () => {
    const service = VimCompanionService.getInstance();
    service._mockSetAvailability("available");

    const messageSpy = vi.fn();
    const unsubscribe = service.subscribe(messageSpy);

    const switchPromise = service.switchToCommandInput(500);

    // Assert: immediately normal-pending
    expect(service.getInputState()).toBe("normal-pending");
    expect(messageSpy).toHaveBeenCalled();

    // Mock incoming ACK from extension content script
    const activeHandler = (event: MessageEvent) => {
      const data = event.data;
      if (
        data &&
        data.source === "note-web" &&
        data.channel === "vim-ime" &&
        data.action === "switch_ascii"
      ) {
        window.postMessage(
          {
            source: "note-web-companion",
            channel: "vim-ime",
            id: data.id,
            ok: true,
            action: "switch_ascii",
            strategy: "keyboard_layout",
            verified: true,
            targetPid: 1234,
          },
          "*",
        );
      }
    };
    window.addEventListener("message", activeHandler);

    // Advance fake timers slightly or wait microtasks
    await vi.advanceTimersByTimeAsync(20);

    const result = await switchPromise;
    expect(result.ok).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.strategy).toBe("keyboard_layout");
    expect(service.getInputState()).toBe("normal-ready");

    window.removeEventListener("message", activeHandler);
    unsubscribe();
  });

  it("switchToCommandInput transitions to error on timeout and falls back safely", async () => {
    const service = VimCompanionService.getInstance();
    service._mockSetAvailability("available");

    const switchPromise = service.switchToCommandInput(200);
    expect(service.getInputState()).toBe("normal-pending");

    // Advance timer past timeout without replying
    await vi.advanceTimersByTimeAsync(300);

    const result = await switchPromise;
    expect(result.ok).toBe(false);
    expect(result.code).toBe("TIMEOUT");
    expect(service.getInputState()).toBe("error");
  });

  it("restoreTextInput transitions state to insert immediately", async () => {
    const service = VimCompanionService.getInstance();
    service._mockSetAvailability("available");
    service._mockSetInputState("normal-ready");

    const restorePromise = service.restoreTextInput(50);
    expect(service.getInputState()).toBe("insert");

    await vi.advanceTimersByTimeAsync(60);
    const res = await restorePromise;
    expect(res).toBeDefined();
  });

  it("P0 Safety Rule: In normal-pending state, all printable keys are blocked and never forwarded", () => {
    vimCompanion._mockSetInputState("normal-pending");

    const container = document.createElement("div");
    const proxy = document.createElement("textarea");
    container.appendChild(proxy);
    document.body.appendChild(container);

    const view = new EditorView({
      state: EditorState.create({
        doc: "hello world",
        extensions: [vim()],
      }),
      parent: container,
    });

    const attached = attachVimImeProxy(view, proxy, container);

    const keyIEvent = new KeyboardEvent("keydown", {
      key: "i",
      code: "KeyI",
      cancelable: true,
      bubbles: true,
    });

    proxy.dispatchEvent(keyIEvent);

    // In normal-pending, event must be defaultPrevented and pendingPrintableKey must be null
    expect(keyIEvent.defaultPrevented).toBe(true);
    expect(attached.state.pendingPrintableKey).toBeNull();

    // Key 'a' must also be blocked
    const keyAEvent = new KeyboardEvent("keydown", {
      key: "a",
      code: "KeyA",
      cancelable: true,
      bubbles: true,
    });
    proxy.dispatchEvent(keyAEvent);
    expect(keyAEvent.defaultPrevented).toBe(true);
    expect(attached.state.pendingPrintableKey).toBeNull();

    attached.cleanup();
    view.destroy();
    container.remove();
  });

  it("In normal-ready state, printable ASCII keys in keydown are forwarded to Vim", () => {
    vimCompanion._mockSetInputState("normal-ready");

    const container = document.createElement("div");
    const proxy = document.createElement("textarea");
    container.appendChild(proxy);
    document.body.appendChild(container);

    const view = new EditorView({
      state: EditorState.create({
        doc: "hello world",
        extensions: [vim()],
      }),
      parent: container,
    });

    const attached = attachVimImeProxy(view, proxy, container);

    const keyIEvent = new KeyboardEvent("keydown", {
      key: "i",
      code: "KeyI",
      cancelable: true,
      bubbles: true,
    });

    proxy.dispatchEvent(keyIEvent);

    // In normal-ready, keydown 'i' is prevented from browser typing and forwarded to Vim
    expect(keyIEvent.defaultPrevented).toBe(true);

    attached.cleanup();
    view.destroy();
    container.remove();
  });
});
