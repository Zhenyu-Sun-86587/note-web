import React from "react";

interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  label: string;
  size?: "sm" | "md";
  active?: boolean;
}

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  label,
  size = "md",
  active = false,
  className = "",
  ...props
}) => {
  return (
    <button
      className={`icon-btn icon-btn-${size} ${active ? "active" : ""} ${className}`}
      title={label}
      aria-label={label}
      {...props}
    >
      {icon}
    </button>
  );
};
