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
        data.channel !== "vim-ime" ||
        typeof data.id !== "string"
      ) {
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

  public async checkAvailability(timeoutMs = 400): Promise<boolean> {
    if (typeof window === "undefined") {
      this.availability = "unavailable";
      this.inputState = "unavailable";
      return false;
    }

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
    }

    this.availability = "unavailable";
    if (this.inputState === "normal-pending") {
      this.inputState = "unavailable";
    }
    this.notify();
    return false;
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

  public async switchToCommandInput(timeoutMs = 500): Promise<CompanionSwitchResult> {
    if (this.availability === "checking" && this.checkPromise) {
      await this.checkPromise;
    }

    if (this.availability === "unavailable") {
      this.inputState = "unavailable";
      this.notify();
      return { ok: false, fallback: true };
    }

    this.inputState = "normal-pending";
    this.notify();

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

      if (resp && resp.ok && resp.verified) {
        this.inputState = "normal-ready";
        this.notify();
        return {
          ok: true,
          strategy: resp.strategy,
          verified: resp.verified,
        };
      }

      this.inputState = "error";
      this.notify();
      return {
        ok: false,
        code: resp?.code || "SWITCH_UNVERIFIED",
        message: resp?.message || "Input switch could not be verified",
      };
    } catch (err: any) {
      this.inputState = "error";
      this.notify();
      return {
        ok: false,
        code: "TIMEOUT",
        message: err?.message || "Companion request timed out",
      };
    }
  }

  public async restoreTextInput(timeoutMs = 500): Promise<CompanionRestoreResult> {
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
    this.notify();
  }

  public _mockSetInputState(state: VimNativeInputState) {
    this.inputState = state;
    this.notify();
  }
}

export const vimCompanion = VimCompanionService.getInstance();
