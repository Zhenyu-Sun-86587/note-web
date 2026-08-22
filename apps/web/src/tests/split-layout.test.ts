import { describe, it, expect, beforeEach } from "vitest";
import {
  clampSplitRatio,
  loadSavedSplitRatio,
  saveSplitRatio,
  calculateSplitRatio,
  VIM_SPLIT_RATIO_STORAGE_KEY,
  DEFAULT_SPLIT_RATIO,
  MIN_SPLIT_RATIO,
  MAX_SPLIT_RATIO,
} from "../utils/split-layout";

describe("Split Layout Utils", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("clampSplitRatio", () => {
    it("returns clamped value within [MIN_SPLIT_RATIO, MAX_SPLIT_RATIO]", () => {
      expect(clampSplitRatio(0.5)).toBe(0.5);
      expect(clampSplitRatio(0.1)).toBe(MIN_SPLIT_RATIO);
      expect(clampSplitRatio(0.95)).toBe(MAX_SPLIT_RATIO);
      expect(clampSplitRatio(MIN_SPLIT_RATIO)).toBe(MIN_SPLIT_RATIO);
      expect(clampSplitRatio(MAX_SPLIT_RATIO)).toBe(MAX_SPLIT_RATIO);
    });

    it("returns default ratio for NaN", () => {
      expect(clampSplitRatio(NaN)).toBe(DEFAULT_SPLIT_RATIO);
    });
  });

  describe("loadSavedSplitRatio & saveSplitRatio", () => {
    it("returns default ratio when no storage value exists", () => {
      expect(loadSavedSplitRatio()).toBe(DEFAULT_SPLIT_RATIO);
    });

    it("loads and clamps stored split ratio", () => {
      localStorage.setItem(VIM_SPLIT_RATIO_STORAGE_KEY, "0.65");
      expect(loadSavedSplitRatio()).toBe(0.65);

      localStorage.setItem(VIM_SPLIT_RATIO_STORAGE_KEY, "0.05");
      expect(loadSavedSplitRatio()).toBe(MIN_SPLIT_RATIO);

      localStorage.setItem(VIM_SPLIT_RATIO_STORAGE_KEY, "invalid");
      expect(loadSavedSplitRatio()).toBe(DEFAULT_SPLIT_RATIO);
    });

    it("saves clamped split ratio to localStorage", () => {
      saveSplitRatio(0.72);
      expect(localStorage.getItem(VIM_SPLIT_RATIO_STORAGE_KEY)).toBe("0.72");

      saveSplitRatio(0.02);
      expect(localStorage.getItem(VIM_SPLIT_RATIO_STORAGE_KEY)).toBe(String(MIN_SPLIT_RATIO));
    });
  });

  describe("calculateSplitRatio", () => {
    it("calculates ratio relative to container rect", () => {
      const containerRect = { left: 100, width: 1000 };
      expect(calculateSplitRatio(600, containerRect)).toBe(0.5);
      expect(calculateSplitRatio(400, containerRect)).toBe(0.3);
      expect(calculateSplitRatio(800, containerRect)).toBe(0.7);
    });

    it("clamps ratio when pointer is dragged beyond bounds", () => {
      const containerRect = { left: 100, width: 1000 };
      expect(calculateSplitRatio(100, containerRect)).toBe(MIN_SPLIT_RATIO);
      expect(calculateSplitRatio(1050, containerRect)).toBe(MAX_SPLIT_RATIO);
    });

    it("handles zero or negative container width safely", () => {
      expect(calculateSplitRatio(200, { left: 100, width: 0 })).toBe(DEFAULT_SPLIT_RATIO);
      expect(calculateSplitRatio(200, { left: 100, width: -50 })).toBe(DEFAULT_SPLIT_RATIO);
    });
  });
});
