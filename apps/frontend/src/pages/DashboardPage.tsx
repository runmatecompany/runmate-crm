import { useState } from "react";
import Sidebar, { MENU_ITEMS } from "../components/Sidebar";
import { useAuth } from "../lib/auth";
import ChatPage from "./ChatPage";
import SettingsPage from "./SettingsPage";

export default function DashboardPage() {
  const { auth, logout } = useAuth();
  const [activeId, setActiveId] = useState(MENU_ITEMS[0].id);

  const activeLabel = MENU_ITEMS.find((item) => item.id === activeId)?.label ?? "";

  return (
    <div className="app-shell">
      <Sidebar
        activeId={activeId}
        onSelect={setActiveId}
        userId={auth?.user.id ?? 0}
        userName={auth?.user.name ?? ""}
        onLogout={logout}
      />
      {activeId === "chat" ? (
        <ChatPage />
      ) : activeId === "settings" ? (
        <SettingsPage />
      ) : (
        <main className="content">
          <h1>{activeLabel}</h1>
          <p className="content-placeholder">Ez a szekció még nincs kidolgozva.</p>
        </main>
      )}
    </div>
  );
}
