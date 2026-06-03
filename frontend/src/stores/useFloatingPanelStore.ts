import { create } from "zustand";
import { persist } from "zustand/middleware";

export type FloatingPanelType = "wiki" | "plan" | "chat" | "task" | "ingest";

export interface FloatingPanel {
  id: string;
  type: FloatingPanelType;
  title: string;
  url: string; // the route to render inside the panel
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  zIndex: number;
}

interface FloatingPanelState {
  panels: FloatingPanel[];
  topZ: number;
  openPanel: (panel: Omit<FloatingPanel, "id" | "zIndex">) => void;
  closePanel: (id: string) => void;
  updatePanel: (id: string, patch: Partial<FloatingPanel>) => void;
  bringToFront: (id: string) => void;
  minimizePanel: (id: string) => void;
  clearAll: () => void;
}

export const useFloatingPanelStore = create<FloatingPanelState>()(
  persist(
    (set, get) => ({
      panels: [],
      topZ: 800,

      openPanel: (panelInput) => {
        const { panels, topZ } = get();
        const id = `fp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const newZ = topZ + 1;
        // Cascade offset so panels don't stack exactly
        const offset = (panels.length % 5) * 28;
        const newPanel: FloatingPanel = {
          ...panelInput,
          id,
          zIndex: newZ,
          x: panelInput.x + offset,
          y: panelInput.y + offset,
        };
        set({ panels: [...panels, newPanel], topZ: newZ });
      },

      closePanel: (id) => {
        set((s) => ({ panels: s.panels.filter((p) => p.id !== id) }));
      },

      updatePanel: (id, patch) => {
        set((s) => ({
          panels: s.panels.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        }));
      },

      bringToFront: (id) => {
        const newZ = get().topZ + 1;
        set((s) => ({
          panels: s.panels.map((p) =>
            p.id === id ? { ...p, zIndex: newZ } : p
          ),
          topZ: newZ,
        }));
      },

      minimizePanel: (id) => {
        set((s) => ({
          panels: s.panels.map((p) =>
            p.id === id ? { ...p, minimized: !p.minimized } : p
          ),
        }));
      },

      clearAll: () => set({ panels: [] }),
    }),
    {
      name: "teamos-floating-panels",
      partialize: (state) => ({ panels: state.panels, topZ: state.topZ }),
    }
  )
);
