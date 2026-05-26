import type { ExportData, ExportOptions } from "./types";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

function priorityColor(priority: string): string {
  switch (priority.toLowerCase()) {
    case "high": return "#ef4444";
    case "medium": return "#f59e0b";
    case "low": return "#22c55e";
    default: return "#6b7280";
  }
}

function riskColor(score: number): string {
  if (score <= 30) return "#22c55e";
  if (score <= 60) return "#f59e0b";
  return "#ef4444";
}

function buildStyle(): string {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f1117; color: #e5e7eb; line-height: 1.6;
      padding: 40px; max-width: 1200px; margin: 0 auto;
    }
    h1 { font-size: 28px; color: #fff; margin-bottom: 4px; }
    h2 { font-size: 20px; color: #a78bfa; margin: 32px 0 16px; border-bottom: 1px solid #1f2937; padding-bottom: 8px; }
    h3 { font-size: 16px; color: #e5e7eb; margin: 16px 0 8px; }
    .meta { color: #9ca3af; font-size: 14px; margin-bottom: 24px; }
    .stats { display: grid; grid-template-columns: repeat(5,1fr); gap: 12px; margin: 24px 0; }
    .stat-card { background: #1a1d2e; border: 1px solid #1f2937; border-radius: 12px; padding: 16px; text-align: center; }
    .stat-value { font-size: 24px; font-weight: 800; color: #fff; }
    .stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; margin-top: 4px; }

    .toc { background: #1a1d2e; border: 1px solid #1f2937; border-radius: 12px; padding: 20px; margin: 24px 0; }
    .toc ol { padding-left: 20px; color: #9ca3af; font-size: 14px; }
    .toc li { margin: 4px 0; }
    .toc a { color: #a78bfa; text-decoration: none; }

    .gantt { margin: 16px 0; font-size: 13px; }
    .gantt-row { display: flex; align-items: center; margin: 8px 0; }
    .gantt-label { width: 200px; flex-shrink: 0; color: #d1d5db; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .gantt-bar-container { flex: 1; height: 24px; background: #1f2937; border-radius: 4px; position: relative; margin-left: 8px; }
    .gantt-bar { height: 100%; border-radius: 4px; min-width: 4px; }
    .gantt-bar.high { background: #ef4444; }
    .gantt-bar.medium { background: #a78bfa; }
    .gantt-bar.low { background: #22c55e; }
    .gantt-bar.done { opacity: 0.7; }
    .gantt-dates { display: flex; justify-content: space-between; font-size: 10px; color: #6b7280; margin: 4px 0 0 208px; }

    table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 12px 0; }
    th { text-align: left; padding: 10px 12px; border-bottom: 1px solid #1f2937; color: #9ca3af; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
    td { padding: 10px 12px; border-bottom: 1px solid #111827; color: #d1d5db; }
    tr:hover td { background: #1a1d2e; }

    .wiki-page { background: #1a1d2e; border: 1px solid #1f2937; border-radius: 12px; padding: 24px; margin: 16px 0; page-break-before: always; }
    .wiki-title { font-size: 18px; color: #a78bfa; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #1f2937; }
    .wiki-content { color: #d1d5db; font-size: 14px; line-height: 1.7; }
    .wiki-content p { margin: 8px 0; }
    .wiki-content h1, .wiki-content h2, .wiki-content h3 { color: #e5e7eb; border: none; padding: 0; margin: 16px 0 8px; }
    .wiki-content ul, .wiki-content ol { padding-left: 20px; margin: 8px 0; }
    .wiki-content li { margin: 4px 0; }
    .wiki-content code { background: #1f2937; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
    .wiki-content pre { background: #1f2937; padding: 12px; border-radius: 8px; overflow-x: auto; margin: 12px 0; }
    .wiki-content pre code { background: none; padding: 0; }

    .risk-bar { height: 8px; background: #1f2937; border-radius: 4px; margin: 8px 0; overflow: hidden; }
    .risk-fill { height: 100%; border-radius: 4px; }
    .suggestion { display: flex; gap: 8px; margin: 8px 0; color: #d1d5db; font-size: 13px; }
    .suggestion-icon { color: #a78bfa; flex-shrink: 0; }

    .member-card { display: flex; align-items: center; gap: 12px; padding: 12px; background: #1a1d2e; border: 1px solid #1f2937; border-radius: 8px; margin: 8px 0; }
    .member-avatar { width: 40px; height: 40px; border-radius: 50%; background: #a78bfa; display: flex; align-items: center; justify-content: center; font-weight: 700; color: #fff; font-size: 14px; flex-shrink: 0; }
    .member-name { font-weight: 600; color: #fff; }
    .member-role { font-size: 12px; color: #9ca3af; }

    .wiki-link { display: block; padding: 10px 12px; color: #a78bfa; text-decoration: none; border-bottom: 1px solid #111827; font-size: 14px; }
    .wiki-link:hover { background: #1a1d2e; }

    @media print {
      body { background: #fff; color: #111; }
      .wiki-page { page-break-before: always; background: #fff; border: none; }
      h1, h2, h3 { color: #111; }
      td, th { color: #111; }
      .stat-card { background: #f3f4f6; border-color: #e5e7eb; }
      .stat-value { color: #111; }
      .wiki-content { color: #333; }
    }
  `;
}

function renderToc(data: ExportData): string {
  let html = '<div class="toc"><h3>Table of Contents</h3><ol>';
  let num = 1;

  if (data.project) html += `<li><a href="#overview">${num++}. Project Overview</a></li>`;
  if (data.tasks.length > 0) html += `<li><a href="#tasks">${num++}. Tasks (${data.tasks.length})</a></li>`;
  if (data.milestones.length > 0) html += `<li><a href="#milestones">${num++}. Milestones (${data.milestones.length})</a></li>`;
  if (data.members.length > 0) html += `<li><a href="#team">${num++}. Team (${data.members.length})</a></li>`;
  if (data.risk) html += `<li><a href="#risk">${num++}. Risk Assessment</a></li>`;
  if (data.conflicts.length > 0) html += `<li><a href="#conflicts">${num++}. Conflicts (${data.conflicts.length})</a></li>`;
  if (data.wiki_pages.length > 0) {
    html += `<li><a href="#wiki">${num++}. Related Wiki Pages (${data.wiki_pages.length})</a></li>`;
    html += '<ol style="list-style-type: none; padding-left: 16px;">';
    data.wiki_pages.forEach((wp) => {
      html += `<li><a href="#wiki-${wp.id}">${num++}. ${escapeHtml(wp.title)}</a></li>`;
    });
    html += '</ol>';
  }
  if (data.changesets.length > 0) html += `<li><a href="#changes">${num++}. Change History (${data.changesets.length})</a></li>`;

  html += '</ol></div>';
  return html;
}

function renderGantt(data: ExportData): string {
  const allDated = data.tasks.filter((t) => t.start_date && t.end_date);
  if (allDated.length === 0) return "";

  const allStarts = allDated.map((t) => new Date(t.start_date!).getTime());
  const allEnds = allDated.map((t) => new Date(t.end_date!).getTime());
  const minDate = new Date(Math.min(...allStarts));
  const maxDate = new Date(Math.max(...allEnds));
  const totalDays = Math.max(1, (maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));

  let html = '<h2 id="gantt">Project Timeline</h2><div class="gantt">';

  allDated.forEach((t) => {
    const start = new Date(t.start_date!).getTime();
    const end = new Date(t.end_date!).getTime();
    const left = ((start - minDate.getTime()) / (1000 * 60 * 60 * 24)) / totalDays * 100;
    const width = Math.max(2, ((end - start) / (1000 * 60 * 60 * 24)) / totalDays * 100);
    const doneClass = t.status === "done" || t.status === "completed" ? "done" : "";
    const prioClass = t.priority?.toLowerCase() || "medium";

    html += `<div class="gantt-row">
      <div class="gantt-label" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</div>
      <div class="gantt-bar-container">
        <div class="gantt-bar ${prioClass} ${doneClass}" style="margin-left:${left}%;width:${width}%"></div>
      </div>
    </div>`;
  });

  html += `<div class="gantt-dates">
    <span>${formatDate(minDate.toISOString())}</span>
    <span>${formatDate(maxDate.toISOString())}</span>
  </div>`;
  html += '</div>';
  return html;
}

function renderTasks(data: ExportData): string {
  if (data.tasks.length === 0) return "";
  let html = '<h2 id="tasks">Tasks</h2><table><thead><tr>';
  html += '<th>#</th><th>Title</th><th>Status</th><th>Priority</th><th>Assignee</th><th>Dates</th>';
  if (data.tasks.some((t) => t.parent_task_title)) html += '<th>Parent</th>';
  html += '</tr></thead><tbody>';

  data.tasks.forEach((t, i) => {
    html += '<tr>';
    html += `<td>${i + 1}</td>`;
    html += `<td>${escapeHtml(t.title)}${t.description ? `<br><small style="color:#6b7280">${escapeHtml(t.description.substring(0, 100))}</small>` : ""}</td>`;
    html += `<td>${escapeHtml(t.status)}</td>`;
    html += `<td style="color:${priorityColor(t.priority)}">${escapeHtml(t.priority)}</td>`;
    html += `<td>${escapeHtml(t.assignee_name || t.assignee_email || "-")}</td>`;
    html += `<td>${formatDate(t.start_date)} → ${formatDate(t.end_date)}</td>`;
    if (data.tasks.some((x) => x.parent_task_title)) {
      html += `<td>${escapeHtml(t.parent_task_title || "-")}</td>`;
    }
    html += '</tr>';
  });

  html += '</tbody></table>';
  return html;
}

function renderMilestones(data: ExportData): string {
  if (data.milestones.length === 0) return "";
  let html = '<h2 id="milestones">Milestones</h2><div>';
  data.milestones.forEach((m) => {
    const isReached = m.status === "reached" || m.status === "completed";
    html += `<div style="display:flex;align-items:center;gap:12px;padding:12px;background:#1a1d2e;border:1px solid ${isReached ? '#22c55e' : '#1f2937'};border-radius:8px;margin:8px 0">
      <div style="width:12px;height:12px;border-radius:50%;background:${isReached ? '#22c55e' : '#a78bfa'};flex-shrink:0"></div>
      <div>
        <div style="font-weight:600">${escapeHtml(m.title)}</div>
        <div style="font-size:12px;color:#6b7280">${formatDate(m.target_date)} · ${escapeHtml(m.status || "pending")}${m.description ? ` · ${escapeHtml(m.description.substring(0, 80))}` : ""}</div>
      </div>
    </div>`;
  });
  html += '</div>';
  return html;
}

function renderTeam(data: ExportData): string {
  if (data.members.length === 0) return "";
  let html = '<h2 id="team">Team</h2><div>';
  data.members.forEach((m) => {
    const initials = (m.name || m.email || "?").substring(0, 2).toUpperCase();
    html += `<div class="member-card">
      <div class="member-avatar">${initials}</div>
      <div>
        <div class="member-name">${escapeHtml(m.name || m.email)}</div>
        <div class="member-role">${escapeHtml(m.role)} · Joined ${formatDate(m.joined_at)}</div>
      </div>
    </div>`;
  });
  html += '</div>';
  return html;
}

function renderRisk(data: ExportData): string {
  if (!data.risk) return "";
  const score = data.risk.score;
  let html = `<h2 id="risk">Risk Assessment</h2>`;
  html += `<div style="background:#1a1d2e;border:1px solid #1f2937;border-radius:12px;padding:20px;margin:12px 0">`;
  html += `<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span>Score</span><span style="color:${riskColor(score)};font-weight:700;font-size:18px">${score}/100</span></div>`;
  html += `<div class="risk-bar"><div class="risk-fill" style="width:${score}%;background:${riskColor(score)}"></div></div>`;

  if (data.risk.factors.length > 0) {
    html += `<h3>Risk Factors</h3>`;
    data.risk.factors.forEach((f) => {
      html += `<div class="suggestion"><span class="suggestion-icon">⚠</span>${escapeHtml(f)}</div>`;
    });
  }

  if (data.risk.suggestions.length > 0) {
    html += `<h3>Mitigations</h3>`;
    data.risk.suggestions.forEach((s) => {
      html += `<div class="suggestion"><span class="suggestion-icon">✓</span>${escapeHtml(s)}</div>`;
    });
  }

  html += '</div>';
  return html;
}

function renderConflicts(data: ExportData): string {
  if (data.conflicts.length === 0) return "";
  let html = '<h2 id="conflicts">Conflicts</h2>';
  data.conflicts.forEach((c) => {
    html += `<div style="padding:12px;background:#1a1d2e;border:1px solid ${c.severity === 'high' ? '#ef4444' : '#f59e0b'};border-radius:8px;margin:8px 0">
      <div style="font-weight:600">${escapeHtml(c.title)}</div>
      <div style="font-size:12px;color:#6b7280">${escapeHtml(c.severity || 'medium')} · ${escapeHtml(c.description || '')}${c.assignee_name ? ` · ${escapeHtml(c.assignee_name)}` : ''}${c.start_date ? ` · ${formatDate(c.start_date)} → ${formatDate(c.end_date)}` : ''}</div>
    </div>`;
  });
  return html;
}

function renderWikiPages(data: ExportData): string {
  if (data.wiki_pages.length === 0) return "";
  let html = '<h2 id="wiki">Related Wiki Pages</h2>';

  data.wiki_pages.forEach((wp) => {
    html += `<div class="wiki-page" id="wiki-${wp.id}">`;
    html += `<div class="wiki-title">${escapeHtml(wp.title)}`;
    if (wp.updated_at) html += `<span style="font-size:12px;color:#6b7280;font-weight:400"> · Updated ${formatDate(wp.updated_at)}</span>`;
    html += '</div>';

    // Simple markdown-to-HTML rendering for wiki content
    const content = wp.content || "";
    const paragraphs = content.split(/\n\n+/);
    paragraphs.forEach((p) => {
      const trimmed = p.trim();
      if (!trimmed) return;

      if (trimmed.startsWith("# ")) {
        html += `<h1>${escapeHtml(trimmed.substring(2))}</h1>`;
      } else if (trimmed.startsWith("## ")) {
        html += `<h2>${escapeHtml(trimmed.substring(3))}</h2>`;
      } else if (trimmed.startsWith("### ")) {
        html += `<h3>${escapeHtml(trimmed.substring(4))}</h3>`;
      } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        const items = trimmed.split(/\n/).filter((l) => l.trim().startsWith("- ") || l.trim().startsWith("* "));
        html += '<ul>';
        items.forEach((item) => {
          html += `<li>${escapeHtml(item.replace(/^[-*]\s+/, ""))}</li>`;
        });
        html += '</ul>';
      } else if (/^\d+\./.test(trimmed)) {
        const items = trimmed.split(/\n/).filter((l) => /^\d+\./.test(l.trim()));
        html += '<ol>';
        items.forEach((item) => {
          html += `<li>${escapeHtml(item.replace(/^\d+\.\s+/, ""))}</li>`;
        });
        html += '</ol>';
      } else {
        html += `<p>${escapeHtml(trimmed)}</p>`;
      }
    });

    html += '</div>';
  });

  return html;
}

function renderChanges(data: ExportData): string {
  if (data.changesets.length === 0) return "";
  let html = '<h2 id="changes">Change History</h2>';
  data.changesets.forEach((cs) => {
    const mutCount = cs.mutations?.length || 0;
    html += `<div style="padding:12px;background:#1a1d2e;border:1px solid #1f2937;border-radius:8px;margin:8px 0">
      <div style="display:flex;justify-content:space-between">
        <span style="font-weight:600;color:${cs.status === 'approved' ? '#22c55e' : '#f59e0b'}">${escapeHtml(cs.status)}</span>
        <span style="font-size:12px;color:#6b7280">${formatDate(cs.created_at)}</span>
      </div>
      <div style="font-size:12px;color:#6b7280">${mutCount} mutations</div>
    </div>`;
  });
  return html;
}

export function exportToHtml(data: ExportData, _options: ExportOptions): string {
  const toc = _options.includeToc ? renderToc(data) : "";
  const overview = `
    <h1 id="overview">${escapeHtml(data.project.name)}</h1>
    <div class="meta">
      Status: ${escapeHtml(data.project.status)} · Created: ${formatDate(data.project.created_at)} · Exported: ${new Date().toLocaleDateString()}
    </div>
    <div class="stats">
      <div class="stat-card"><div class="stat-value">${data.project.task_count}</div><div class="stat-label">Tasks</div></div>
      <div class="stat-card"><div class="stat-value">${data.project.milestone_count}</div><div class="stat-label">Milestones</div></div>
      <div class="stat-card"><div class="stat-value">${data.project.completed_task_count}</div><div class="stat-label">Completed</div></div>
      <div class="stat-card"><div class="stat-value">${data.risk?.score ?? "-"}</div><div class="stat-label">Risk Score</div></div>
      <div class="stat-card"><div class="stat-value">${data.members.length}</div><div class="stat-label">Members</div></div>
    </div>
    ${data.project.description ? `<p style="color:#9ca3af;margin:16px 0">${escapeHtml(data.project.description)}</p>` : ""}
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(data.project.name)} — Project Report</title>
  <style>${buildStyle()}</style>
</head>
<body>
  ${overview}
  ${toc}
  ${renderGantt(data)}
  ${renderTasks(data)}
  ${renderMilestones(data)}
  ${renderTeam(data)}
  ${renderRisk(data)}
  ${renderConflicts(data)}
  ${renderWikiPages(data)}
  ${renderChanges(data)}
</body>
</html>`;
}
