export type NativeAction = "ping" | "get_state" | "switch_ascii" | "restore";
export type SwitchStrategy = "ime_open_state" | "keyboard_layout";

export interface VimCompanionBridgeRequest {
  source: "note-web";
  channel: "vim-ime";
  id: string;
  action: NativeAction;
}

export interface VimCompanionBridgeResponse {
  source: "note-web-companion";
  channel: "vim-ime";
  id?: string;
  ok?: boolean;
  action?: string;
  strategy?: SwitchStrategy;
  verified?: boolean;
  targetPid?: number;
  targetHwnd?: string;
  elapsedMs?: number;
  message?: string;
  code?: string;
  restored?: boolean;
  released?: boolean;
  type?: "native-state-invalidated" | "native-disconnected";
  reason?: string;
}

export interface NativeHostRequest {
  id: string;
  action: NativeAction;
}

export interface NativeHostResponse {
  id: string;
  ok: boolean;
  action: string;
  strategy?: SwitchStrategy;
  verified?: boolean;
  targetPid?: number;
  targetHwnd?: string;
  elapsedMs?: number;
  message?: string;
  code?: string;
  restored?: boolean;
  released?: boolean;
}
