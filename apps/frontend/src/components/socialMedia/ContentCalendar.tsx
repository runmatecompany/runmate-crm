import { useState } from "react";
import MonthGrid, { type MonthGridEvent } from "./MonthGrid";
import { PLATFORM_LABELS, type ContentItem, type Platform } from "../../lib/socialMedia";

const PLATFORM_OPTIONS: Platform[] = ["instagram", "tiktok", "youtube", "facebook"];

interface ContentCalendarProps {
  items: ContentItem[];
  onOpen: (id: number) => void;
}

export default function ContentCalendar({ items, onOpen }: ContentCalendarProps) {
  const [platformFilter, setPlatformFilter] = useState<Platform | "all">("all");

  const filtered = items.filter((i) => platformFilter === "all" || i.platform === platformFilter);
  const events: MonthGridEvent[] = filtered
    .filter((i) => i.scheduled_publish_at)
    .map((i) => ({
      id: i.id,
      date: new Date(i.scheduled_publish_at!),
      label: `${PLATFORM_LABELS[i.platform]}: ${i.title}`,
    }));

  return (
    <div>
      <div className="leads-status-tabs">
        <button
          type="button"
          className={platformFilter === "all" ? "leads-status-tab active" : "leads-status-tab"}
          onClick={() => setPlatformFilter("all")}
        >
          Összes
        </button>
        {PLATFORM_OPTIONS.map((p) => (
          <button
            key={p}
            type="button"
            className={platformFilter === p ? "leads-status-tab active" : "leads-status-tab"}
            onClick={() => setPlatformFilter(p)}
          >
            {PLATFORM_LABELS[p]}
          </button>
        ))}
      </div>
      <MonthGrid events={events} onEventClick={onOpen} />
    </div>
  );
}
