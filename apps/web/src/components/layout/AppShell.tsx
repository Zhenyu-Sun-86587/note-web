import React, { useRef, useState, useCallback } from "react";

interface AppShellProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  sidebarOpen: boolean;
  sidebarWidth?: number;
  onResizeSidebar?: (newWidth: number) => void;
  zenMode?: boolean;
}

export const AppShell: React.FC<AppShellProps> = ({
  sidebar,
  children,
  sidebarOpen,
  sidebarWidth = 280,
  onResizeSidebar,
  zenMode = false,
}) => {
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(sidebarWidth);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsResizing(true);
      startXRef.current = e.clientX;
      const rootStyle = getComputedStyle(document.documentElement);
      const currentWidth =
        parseInt(rootStyle.getPropertyValue("--sidebar-width"), 10) ||
        sidebarWidth;
      startWidthRef.current = currentWidth;

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const delta = moveEvent.clientX - startXRef.current;
        const nextWidth = Math.max(
          200,
          Math.min(520, startWidthRef.current + delta),
        );
        document.documentElement.style.setProperty(
          "--sidebar-width",
          `${nextWidth}px`,
        );
      };

      const handlePointerUp = (upEvent: PointerEvent) => {
        setIsResizing(false);
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        const delta = upEvent.clientX - startXRef.current;
        const nextWidth = Math.max(
          200,
          Math.min(520, startWidthRef.current + delta),
        );
        onResizeSidebar?.(nextWidth);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    },
    [sidebarWidth, onResizeSidebar],
  );

  const handleDoubleClick = useCallback(() => {
    document.documentElement.style.setProperty("--sidebar-width", "280px");
    onResizeSidebar?.(280);
  }, [onResizeSidebar]);

  return (
    <div
      className={`app-shell ${sidebarOpen ? "sidebar-open" : "sidebar-collapsed"} ${isResizing ? "resizing-sidebar" : ""} ${zenMode ? "zen-mode" : ""}`}
    >
      <aside className="sidebar-container">
        {sidebar}
        {sidebarOpen && (
          <div
            className={`sidebar-resizer ${isResizing ? "is-resizing" : ""}`}
            onPointerDown={handlePointerDown}
            onDoubleClick={handleDoubleClick}
            title="拖拽调整侧边栏宽度，双击恢复默认"
          />
        )}
      </aside>
      <main className="main-container">{children}</main>
    </div>
  );
};
