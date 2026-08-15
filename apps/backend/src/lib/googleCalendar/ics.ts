// Egyszerű, egy-eseményes iCalendar (.ics) fájl felépítése — nincs hozzá
// külön npm-csomag, egy VEVENT+VALARM ehhez a méretű feladathoz percek
// alatt kézzel is összeállítható és könnyebb átlátni, mint egy általános
// célú könyvtárat bevonni.
export function toIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function foldLine(line: string): string {
  // Az iCalendar spec 75 oktett után sortörést + szóköz-behúzást kér —
  // ennél a rövid szövegeknél gyakorlatilag sosem lép túl ezen, de a
  // biztonság kedvéért egyszerű hosszkorlátozás.
  return line.length <= 74 ? line : `${line.slice(0, 74)}\r\n ${line.slice(74)}`;
}

export interface IcsEventInput {
  uid: string;
  title: string;
  start: Date;
  durationMinutes: number;
  description?: string;
}

export function buildIcsEvent(input: IcsEventInput): string {
  const end = new Date(input.start.getTime() + input.durationMinutes * 60_000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RunMate CRM//Social Media//HU",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `DTSTAMP:${toIcsDate(new Date())}`,
    `DTSTART:${toIcsDate(input.start)}`,
    `DTEND:${toIcsDate(end)}`,
    foldLine(`SUMMARY:${input.title}`),
    ...(input.description ? [foldLine(`DESCRIPTION:${input.description.replace(/\r?\n/g, "\\n")}`)] : []),
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Emlékeztető",
    "TRIGGER:-P1D",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}
