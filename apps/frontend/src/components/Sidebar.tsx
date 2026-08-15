import logo from "../assets/logo.png";
import { useUpdater } from "../lib/updater";
import { MENU_ITEMS } from "../lib/menuItems";
import Avatar from "./Avatar";

interface SidebarProps {
  activeId: string;
  onSelect: (id: string) => void;
  userId: number;
  userName: string;
  onLogout: () => void;
}

export default function Sidebar({ activeId, onSelect, userId, userName, onLogout }: SidebarProps) {
  const { status, installAndRestart } = useUpdater();
  const updateAvailable = status === "available" || status === "installing";

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <img src={logo} alt="" className="sidebar-brand-logo" />
        <span>RunMate CRM</span>
      </div>

      <nav className="sidebar-nav">
        {MENU_ITEMS.map((item) => (
          <button
            key={item.id}
            className={item.id === activeId ? "sidebar-link active" : "sidebar-link"}
            onClick={() => onSelect(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        {updateAvailable ? (
          <button
            className="sidebar-update-btn"
            onClick={installAndRestart}
            disabled={status === "installing"}
          >
            <span className="sidebar-update-title">
              {status === "installing" ? "Frissítés folyamatban..." : "Frissítés elérhető"}
            </span>
            <span className="sidebar-update-sub">Frissítés és újraindítás</span>
          </button>
        ) : (
          <div className="sidebar-user">
            <Avatar userId={userId} name={userName} size={26} />
            <span>{userName}</span>
          </div>
        )}
        <button className="sidebar-logout" onClick={onLogout}>
          Kijelentkezés
        </button>
      </div>
    </aside>
  );
}
