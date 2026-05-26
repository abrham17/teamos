import type { ExportData, ExportFormat, ExportOptions, WikiPageExport, ConflictExport, ChangesetExport, RiskExport } from "./types";
import { exportToHtml } from "./html";
import { exportToMarkdown } from "./markdown";
import { exportToJson } from "./json";
import { exportToIcs } from "./ics";
import { getApiAuthHeaders } from "@/lib/api";
import type { PlanProjectDetail } from "../../types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

function getMimeType(format: ExportFormat): string {
  switch (format) {
    case "html": return "text/html";
    case "markdown": return "text/markdown";
    case "json": return "application/json";
    case "ics": return "text/calendar";
  }
}

function getExtension(format: ExportFormat): string {
  switch (format) {
    case "html": return ".html";
    case "markdown": return ".md";
    case "json": return ".json";
    case "ics": return ".ics";
  }
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function fetchWikiPageContent(teamId: string, pageId: string): Promise<WikiPageExport> {
  const auth = await getApiAuthHeaders();
  const res = await fetch(`${API_BASE}/wiki/${teamId}/pages/${pageId}/`, {
    headers: { ...auth },
  });
  if (!res.ok) {
    return { id: pageId, title: "Unknown Page", slug: "", content: "" };
  }
  const data = await res.json();
  return {
    id: data.id || pageId,
    title: data.title || "Unknown Page",
    slug: data.slug || "",
    content: data.content || "",
    created_at: data.created_at,
    updated_at: data.updated_at,
    created_by_name: data.created_by_name || data.created_by?.display_name,
  };
}

async function fetchConflicts(teamId: string, projectId: string): Promise<ConflictExport[]> {
  try {
    const auth = await getApiAuthHeaders();
    const res = await fetch(`${API_BASE}/planning/${teamId}/projects/${projectId}/conflicts/`, {
      headers: { ...auth },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const conflicts = data.conflicts || data.data || data || [];
    if (!Array.isArray(conflicts)) return [];
    return conflicts.map((c: Record<string, unknown>) => ({
      title: String(c.title || c.task_title || ""),
      description: String(c.description || c.conflict_description || ""),
      severity: String(c.severity || "medium"),
      assignee_name: c.assignee_name ? String(c.assignee_name) : undefined,
      start_date: c.start_date ? String(c.start_date) : undefined,
      end_date: c.end_date ? String(c.end_date) : undefined,
    }));
  } catch {
    return [];
  }
}

async function fetchRisk(teamId: string, projectId: string): Promise<RiskExport | null> {
  try {
    const auth = await getApiAuthHeaders();
    const res = await fetch(`${API_BASE}/planning/${teamId}/projects/${projectId}/risk/`, {
      headers: { ...auth },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const risk = data.risk || data;
    return {
      score: Number(risk.score || risk.risk_score || 0),
      factors: Array.isArray(risk.factors) ? risk.factors.map(String) : [],
      suggestions: Array.isArray(risk.suggestions) ? risk.suggestions.map(String) : [],
    };
  } catch {
    return null;
  }
}

async function fetchChangesets(teamId: string, projectId: string): Promise<ChangesetExport[]> {
  try {
    const auth = await getApiAuthHeaders();
    const res = await fetch(`${API_BASE}/planning/${teamId}/projects/${projectId}/changesets/`, {
      headers: { ...auth },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const sets = data.changesets || data.data || data || [];
    if (!Array.isArray(sets)) return [];
    return sets.slice(0, 10).map((cs: Record<string, unknown>) => ({
      id: String(cs.id || ""),
      status: String(cs.status || "pending"),
      created_at: String(cs.created_at || ""),
      mutations: Array.isArray(cs.mutations) ? cs.mutations : (Array.isArray(cs.pending_mutations) ? cs.pending_mutations : []),
      impact_summary: cs.impact_summary as Record<string, unknown> | undefined,
    }));
  } catch {
    return [];
  }
}

export async function buildExportData(
  teamId: string,
  project: PlanProjectDetail,
): Promise<ExportData> {
  const tasks = project.tasks.map((t) => ({
    id: String(t.id),
    title: t.title,
    description: t.description || "",
    status: t.status || "todo",
    priority: t.priority || "medium",
    assignee_name: (t as unknown as Record<string, unknown>).assignee_name as string | undefined || (t as unknown as Record<string, unknown>).assignee_email as string | undefined,
    assignee_email: (t as unknown as Record<string, unknown>).assignee_email as string | undefined,
    start_date: t.start_date ?? undefined,
    end_date: t.end_date ?? undefined,
    parent_task_title: (t as unknown as Record<string, unknown>).parent_task_title as string | undefined,
    dependency_titles: Array.isArray((t as unknown as Record<string, unknown>).dependency_titles) ? (t as unknown as Record<string, unknown>).dependency_titles as string[] : undefined,
    order_index: (t as unknown as Record<string, unknown>).order_index as number ?? 0,
  }));

  const milestones = project.milestones.map((m) => ({
    id: String(m.id),
    title: m.title,
    description: (m as unknown as Record<string, unknown>).description as string || "",
    target_date: (m as unknown as Record<string, unknown>).target_date as string | undefined,
    status: (m as unknown as Record<string, unknown>).status as string || "pending",
    order_index: (m as unknown as Record<string, unknown>).order_index as number ?? 0,
  }));

  const members = (project.members || []).map((m) => ({
    user_id: (m as unknown as Record<string, unknown>).user_id as string || (m as unknown as Record<string, unknown>).id as string || "",
    name: (m as unknown as Record<string, unknown>).name as string || (m as unknown as Record<string, unknown>).display_name as string || "",
    email: (m as unknown as Record<string, unknown>).email as string || "",
    role: (m as unknown as Record<string, unknown>).role as string || "Contributor",
    joined_at: (m as unknown as Record<string, unknown>).joined_at as string || (m as unknown as Record<string, unknown>).created_at as string || "",
  }));

  const dependencies: ExportData["dependencies"] = [];
  tasks.forEach((t) => {
    (project.tasks as unknown as Array<Record<string, unknown>>).forEach((pt) => {
      const deps = pt.dependencies as Array<{ id: string; title: string }> | undefined;
      if (deps && pt.id === t.id) {
        deps.forEach((d) => {
          dependencies.push({
            from_task_id: d.id,
            from_title: d.title,
            to_task_id: String(t.id),
            to_title: t.title,
          });
        });
      }
    });
  });

  const wikiPageIds: string[] = [];
  const relatedWikiRefs = (project as unknown as Record<string, unknown>).related_wiki_pages as Array<{ id: string; title: string }> | undefined;
  if (relatedWikiRefs) {
    relatedWikiRefs.forEach((ref) => {
      if (ref.id) wikiPageIds.push(ref.id);
    });
  }

  const wikiPages: WikiPageExport[] = [];
  for (const pageId of wikiPageIds.slice(0, 20)) {
    const wp = await fetchWikiPageContent(teamId, pageId);
    wikiPages.push(wp);
  }

  return {
    project: {
      id: String(project.id),
      name: project.name,
      description: project.description || "",
      status: project.status || "active",
      created_at: (project as unknown as Record<string, unknown>).created_at as string || "",
      updated_at: (project as unknown as Record<string, unknown>).updated_at as string || "",
      task_count: tasks.length,
      completed_task_count: tasks.filter((t) => t.status === "completed").length,
      milestone_count: milestones.length,
      reached_milestone_count: milestones.filter((m) => m.status === "reached" || m.status === "completed").length,
    },
    tasks,
    milestones,
    members,
    wiki_pages: wikiPages,
    risk: await fetchRisk(teamId, String(project.id)),
    conflicts: await fetchConflicts(teamId, String(project.id)),
    changesets: await fetchChangesets(teamId, String(project.id)),
    dependencies,
  };
}

export function downloadExport(
  content: string,
  projectName: string,
  format: ExportFormat,
): void {
  const filename = `${slugify(projectName)}-export${getExtension(format)}`;
  const mimeType = getMimeType(format);
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function handleExport(
  teamId: string,
  project: PlanProjectDetail,
  format: ExportFormat,
  options: Partial<ExportOptions> = {},
): Promise<void> {
  const data = await buildExportData(teamId, project);
  const opts: ExportOptions = {
    format,
    includeWikiContent: options.includeWikiContent ?? true,
    includeToc: options.includeToc ?? true,
    projectName: project.name,
  };

  let content: string;
  switch (format) {
    case "html":
      content = exportToHtml(data, opts);
      break;
    case "markdown":
      content = exportToMarkdown(data, opts);
      break;
    case "json":
      content = exportToJson(data, opts);
      break;
    case "ics":
      content = exportToIcs(data, opts);
      break;
  }

  downloadExport(content, project.name, format);
}
