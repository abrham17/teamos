import { useEffect, useRef, useState } from "react";
import cytoscape from "cytoscape";
import { PlanProjectDetail, PlanTask } from "../types";
import { Maximize2, Minimize2, ZoomIn, ZoomOut, Link as LinkIcon, Loader2, RefreshCw } from "lucide-react";
import { updatePlanTask } from "../api";
import { useWikiStore } from "@/stores/useWikiStore";

interface DependencyGraphProps {
  project: PlanProjectDetail;
  onRefresh: () => void;
}

export function DependencyGraph({ project, onRefresh }: DependencyGraphProps) {
  const { currentTeamId } = useWikiStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [linkMode, setLinkMode] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const elements: cytoscape.ElementDefinition[] = [];

    // Add nodes
    project.tasks.forEach((t) => {
      elements.push({
        data: {
          id: t.id,
          label: t.title,
          status: t.status,
          priority: t.priority,
        },
      });

      // Add edges
      t.dependencies?.forEach((depId) => {
        elements.push({
          data: {
            id: `e-${depId}-${t.id}`,
            source: depId,
            target: t.id,
          },
        });
      });
    });

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            "background-color": (ele) => {
              const status = ele.data("status");
              if (status === "completed") return "#10b981"; // success
              if (status === "in-progress") return "#6366f1"; // accent
              if (status === "blocked") return "#f43f5e"; // danger
              return "#374151"; // surface-3
            },
            color: "#f9fafb",
            "text-valign": "bottom",
            "text-margin-y": 8,
            "font-size": "12px",
            "font-family": "Inter, sans-serif",
            "text-wrap": "wrap",
            "text-max-width": "120px",
            width: (ele) => (ele.data("priority") === "high" ? 40 : 30),
            height: (ele) => (ele.data("priority") === "high" ? 40 : 30),
          },
        },
        {
          selector: "edge",
          style: {
            width: 2,
            "line-color": "#4b5563",
            "target-arrow-color": "#4b5563",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
          },
        },
      ],
      layout: {
        name: "breadthfirst",
        directed: true,
        padding: 50,
        spacingFactor: 1.2,
      },
      minZoom: 0.2,
      maxZoom: 3,
    });

    cy.on("tap", "node", async (evt) => {
      if (!linkMode || !currentTeamId) return;
      const node = evt.target;
      const id = node.id();

      if (!selectedNodeId) {
        setSelectedNodeId(id);
        node.style("border-width", 4);
        node.style("border-color", "#6366f1");
      } else {
        if (id !== selectedNodeId) {
          // Create link selectedNodeId -> id
          setUpdating(true);
          try {
            const targetTask = project.tasks.find(t => t.id === id);
            if (targetTask) {
              const currentDeps = targetTask.dependencies || [];
              if (!currentDeps.includes(selectedNodeId)) {
                await updatePlanTask(currentTeamId, project.id, id, {
                  dependency_ids: [...currentDeps, selectedNodeId]
                });
                onRefresh();
              }
            }
          } catch (e) {
            console.error("Failed to add dependency", e);
          } finally {
            setUpdating(false);
            setLinkMode(false);
            setSelectedNodeId(null);
          }
        } else {
          // Deselect
          node.style("border-width", 0);
          setSelectedNodeId(null);
        }
      }
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
    };
  }, [project, linkMode, selectedNodeId, currentTeamId, onRefresh]);

  return (
    <div className={`flex flex-col bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden ${isFullscreen ? "fixed inset-4 z-50 shadow-2xl" : "h-[600px] w-full"}`}>
      <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)] bg-[var(--bg-900)]">
        <div>
          <h3 className="font-bold text-[var(--text-primary)]">Dependency Graph</h3>
          <p className="text-xs text-[var(--text-muted)]">Visualizing task relationships</p>
        </div>
        <div className="flex items-center gap-2">
          {updating && <Loader2 className="w-4 h-4 text-[var(--accent)] animate-spin mr-2" />}
          
          <button 
            onClick={() => {
              setLinkMode(!linkMode);
              setSelectedNodeId(null);
            }} 
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase tracking-widest rounded-lg transition-all ${
              linkMode ? "bg-[var(--accent)] text-white" : "hover:bg-[var(--surface-2)] text-[var(--text-muted)]"
            }`}
          >
            <LinkIcon className="w-3.5 h-3.5" />
            {linkMode ? (selectedNodeId ? "Select Target..." : "Select Source...") : "Add Link"}
          </button>
          <div className="w-px h-6 bg-[var(--border-subtle)] mx-2" />
          
          <button onClick={() => cyRef.current?.zoom(cyRef.current.zoom() + 0.2)} className="p-2 hover:bg-[var(--surface-2)] rounded-lg text-[var(--text-muted)]">
            <ZoomIn className="w-4 h-4" />
          </button>
          <button onClick={() => cyRef.current?.zoom(cyRef.current.zoom() - 0.2)} className="p-2 hover:bg-[var(--surface-2)] rounded-lg text-[var(--text-muted)]">
            <ZoomOut className="w-4 h-4" />
          </button>
          <button onClick={() => cyRef.current?.fit()} className="px-3 py-1 text-xs font-bold uppercase tracking-widest hover:bg-[var(--surface-2)] rounded-lg text-[var(--text-muted)]">
            Fit
          </button>
          <div className="w-px h-6 bg-[var(--border-subtle)] mx-2" />
          <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-2 hover:bg-[var(--surface-2)] rounded-lg text-[var(--text-muted)]">
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
      <div ref={containerRef} className="flex-1 bg-[var(--bg-950)]" />
    </div>
  );
}
