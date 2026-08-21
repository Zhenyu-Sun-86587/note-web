export type VimNativeInputState =
  | "unavailable"
  | "normal-pending"
  | "normal-ready"
  | "insert"
  | "error";

export type CompanionAvailability =
  | "checking"
  | "available"
  | "unavailable"
  | "error";

export interface CompanionSwitchResult {
  ok: boolean;
  strategy?: string;
  verified?: boolean;
  code?: string;
  message?: string;
  fallback?: boolean;
}

export interface CompanionRestoreResult {
  ok: boolean;
  restored?: boolean;
  code?: string;
  message?: string;
}

export class VimCompanionService {
  private static instance: VimCompanionService | null = null;

  private availability: CompanionAvailability = "checking";
  private inputState: VimNativeInputState = "unavailable";
  private inputIntentEpoch = 0;
  private listeners = new Set<() => void>();
  private pendingRequests = new Map<
    string,
    {
      resolve: (data: any) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private checkPromise: Promise<boolean> | null = null;

  public static getInstance(): VimCompanionService {
    if (!VimCompanionService.instance) {
      VimCompanionService.instance = new VimCompanionService();
    }
    return VimCompanionService.instance;
  }

  constructor() {
    if (typeof window !== "undefined") {
      this.setupMessageListener();
      this.checkPromise = this.checkAvailability();
    }
  }

  private setupMessageListener() {
    this.messageHandler = (event: MessageEvent) => {
      const data = event.data;
      if (
        !data ||
        data.source !== "note-web-companion" ||
        data.channel !== "vim-ime"
      ) {
        return;
      }

      // Handle unsolicited native state invalidations / disconnections
      if (data.type === "native-state-invalidated" || data.type === "native-disconnected") {
        ++this.inputIntentEpoch;
        if (data.type === "native-disconnected") {
          this.availability = "unavailable";
          this.inputState = "unavailable";
        } else if (this.inputState === "normal-ready") {
          this.inputState = "normal-pending";
        }
        this.notify();
        return;
      }

      if (typeof data.id !== "string") {
        return;
      }

      const pending = this.pendingRequests.get(data.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(data.id);
        pending.resolve(data);
      }
    };
    window.addEventListener("message", this.messageHandler);
  }

  public invalidateNativeState(_reason?: string) {
    ++this.inputIntentEpoch;
    if (this.inputState === "normal-ready") {
      this.inputState = "normal-pending";
      this.notify();
    }
  }

  public checkAvailability(timeoutMs = 400): Promise<boolean> {
    if (typeof window === "undefined") {
      this.availability = "unavailable";
      this.inputState = "unavailable";
      return Promise.resolve(false);
    }

    if (this.checkPromise) {
      return this.checkPromise;
    }

    this.checkPromise = (async () => {
      try {
        const id = `ping-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const res = await this.sendRequest<{ ok: boolean; action: string }>(
          {
            source: "note-web",
            channel: "vim-ime",
            id,
            action: "ping",
          },
          timeoutMs,
        );

        if (res && res.ok) {
          this.availability = "available";
          this.notify();
          return true;
        }
      } catch {
        // Ping timed out or failed
      } finally {
        this.checkPromise = null;
      }

      this.availability = "unavailable";
      if (this.inputState === "normal-pending") {
        this.inputState = "unavailable";
      }
      this.notify();
      return false;
    })();

    return this.checkPromise;
  }

  public getAvailability(): CompanionAvailability {
    return this.availability;
  }

  public getInputState(): VimNativeInputState {
    return this.inputState;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // Ignore subscriber errors
      }
    }
  }

  private staleSwitchResult(
    message = "Operation was invalidated by subsequent input intent",
  ): CompanionSwitchResult {
    return {
      ok: false,
      verified: false,
      code: "STALE_OPERATION",
      message,
    };
  }

  public async switchToCommandInput(timeoutMs = 500): Promise<CompanionSwitchResult> {
    // Principle A: Intent Epoch is established immediately before any await
    const epoch = ++this.inputIntentEpoch;
    const wasUnavailableOrError =
      this.availability === "unavailable" || this.availability === "error";

    // 1. Initial checking await guard
    if (this.availability === "checking" && this.checkPromise) {
      await this.checkPromise;
      if (epoch !== this.inputIntentEpoch) {
        return this.staleSwitchResult();
      }
    }

    // 2. Reconnect probe await guard (probe without entering normal-pending)
    if (wasUnavailableOrError) {
      const probeAvailable = await this.checkAvailability(400);
      if (epoch !== this.inputIntentEpoch) {
        return this.staleSwitchResult();
      }
      if (!probeAvailable) {
        // Keep fallback state; do not transiently enter normal-pending
        if (this.inputState !== "insert") {
          this.inputState = "unavailable";
          this.notify();
        }
        return { ok: false, fallback: true };
      }
    }

    if (epoch !== this.inputIntentEpoch) {
      return this.staleSwitchResult();
    }

    // If Companion is not available, return fallback
    if (this.availability !== "available") {
      return { ok: false, fallback: true };
    }

    // If Companion was previously unavailable/error and this call only probed reconnection,
    // keep current fallback state so in-flight multi-key Vim commands are not interrupted.
    // Next explicit Normal acquisition will perform the actual Native switch.
    if (wasUnavailableOrError) {
      return { ok: false, fallback: true };
    }

    // Principle B: Actual Native switch begins only here once companion was confirmed available
    this.inputState = "normal-pending";
    this.notify();

    // 3. Switch request
    const id = `switch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    try {
      const resp = await this.sendRequest<{
        ok: boolean;
        strategy?: string;
        verified?: boolean;
        code?: string;
        message?: string;
      }>(
        {
          source: "note-web",
          channel: "vim-ime",
          id,
          action: "switch_ascii",
        },
        timeoutMs,
      );

      // Stale ACK Guard - If intent changed while request was in-flight, discard without mutating state
      if (epoch !== this.inputIntentEpoch) {
        return this.staleSwitchResult();
      }

      if (resp && resp.ok && resp.verified === true) {
        this.inputState = "normal-ready";
        this.notify();
        return {
          ok: true,
          strategy: resp.strategy,
          verified: true,
        };
      }

      this.inputState = "error";
      this.notify();
      return {
        ok: false,
        verified: false,
        code: resp?.code || "SWITCH_UNVERIFIED",
        message: resp?.message || "Input switch could not be verified",
      };
    } catch (err: any) {
      if (epoch !== this.inputIntentEpoch) {
        return this.staleSwitchResult("Operation timed out after intent changed");
      }
      this.inputState = "error";
      this.notify();
      return {
        ok: false,
        verified: false,
        code: "TIMEOUT",
        message: err?.message || "Companion request timed out",
      };
    }
  }

  public async restoreTextInput(timeoutMs = 500): Promise<CompanionRestoreResult> {
    // P0-2: Increments epoch so any in-flight switch cannot resurrect normal-ready
    ++this.inputIntentEpoch;
    this.inputState = "insert";
    this.notify();

    if (this.availability === "unavailable") {
      return { ok: true, restored: false };
    }

    const id = `restore-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    try {
      const resp = await this.sendRequest<{
        ok: boolean;
        restored?: boolean;
        code?: string;
        message?: string;
      }>(
        {
          source: "note-web",
          channel: "vim-ime",
          id,
          action: "restore",
        },
        timeoutMs,
      );
      return {
        ok: resp?.ok ?? false,
        restored: resp?.restored,
      };
    } catch (err: any) {
      return {
        ok: false,
        code: "RESTORE_TIMEOUT",
        message: err?.message,
      };
    }
  }

  private sendRequest<T>(payload: any, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = payload.id;
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Vim companion request ${id} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(id, {
        resolve: (data) => resolve(data as T),
        timer,
      });

      window.postMessage(payload, "*");
    });
  }

  public cleanup() {
    if (this.messageHandler && typeof window !== "undefined") {
      window.removeEventListener("message", this.messageHandler);
      this.messageHandler = null;
    }
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timer);
    }
    this.pendingRequests.clear();
    this.listeners.clear();
  }

  // Testing helper to reset or mock state
  public _mockSetAvailability(availability: CompanionAvailability) {
    this.availability = availability;
    this.checkPromise = null;
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timer);
    }
    this.pendingRequests.clear();
    this.notify();
  }

  public _mockSetInputState(state: VimNativeInputState) {
    this.inputState = state;
    this.notify();
  }

  public _mockGetPendingRequestIds(): string[] {
    return Array.from(this.pendingRequests.keys());
  }

  public _mockDispatchResponse(response: Record<string, any>) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            source: "note-web-companion",
            channel: "vim-ime",
            ...response,
          },
        }),
      );
    }
  }
}

export const vimCompanion = VimCompanionService.getInstance();
