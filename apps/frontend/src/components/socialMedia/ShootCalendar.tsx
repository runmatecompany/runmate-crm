import MonthGrid, { type MonthGridEvent } from "./MonthGrid";
import type { ContentItem } from "../../lib/socialMedia";

const PALETTE = ["#2f7fe0", "#5b8c3e", "#b8622f", "#8955c4", "#c23f6f", "#2c9c8f"];

function colorForClient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

interface ShootCalendarProps {
  items: ContentItem[];
  onOpen: (id: number) => void;
}

export default function ShootCalendar({ items, onOpen }: ShootCalendarProps) {
  const events: MonthGridEvent[] = items
    .filter((i) => i.shoot_date)
    .map((i) => ({
      id: i.id,
      date: new Date(i.shoot_date!),
      label: `${i.client_name} — ${i.title}`,
      color: colorForClient(i.client_name),
    }));

  return <MonthGrid events={events} onEventClick={onOpen} />;
}
