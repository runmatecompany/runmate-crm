import { useState } from "react";

export interface MonthGridEvent {
  id: number;
  date: Date;
  label: string;
  color?: string;
}

interface MonthGridProps {
  events: MonthGridEvent[];
  onEventClick: (id: number) => void;
}

const WEEKDAY_LABELS = ["H", "K", "Sze", "Cs", "P", "Szo", "V"];
const MONTH_LABELS = [
  "Január", "Február", "Március", "Április", "Május", "Június",
  "Július", "Augusztus", "Szeptember", "Október", "November", "December",
];

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function MonthGrid({ events, onEventClick }: MonthGridProps) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  // A hét hétfővel kezdődik: a JS getDay() 0=vasárnap, ezt toljuk el, hogy 0=hétfő legyen.
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="sm-calendar">
      <div className="sm-calendar-header">
        <button type="button" onClick={() => setCursor(new Date(year, month - 1, 1))}>
          ←
        </button>
        <span>
          {MONTH_LABELS[month]} {year}
        </span>
        <button type="button" onClick={() => setCursor(new Date(year, month + 1, 1))}>
          →
        </button>
      </div>
      <div className="sm-calendar-grid sm-calendar-weekdays">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="sm-calendar-weekday">
            {w}
          </div>
        ))}
      </div>
      <div className="sm-calendar-grid">
        {cells.map((day, i) => {
          if (day == null) return <div key={i} className="sm-calendar-cell sm-calendar-cell-empty" />;
          const cellDate = new Date(year, month, day);
          const dayEvents = events.filter((e) => sameDay(e.date, cellDate));
          const isToday = sameDay(cellDate, new Date());
          return (
            <div key={i} className={isToday ? "sm-calendar-cell sm-calendar-cell-today" : "sm-calendar-cell"}>
              <span className="sm-calendar-day-num">{day}</span>
              {dayEvents.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className="sm-calendar-event"
                  style={e.color ? { borderLeftColor: e.color } : undefined}
                  onClick={() => onEventClick(e.id)}
                  title={e.label}
                >
                  {e.label}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
