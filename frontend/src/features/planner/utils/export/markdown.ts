import type { ExportData, ExportOptions } from "./types";

function formatDate(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function toISODate(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toISOString().split("T")[0];
  } catch {
    return dateStr;
  }
}

export function exportToMarkdown(data: ExportData, _options: ExportOptions): string {
  const lines: string[] = [];

  lines.push(`# Project Report: ${data.project.name}`);
  lines.push(`**Status:** ${data.project.status} | **Exported:** ${new Date().toLocaleDateString()}`);
  lines.push(`**Tasks:** ${data.project.task_count} | **Milestones:** ${data.project.milestone_count} | **Risk Score:** ${data.risk?.score ?? "N/A"}/100`);
  lines.push("");
  if (data.project.description) {
    lines.push(data.project.description);
    lines.push("");
  }

  // Table of Contents
  lines.push("## Table of Contents");
  let num = 1;
  lines.push(`${num++}. [Project Timeline](#project-timeline)`);
  if (data.tasks.length > 0) lines.push(`${num++}. [Tasks (${data.tasks.length})](#tasks)`);
  if (data.milestones.length > 0) lines.push(`${num++}. [Milestones (${data.milestones.length})](#milestones)`);
  if (data.members.length > 0) lines.push(`${num++}. [Team (${data.members.length})](#team)`);
  if (data.risk) lines.push(`${num++}. [Risk Assessment](#risk-assessment)`);
  if (data.conflicts.length > 0) lines.push(`${num++}. [Conflicts (${data.conflicts.length})](#conflicts)`);
  if (data.wiki_pages.length > 0) lines.push(`${num++}. [Related Wiki Pages (${data.wiki_pages.length})](#related-wiki-pages)`);
  if (data.changesets.length > 0) lines.push(`${num++}. [Change History](#change-history)`);
  lines.push("");

  // Gantt
  const allDated = data.tasks.filter((t) => t.start_date && t.end_date);
  if (allDated.length > 0) {
    lines.push("## Project Timeline");
    lines.push("```mermaid");
    lines.push("gantt");
    lines.push(`    title ${data.project.name}`);
    lines.push("    dateFormat  YYYY-MM-DD");
    lines.push("");

    const sections = new Map<string, typeof allDated>();
    allDated.forEach((t) => {
      const section = t.parent_task_title || "Tasks";
      if (!sections.has(section)) sections.set(section, []);
      sections.get(section)!.push(t);
    });

    sections.forEach((tasks, section) => {
      lines.push(`    section ${section}`);
      tasks.forEach((t) => {
        const status = t.status === "done" || t.status === "completed" ? "done" : "active";
        const start = toISODate(t.start_date);
        const end = toISODate(t.end_date);
        const id = `t${t.id.substring(0, 6)}`;
        lines.push(`    ${t.title.substring(0, 40)} :${status}, ${id}, ${start}, ${end}`);
      });
    });

    lines.push("```");
    lines.push("");
  }

  // Tasks
  if (data.tasks.length > 0) {
    lines.push("## Tasks");
    lines.push("");
    lines.push("| # | Title | Status | Priority | Assignee | Dates |");
    lines.push("|---|-------|--------|----------|----------|-------|");
    data.tasks.forEach((t, i) => {
      const status = t.status || "todo";
      const assignee = t.assignee_name || t.assignee_email || "-";
      const dates = `${formatDate(t.start_date)} → ${formatDate(t.end_date)}`;
      lines.push(`| ${i + 1} | ${t.title} | ${status} | ${t.priority || "medium"} | ${assignee} | ${dates} |`);
    });
    lines.push("");
  }

  // Milestones
  if (data.milestones.length > 0) {
    lines.push("## Milestones");
    lines.push("");
    data.milestones.forEach((m) => {
      const date = m.target_date ? formatDate(m.target_date) : "";
      const status = m.status === "reached" || m.status === "completed" ? "✓" : "○";
      lines.push(`- ${status} **${m.title}** — ${date}${m.description ? ` _${m.description.substring(0, 80)}_` : ""}`);
    });
    lines.push("");
  }

  // Dependencies Graph
  if (data.dependencies.length > 0) {
    lines.push("## Task Dependencies");
    lines.push("```mermaid");
    lines.push("graph TD");
    data.dependencies.forEach((d) => {
      const from = d.from_title.substring(0, 30);
      const to = d.to_title.substring(0, 30);
      lines.push(`    ${d.from_task_id.substring(0, 6)}["${from}"] --> ${d.to_task_id.substring(0, 6)}["${to}"]`);
    });
    lines.push("```");
    lines.push("");
  }

  // Team
  if (data.members.length > 0) {
    lines.push("## Team");
    lines.push("");
    lines.push("| Name | Email | Role | Joined |");
    lines.push("|------|-------|------|--------|");
    data.members.forEach((m) => {
      lines.push(`| ${m.name || m.email} | ${m.email} | ${m.role} | ${formatDate(m.joined_at)} |`);
    });
    lines.push("");
  }

  // Risk
  if (data.risk) {
    lines.push("## Risk Assessment");
    lines.push("");
    lines.push(`**Score:** ${data.risk.score}/100`);
    if (data.risk.factors.length > 0) {
      lines.push("");
      lines.push("**Risk Factors:**");
      data.risk.factors.forEach((f) => lines.push(`- ⚠ ${f}`));
    }
    if (data.risk.suggestions.length > 0) {
      lines.push("");
      lines.push("**Mitigations:**");
      data.risk.suggestions.forEach((s) => lines.push(`- ✓ ${s}`));
    }
    lines.push("");
  }

  // Conflicts
  if (data.conflicts.length > 0) {
    lines.push("## Conflicts");
    lines.push("");
    data.conflicts.forEach((c) => {
      const sev = c.severity === "high" ? "🔴" : "🟡";
      lines.push(`- ${sev} **${c.title}** (${c.severity || "medium"})${c.description ? ` — ${c.description}` : ""}`);
    });
    lines.push("");
  }

  // Wiki Pages — Full content
  if (data.wiki_pages.length > 0) {
    lines.push("## Related Wiki Pages");
    lines.push("");
    data.wiki_pages.forEach((wp, i) => {
      lines.push(`### ${i + 1}. ${wp.title}`);
      if (wp.updated_at) lines.push(`_Last updated: ${formatDate(wp.updated_at)}_`);
      lines.push("");
      lines.push(wp.content || "_No content_");
      lines.push("");
      lines.push("---");
      lines.push("");
    });
  }

  // Changes
  if (data.changesets.length > 0) {
    lines.push("## Change History");
    lines.push("");
    data.changesets.forEach((cs) => {
      const status = cs.status === "approved" ? "✓" : "○";
      lines.push(`- ${status} **${cs.status}** — ${formatDate(cs.created_at)} (${cs.mutations?.length || 0} mutations)`);
    });
    lines.push("");
  }

  return lines.join("\n");
}
