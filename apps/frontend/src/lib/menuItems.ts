// Egyetlen közös forrás a modulnevekhez — a Sidebar és a Beállítások >
// Fiókok jogosultság-modal is innen olvassa, hogy ha egy modul nevét
// átnevezzük, az mindkét helyen automatikusan frissüljön.
export interface MenuItem {
  id: string;
  label: string;
}

export const MENU_ITEMS: MenuItem[] = [
  { id: "messages", label: "Üzenetek" },
  { id: "leads", label: "Leadek" },
  { id: "chat", label: "Chat" },
  { id: "settings", label: "Beállítások" },
];

export function menuItemLabel(id: string, fallback: string): string {
  return MENU_ITEMS.find((item) => item.id === id)?.label ?? fallback;
}
