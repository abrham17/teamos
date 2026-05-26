import type { ExportData, ExportOptions } from "./types";

function toICSDate(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  } catch {
    return "";
  }
}

function escapeICS(text: string): string {
  return text.replace(/[\\;,]/g, "\\$&").replace(/\n/g, "\\n");
}

export function exportToIcs(data: ExportData, _options: ExportOptions): string {
  const lines: string[] = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push("PRODID:-//TeamOS//Project Export//EN");
  lines.push(`X-WR-CALNAME:${escapeICS(data.project.name)}`);
  lines.push("X-WR-CALDESC:TeamOS Project Export");
  lines.push("X-WR-TIMEZONE:UTC");

  data.tasks.forEach((t) => {
    const start = toICSDate(t.start_date);
    const end = toICSDate(t.end_date);
    if (!start) return;

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:task-${t.id}@teamos`);
    lines.push(`DTSTART:${start}`);
    if (end) lines.push(`DTEND:${end}`);
    lines.push(`SUMMARY:${escapeICS(`[${t.status}] ${t.title}`)}`);
    if (t.description) lines.push(`DESCRIPTION:${escapeICS(t.description.substring(0, 200))}`);
    if (t.priority === "high") lines.push("PRIORITY:1");
    else if (t.priority === "medium") lines.push("PRIORITY:5");
    else lines.push("PRIORITY:9");
    lines.push("END:VEVENT");
  });

  data.milestones.forEach((m) => {
    const date = toICSDate(m.target_date);
    if (!date) return;

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:milestone-${m.id}@teamos`);
    lines.push(`DTSTART:${date}`);
    lines.push(`SUMMARY:${escapeICS(`[Milestone] ${m.title}`)}`);
    if (m.description) lines.push(`DESCRIPTION:${escapeICS(m.description.substring(0, 200))}`);
    lines.push("PRIORITY:3");
    lines.push("END:VEVENT");
  });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
