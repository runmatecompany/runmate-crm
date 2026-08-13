import { useEffect, useRef, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 perc

export type UpdaterStatus = "idle" | "checking" | "available" | "installing" | "error";

export function useUpdater() {
  const [status, setStatus] = useState<UpdaterStatus>("idle");
  const [version, setVersion] = useState<string | null>(null);
  const updateRef = useRef<Update | null>(null);

  async function checkNow() {
    setStatus((s) => (s === "installing" ? s : "checking"));
    try {
      const update = await check();
      if (update?.available) {
        updateRef.current = update;
        setVersion(update.version);
        setStatus("available");
      } else {
        updateRef.current = null;
        setStatus((s) => (s === "installing" ? s : "idle"));
      }
    } catch {
      // Nincs elérhető szerver / fejlesztői módban nincs frissítési endpoint — csendben elnyeljük.
      setStatus((s) => (s === "installing" ? s : "idle"));
    }
  }

  useEffect(() => {
    checkNow();
    const interval = setInterval(checkNow, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  async function installAndRestart() {
    if (!updateRef.current) return;
    setStatus("installing");
    try {
      await updateRef.current.downloadAndInstall();
      await relaunch();
    } catch {
      setStatus("error");
    }
  }

  return { status, version, installAndRestart };
}
