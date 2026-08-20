import { useEffect } from "react";

export function useWindowFocusRefresh(onFocus: () => void) {
  useEffect(() => {
    const handleFocus = () => {
      onFocus();
    };

    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [onFocus]);
}
