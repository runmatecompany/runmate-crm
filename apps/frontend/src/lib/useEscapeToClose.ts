import { useEffect } from "react";

// Popup ablakok csak explicit interakcióra (X, Mégse, Esc) záródjanak be,
// véletlen melléklattintásra soha — ezt minden modál-komponens meghívja.
export function useEscapeToClose(onClose: () => void): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
}
