import type { HeadingItem } from "../../utils/outline-parser";

export interface EditorHandle {
  getValue: () => string;
  focus: () => void;
  scrollToHeading?: (heading: HeadingItem) => void;
  scrollToLine?: (line: number) => void;
  scrollViewportToLine?: (line: number) => void;
  getVisibleTopLine?: () => number;
  getCursorLine?: () => number;
}
