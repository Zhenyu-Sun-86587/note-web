import React, { useEffect, useRef, useId } from "react";
import Vditor from "vditor";
import "vditor/dist/index.css";
import { uploadAsset } from "../../api/client";
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

    return () => {
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

  return <div id={hostId} className="editor-container" />;
};
