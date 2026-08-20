import { Vim } from "@replit/codemirror-vim";

export const VIM_SESSION_KEY = "note-web-vim-session-v1";

export interface PersistedVimRegister {
  keyBuffer: string[];
  insertModeChanges: unknown[];
  searchQueries: string[];
  linewise: boolean;
  blockwise: boolean;
}

export interface PersistedVimSession {
  version: 1;
  registers: Record<string, PersistedVimRegister>;
  latestMacroRegister?: string;
}

let vimSessionRestored = false;

export function restoreVimSessionOnce(): void {
  if (vimSessionRestored) return;
  vimSessionRestored = true;

  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    const raw = sessionStorage.getItem(VIM_SESSION_KEY);
    if (!raw) return;
    const parsed: PersistedVimSession = JSON.parse(raw);
    if (!parsed || parsed.version !== 1 || typeof parsed.registers !== "object") {
      sessionStorage.removeItem(VIM_SESSION_KEY);
      return;
    }

    const registerController = (Vim as any).getRegisterController?.();
    if (!registerController) return;

    for (const [key, data] of Object.entries(parsed.registers)) {
      if (!/^[a-z]$/.test(key)) continue;
      const reg = registerController.getRegister(key);
      if (reg && data) {
        reg.keyBuffer = Array.isArray(data.keyBuffer) ? [...data.keyBuffer] : [];
        reg.insertModeChanges = Array.isArray(data.insertModeChanges)
          ? data.insertModeChanges.map((imc: any) => {
              if (imc && typeof imc === "object" && Array.isArray(imc.changes)) {
                return {
                  changes: imc.changes.map((c: any) => {
                    if (
                      c &&
                      typeof c === "object" &&
                      c.keyName &&
                      (Vim as any).InsertModeKey
                    ) {
                      return new (Vim as any).InsertModeKey(c.keyName, {
                        key: c.key ?? c.keyName ?? "",
                        ctrlKey: Boolean(c.ctrlKey),
                        altKey: Boolean(c.altKey),
                        metaKey: Boolean(c.metaKey),
                        shiftKey: Boolean(c.shiftKey),
                      });
                    }
                    return c;
                  }),
                  expectCursorActivityForChange: Boolean(
                    imc.expectCursorActivityForChange,
                  ),
                };
              }
              return imc;
            })
          : [];
        reg.searchQueries = Array.isArray(data.searchQueries)
          ? [...data.searchQueries]
          : [];
        reg.linewise = Boolean(data.linewise);
        reg.blockwise = Boolean(data.blockwise);
      }
    }

    if (
      parsed.latestMacroRegister &&
      /^[a-z]$/.test(parsed.latestMacroRegister)
    ) {
      const globalState = (Vim as any).getVimGlobalState_?.();
      if (globalState?.macroModeState) {
        globalState.macroModeState.latestRegister = parsed.latestMacroRegister;
      }
    }
  } catch {
    try {
      sessionStorage.removeItem(VIM_SESSION_KEY);
    } catch {}
  }
}

export function persistVimSession(): void {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    const registerController = (Vim as any).getRegisterController?.();
    if (!registerController?.registers) return;

    const registers: Record<string, PersistedVimRegister> = {};
    const lowerLetters = "abcdefghijklmnopqrstuvwxyz";
    for (const ch of lowerLetters) {
      const reg = registerController.registers[ch];
      if (
        reg &&
        ((Array.isArray(reg.keyBuffer) && reg.keyBuffer.length > 0 && reg.keyBuffer.some(Boolean)) ||
          (Array.isArray(reg.insertModeChanges) && reg.insertModeChanges.length > 0) ||
          (Array.isArray(reg.searchQueries) && reg.searchQueries.length > 0))
      ) {
        registers[ch] = {
          keyBuffer: Array.isArray(reg.keyBuffer) ? [...reg.keyBuffer] : [],
          insertModeChanges: Array.isArray(reg.insertModeChanges)
            ? JSON.parse(JSON.stringify(reg.insertModeChanges))
            : [],
          searchQueries: Array.isArray(reg.searchQueries)
            ? [...reg.searchQueries]
            : [],
          linewise: Boolean(reg.linewise),
          blockwise: Boolean(reg.blockwise),
        };
      }
    }

    const globalState = (Vim as any).getVimGlobalState_?.();
    const latestMacroRegister =
      globalState?.macroModeState?.latestRegister &&
      /^[a-z]$/.test(globalState.macroModeState.latestRegister)
        ? globalState.macroModeState.latestRegister
        : undefined;

    const payload: PersistedVimSession = {
      version: 1,
      registers,
      latestMacroRegister,
    };

    sessionStorage.setItem(VIM_SESSION_KEY, JSON.stringify(payload));
  } catch {
    // ignore sessionStorage write errors
  }
}
