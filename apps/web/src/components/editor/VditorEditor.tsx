import {
  useEffect,
  useRef,
  useId,
  useImperativeHandle,
  forwardRef,
} from "react";
import Vditor from "vditor";
import "vditor/dist/index.css";
import { uploadAsset } from "../../api/client";
import { resolveMarkdownPreviewUrl } from "../../utils/preview-url";
import type { EditorHandle } from "./EditorHandle";

export type Theme = "light" | "dark";

export interface VditorEditorProps {
  notePath: string;
  value: string;
  theme: Theme;
  onChange: (value: string) => void;
}

const PAIR_MAP: Record<string, string> = {
  "(": ")",
  "[": "]",
  "{": "}",
};

const CLOSING_SET = new Set([")", "]", "}"]);

export const VditorEditor = forwardRef<EditorHandle, VditorEditorProps>(
  ({ notePath, value, theme, onChange }, ref) => {
    const rawId = useId();
    const hostId = `vditor-${rawId.replaceAll(":", "_")}`;
    const editorRef = useRef<Vditor | null>(null);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const syncingRef = useRef(false);
    const lastEmittedValueRef = useRef(value);

    // Expose imperative handle
    useImperativeHandle(
      ref,
      () => ({
        getValue: () => {
          if (editorRef.current) {
            try {
              return editorRef.current.getValue();
            } catch {
              return lastEmittedValueRef.current;
            }
          }
          return lastEmittedValueRef.current;
        },
        focus: () => {
          editorRef.current?.focus();
        },
      }),
      [],
    );

  // Initialize Vditor instance
  useEffect(() => {
    let vditorInstance: Vditor | null = null;
    lastEmittedValueRef.current = value;

    vditorInstance = new Vditor(hostId, {
      mode: "ir",
      height: "100%",
      value,
      theme: theme === "dark" ? "dark" : "classic",
      preview: {
        theme: {
          current: theme === "dark" ? "dark" : "light",
        },
      },
      cache: {
        enable: false,
      },
      input: (val: string) => {
        if (syncingRef.current) return;
        lastEmittedValueRef.current = val;
        onChangeRef.current(val);
      },
      toolbar: [
        "headings",
        "bold",
        "italic",
        "strike",
        "link",
        "|",
        "list",
        "ordered-list",
        "check",
        "quote",
        "|",
        "code",
        "inline-code",
        "table",
        "upload",
        "|",
        "undo",
        "redo",
      ],
      upload: {
        accept: "image/*",
        multiple: true,
        handler: async (files: File[]) => {
          for (const file of files) {
            try {
              const res = await uploadAsset(file, notePath);
              if (vditorInstance) {
                const imgMarkdown = `![${res.name}](${res.markdownPath})\n`;
                vditorInstance.insertValue(imgMarkdown);
              }
            } catch (err: unknown) {
              // eslint-disable-next-line no-alert
              alert(
                `图片上传失败: ${err instanceof Error ? err.message : "未知错误"}`,
              );
            }
          }
          return null;
        },
      },
      after: () => {
        editorRef.current = vditorInstance;
      },
    });

    const hostEl = document.getElementById(hostId);
    let observer: MutationObserver | null = null;

    // Observe image elements in editor to resolve relative preview URLs
    const fixImageUrls = () => {
      if (!hostEl) return;
      const imgs = hostEl.querySelectorAll<HTMLImageElement>("img");
      imgs.forEach((img) => {
        const rawSrc = img.getAttribute("src");
        if (
          rawSrc &&
          !rawSrc.startsWith("http://") &&
          !rawSrc.startsWith("https://") &&
          !rawSrc.startsWith("data:") &&
          !rawSrc.startsWith("/api/raw/") &&
          !rawSrc.startsWith("//")
        ) {
          const resolved = resolveMarkdownPreviewUrl(notePath, rawSrc);
          img.src = resolved;
        }
      });
    };

    // Auto-pair () [] {} and skip-close handling
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing) return;

      const target = e.target as HTMLElement | null;
      if (!target || !hostEl?.contains(target)) return;
      if (!target.closest(".vditor-reset")) return;

      if (PAIR_MAP[e.key] && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;
        const range = selection.getRangeAt(0);

        const openChar = e.key;
        const closeChar = PAIR_MAP[openChar];

        if (!range.collapsed) {
          if (
            range.startContainer === range.endContainer &&
            range.startContainer.nodeType === Node.TEXT_NODE
          ) {
            e.preventDefault();
            const selectedText = range.toString();
            document.execCommand(
              "insertText",
              false,
              `${openChar}${selectedText}${closeChar}`,
            );
            return;
          }
          return;
        }

        e.preventDefault();
        document.execCommand("insertText", false, `${openChar}${closeChar}`);
        selection.modify("move", "backward", "character");
        return;
      }

      if (CLOSING_SET.has(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const selection = window.getSelection();
        if (!selection || !selection.isCollapsed || !selection.focusNode) return;

        const node = selection.focusNode;
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent || "";
          const offset = selection.focusOffset;
          if (offset < text.length && text[offset] === e.key) {
            e.preventDefault();
            selection.modify("move", "forward", "character");
          }
        }
      }
    };

    if (hostEl) {
      observer = new MutationObserver(() => {
        fixImageUrls();
      });
      observer.observe(hostEl, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["src"],
      });
      hostEl.addEventListener("keydown", handleKeyDown, true);
    }

    return () => {
      if (hostEl) {
        hostEl.removeEventListener("keydown", handleKeyDown, true);
      }
      observer?.disconnect();
      try {
        if (vditorInstance) {
          vditorInstance.destroy();
        }
      } catch {
        // ignore destroy error
      }
      editorRef.current = null;
    };
    // Recreate instance only when notePath changes or theme changes
  }, [hostId, notePath, theme]);

  // Synchronize external value updates (e.g. disk change or conflict reload)
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    // Skip echo when the value change originated from the editor's local input
    if (value === lastEmittedValueRef.current) {
      return;
    }

    try {
      const current = editor.getValue();
      if (current === value) {
        lastEmittedValueRef.current = value;
        return;
      }
      syncingRef.current = true;
      editor.setValue(value);
      lastEmittedValueRef.current = value;
    } catch {
      // ignore get/setValue timing errors
    } finally {
      syncingRef.current = false;
    }
  }, [value]);

  return <div id={hostId} className="editor-container" />;
});

VditorEditor.displayName = "VditorEditor";
