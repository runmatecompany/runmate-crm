// Egyetlen közös forrás a modulnevekhez — a Sidebar és a Beállítások >
// Fiókok jogosultság-modal is innen olvassa, hogy ha egy modul nevét
// átnevezzük, az mindkét helyen automatikusan frissüljön.
export interface MenuItem {
  id: string;
  label: string;
  children?: MenuItem[];
}

export const MENU_ITEMS: MenuItem[] = [
  { id: "messages", label: "Üzenetek" },
  { id: "leads", label: "Leadek" },
  { id: "leadgen", label: "Lead Gen" },
  { id: "clients", label: "Ügyfelek" },
  { id: "tasks", label: "Feladatok" },
  {
    id: "social",
    label: "Social Media",
    children: [
      { id: "social-status", label: "Állapot" },
      { id: "social-kanban", label: "Content" },
      { id: "social-post-queue", label: "Posztolni valók" },
      { id: "social-shoot-calendar", label: "Forgatási naptár" },
      { id: "social-content-calendar", label: "Tartalomnaptár" },
      { id: "social-drive", label: "Drive" },
    ],
  },
  { id: "chat", label: "Chat" },
  { id: "settings", label: "Beállítások" },
];

export function menuItemLabel(id: string, fallback: string): string {
  for (const item of MENU_ITEMS) {
    if (item.id === id) return item.label;
    const child = item.children?.find((c) => c.id === id);
    if (child) return child.label;
  }
  return fallback;
}
