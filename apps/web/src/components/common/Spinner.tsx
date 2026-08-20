import React from "react";
import { Loader2 } from "lucide-react";

interface SpinnerProps {
  size?: number;
  className?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({ size = 16, className = "" }) => {
  return <Loader2 size={size} className={`spinner ${className}`} />;
};
