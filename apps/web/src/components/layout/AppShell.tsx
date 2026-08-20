import React from "react";

interface AppShellProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  sidebarOpen: boolean;
}

export const AppShell: React.FC<AppShellProps> = ({
  sidebar,
  children,
  sidebarOpen,
}) => {
  return (
    <div className={`app-shell ${sidebarOpen ? "sidebar-open" : "sidebar-collapsed"}`}>
      <aside className="sidebar-container">{sidebar}</aside>
      <main className="main-container">{children}</main>
    </div>
  );
};
