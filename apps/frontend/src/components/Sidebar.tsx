import logo from "../assets/logo.png";

export interface MenuItem {
  id: string;
  label: string;
}

export const MENU_ITEMS: MenuItem[] = [
  { id: "dashboard", label: "Vezérlőpult" },
  { id: "clients", label: "Ügyfelek" },
  { id: "campaigns", label: "Kampányok" },
  { id: "tasks", label: "Feladatok" },
  { id: "reports", label: "Riportok" },
  { id: "settings", label: "Beállítások" },
];

interface SidebarProps {
  activeId: string;
  onSelect: (id: string) => void;
  userName: string;
  onLogout: () => void;
}

export default function Sidebar({ activeId, onSelect, userName, onLogout }: SidebarProps) {
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
        <div className="sidebar-user">{userName}</div>
        <button className="sidebar-logout" onClick={onLogout}>
          Kijelentkezés
        </button>
      </div>
    </aside>
  );
}
