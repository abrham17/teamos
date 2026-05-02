"use client";

import { useEffect, useMemo, useState } from "react";
import { getPlanProject, listPlanProjects } from "../api";
import type { PlanProjectDetail, PlanProjectListItem } from "../types";

export function usePlannerData(
  teamId: string | null,
  query: string,
  preferredProjectId?: string | null,
) {
  const [projects, setProjects] = useState<PlanProjectListItem[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeProject, setActiveProject] = useState<PlanProjectDetail | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingProjectDetail, setLoadingProjectDetail] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [detailRefreshKey, setDetailRefreshKey] = useState(0);

  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    setLoadingProjects(true);
    setError("");

    listPlanProjects(teamId, query)
      .then((data) => {
        if (cancelled) return;
        setProjects(data);
        if (!data.length) {
          setActiveProjectId(null);
          setActiveProject(null);
          return;
        }
        setActiveProjectId((prev) => {
          if (preferredProjectId && data.some((p) => p.id === preferredProjectId)) {
            return preferredProjectId;
          }
          return prev && data.some((p) => p.id === prev) ? prev : data[0].id;
        });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : "Failed to load planning projects.";
        setError(message);
      })
      .finally(() => {
        if (!cancelled) setLoadingProjects(false);
      });

    return () => {
      cancelled = true;
    };
  }, [teamId, query, preferredProjectId, refreshKey]);

  useEffect(() => {
    if (!teamId || !activeProjectId) {
      setActiveProject(null);
      return;
    }
    let cancelled = false;
    setLoadingProjectDetail(true);
    getPlanProject(teamId, activeProjectId)
      .then((data) => {
        if (!cancelled) setActiveProject(data);
      })
      .catch(() => {
        if (!cancelled) setActiveProject(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingProjectDetail(false);
      });

    return () => {
      cancelled = true;
    };
  }, [teamId, activeProjectId, detailRefreshKey]);

  const totalTasks = useMemo(() => projects.reduce((acc, p) => acc + p.task_count, 0), [projects]);

  const refreshProjects = () => setRefreshKey((k) => k + 1);
  const refreshProjectDetail = () => setDetailRefreshKey((k) => k + 1);

  return {
    projects,
    activeProject,
    activeProjectId,
    setActiveProjectId,
    loadingProjects,
    loadingProjectDetail,
    error,
    totalTasks,
    refreshProjects,
    refreshProjectDetail,
  };
}
