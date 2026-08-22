export const VIM_SPLIT_RATIO_STORAGE_KEY = "note-web-vim-split-ratio-v1";
export const MIN_SPLIT_RATIO = 0.15;
export const MAX_SPLIT_RATIO = 0.85;
export const DEFAULT_SPLIT_RATIO = 0.5;

export function clampSplitRatio(ratio: number): number {
  if (Number.isNaN(ratio)) return DEFAULT_SPLIT_RATIO;
  return Math.max(MIN_SPLIT_RATIO, Math.min(MAX_SPLIT_RATIO, ratio));
}

export function loadSavedSplitRatio(): number {
  try {
    if (typeof localStorage === "undefined") return DEFAULT_SPLIT_RATIO;
    const saved = localStorage.getItem(VIM_SPLIT_RATIO_STORAGE_KEY);
    if (saved) {
      const parsed = parseFloat(saved);
      if (!Number.isNaN(parsed)) {
        return clampSplitRatio(parsed);
      }
    }
  } catch {}
  return DEFAULT_SPLIT_RATIO;
}

export function saveSplitRatio(ratio: number): void {
  try {
    if (typeof localStorage === "undefined") return;
    const clamped = clampSplitRatio(ratio);
    localStorage.setItem(VIM_SPLIT_RATIO_STORAGE_KEY, clamped.toString());
  } catch {}
}

export function calculateSplitRatio(
  clientX: number,
  containerRect: { left: number; width: number },
): number {
  if (containerRect.width <= 0) return DEFAULT_SPLIT_RATIO;
  const rawRatio = (clientX - containerRect.left) / containerRect.width;
  return clampSplitRatio(rawRatio);
}
