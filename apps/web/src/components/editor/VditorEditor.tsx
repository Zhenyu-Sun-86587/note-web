import React, { useEffect, useRef, useId } from "react";
import Vditor from "vditor";
import "vditor/dist/index.css";
import { uploadAsset } from "../../api/client";
import { resolveMarkdownPreviewUrl } from "../../utils/preview-url";
import type { Theme } from "../../hooks/useTheme";

interface VditorEditorProps {
  notePath: string;
  value: string;
  theme: Theme;
  onChange: (value: string) => void;
}

export const VditorEditor: React.FC<VditorEditorProps> = ({
  notePath,
  value,
  theme,
  onChange,
}) => {
  const rawId = useId();
  const hostId = `vditor-${rawId.replaceAll(":", "_")}`;
  const editorRef = useRef<Vditor | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const syncingRef = useRef(false);

  // Initialize Vditor instance
  useEffect(() => {
    let vditorInstance: Vditor | null = null;

    vditorInstance = new Vditor(hostId, {
      mode: "ir",
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

    // Observe image elements in editor to resolve relative preview URLs
    const hostEl = document.getElementById(hostId);
    let observer: MutationObserver | null = null;

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

    if (hostEl) {
      observer = new MutationObserver(() => {
        fixImageUrls();
      });
      observer.observe(hostEl, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
    }

    return () => {
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

    try {
      const current = editor.getValue();
      if (current !== value) {
        syncingRef.current = true;
        editor.setValue(value);
        syncingRef.current = false;
      }
    } catch {
      // ignore get/setValue timing errors
    }
  }, [value]);

  return <div id={hostId} className="editor-container" />;
};
