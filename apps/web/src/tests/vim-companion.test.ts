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

  it("P0-1: On-demand lightweight reconnect when previously unavailable", async () => {
    const service = VimCompanionService.getInstance();
    service._mockSetAvailability("unavailable");
    service._mockSetInputState("unavailable");

    // Call switchToCommandInput when unavailable -> triggers checkAvailability probe
    const switchPromise = service.switchToCommandInput(500);

    // Get the ping request id and reply success
    const pingIds = service._mockGetPendingRequestIds();
    expect(pingIds.length).toBeGreaterThan(0);
    service._mockDispatchResponse({
      id: pingIds[0],
      ok: true,
      action: "ping",
    });

    // Advance microtasks for probe resolution and switch_ascii dispatch
    await vi.advanceTimersByTimeAsync(10);

    // Get the switch request id and reply verified success
    const switchIds = service._mockGetPendingRequestIds();
    expect(switchIds.length).toBeGreaterThan(0);
    service._mockDispatchResponse({
      id: switchIds[0],
      ok: true,
      action: "switch_ascii",
      strategy: "keyboard_layout",
      verified: true,
      targetPid: 4321,
    });

    await vi.advanceTimersByTimeAsync(10);

    const result = await switchPromise;
    expect(result.ok).toBe(true);
    expect(result.verified).toBe(true);
    expect(service.getAvailability()).toBe("available");
    expect(service.getInputState()).toBe("normal-ready");
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

    const pendingIds = service._mockGetPendingRequestIds();
    expect(pendingIds.length).toBe(1);

    service._mockDispatchResponse({
      id: pendingIds[0],
      ok: true,
      action: "switch_ascii",
      strategy: "keyboard_layout",
      verified: true,
      targetPid: 1234,
    });

    await vi.advanceTimersByTimeAsync(10);

    const result = await switchPromise;
    expect(result.ok).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.strategy).toBe("keyboard_layout");
    expect(service.getInputState()).toBe("normal-ready");

    unsubscribe();
  });

  it("P0-2 Test A: Stale ACK after restoreTextInput does NOT resurrect normal-ready", async () => {
    const service = VimCompanionService.getInstance();
    service._mockSetAvailability("available");

    // 1. Initiate switch A
    const switchAPromise = service.switchToCommandInput(500);
    expect(service.getInputState()).toBe("normal-pending");

    const pendingIds = service._mockGetPendingRequestIds();
    expect(pendingIds.length).toBe(1);
    const switchAId = pendingIds[0];

    // 2. User enters Insert mode before switch A responds
    service.restoreTextInput();
    expect(service.getInputState()).toBe("insert");

    // 3. Late switch A ACK arrives with verified=true
    service._mockDispatchResponse({
      id: switchAId,
      ok: true,
      action: "switch_ascii",
      strategy: "keyboard_layout",
      verified: true,
    });
    await vi.advanceTimersByTimeAsync(10);

    const resultA = await switchAPromise;
    expect(resultA.code).toBe("STALE_OPERATION");
    expect(resultA.verified).toBe(false);

    // Assert: state must REMAIN insert and NEVER become normal-ready!
    expect(service.getInputState()).toBe("insert");
  });

  it("P0-2 Test B: Stale ACK after native-state-invalidated does NOT set normal-ready", async () => {
    const service = VimCompanionService.getInstance();
    service._mockSetAvailability("available");

    const switchAPromise = service.switchToCommandInput(500);
    expect(service.getInputState()).toBe("normal-pending");

    const pendingIds = service._mockGetPendingRequestIds();
    expect(pendingIds.length).toBe(1);
    const switchAId = pendingIds[0];

    // Page hidden / invalidation event
    service._mockDispatchResponse({
      type: "native-state-invalidated",
      reason: "page-hidden",
    });
    expect(service.getInputState()).toBe("normal-pending");

    // Late switch A ACK arrives
    service._mockDispatchResponse({
      id: switchAId,
      ok: true,
      action: "switch_ascii",
      strategy: "keyboard_layout",
      verified: true,
    });
    await vi.advanceTimersByTimeAsync(10);

    const resultA = await switchAPromise;
    expect(resultA.code).toBe("STALE_OPERATION");
    expect(service.getInputState()).not.toBe("normal-ready");
  });

  it("P0-2 Test C: Stale ACK after native-disconnected keeps state unavailable", async () => {
    const service = VimCompanionService.getInstance();
    service._mockSetAvailability("available");

    const switchAPromise = service.switchToCommandInput(500);
    const pendingIds = service._mockGetPendingRequestIds();
    expect(pendingIds.length).toBe(1);
    const switchAId = pendingIds[0];

    // Disconnect event arrives
    service._mockDispatchResponse({
      type: "native-disconnected",
      reason: "port-disconnected",
    });
    expect(service.getAvailability()).toBe("unavailable");
    expect(service.getInputState()).toBe("unavailable");

    // Late switch A arrives
    service._mockDispatchResponse({
      id: switchAId,
      ok: true,
      action: "switch_ascii",
      strategy: "keyboard_layout",
      verified: true,
    });
    await vi.advanceTimersByTimeAsync(10);

    const resultA = await switchAPromise;
    expect(resultA.code).toBe("STALE_OPERATION");
    expect(service.getAvailability()).toBe("unavailable");
    expect(service.getInputState()).toBe("unavailable");
  });

  it("P0-2 Race: Switch A followed by Switch B ensures only B sets state", async () => {
    const service = VimCompanionService.getInstance();
    service._mockSetAvailability("available");

    const switchAPromise = service.switchToCommandInput(500);
    const switchBPromise = service.switchToCommandInput(500);

    const pendingIds = service._mockGetPendingRequestIds();
    expect(pendingIds.length).toBe(2);
    const [idA, idB] = pendingIds;

    // B arrives first and sets normal-ready
    service._mockDispatchResponse({
      id: idB,
      ok: true,
      action: "switch_ascii",
      strategy: "keyboard_layout",
      verified: true,
    });
    await vi.advanceTimersByTimeAsync(10);
    const resultB = await switchBPromise;
    expect(resultB.ok).toBe(true);
    expect(service.getInputState()).toBe("normal-ready");

    // A arrives later with error
    service._mockDispatchResponse({
      id: idA,
      ok: false,
      action: "switch_ascii",
      code: "SWITCH_FAILED",
    });
    await vi.advanceTimersByTimeAsync(10);
    const resultA = await switchAPromise;
    expect(resultA.code).toBe("STALE_OPERATION");

    // State remains normal-ready as determined by B
    expect(service.getInputState()).toBe("normal-ready");
  });

  it("P0-1 Fix: switchToCommandInput does NOT enter normal-ready if verified is false", async () => {
    const service = VimCompanionService.getInstance();
    service._mockSetAvailability("available");

    const switchPromise = service.switchToCommandInput(500);
    expect(service.getInputState()).toBe("normal-pending");

    const pendingIds = service._mockGetPendingRequestIds();
    expect(pendingIds.length).toBe(1);

    service._mockDispatchResponse({
      id: pendingIds[0],
      ok: false,
      action: "switch_ascii",
      strategy: "keyboard_layout",
      verified: false,
      code: "SWITCH_UNVERIFIED",
    });

    await vi.advanceTimersByTimeAsync(10);

    const result = await switchPromise;
    expect(result.ok).toBe(false);
    expect(result.verified).toBe(false);
    expect(result.code).toBe("SWITCH_UNVERIFIED");
    expect(service.getInputState()).toBe("error");
  });

  it("P0-3 Fix: handles native-state-invalidated event and revokes normal-ready", () => {
    const service = VimCompanionService.getInstance();
    service._mockSetAvailability("available");
    service._mockSetInputState("normal-ready");

    service._mockDispatchResponse({
      type: "native-state-invalidated",
      reason: "page-hidden",
    });

    expect(service.getInputState()).not.toBe("normal-ready");
    expect(service.getInputState()).toBe("normal-pending");
  });

  it("P0-4 Fix: handles native-disconnected event and marks companion unavailable", () => {
    const service = VimCompanionService.getInstance();
    service._mockSetAvailability("available");
    service._mockSetInputState("normal-ready");

    service._mockDispatchResponse({
      type: "native-disconnected",
      reason: "port-disconnected",
    });

    expect(service.getAvailability()).toBe("unavailable");
    expect(service.getInputState()).toBe("unavailable");
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
