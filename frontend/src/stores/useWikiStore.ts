import { create } from "zustand";

interface WikiState {
  currentTeamId: string | null;
  setCurrentTeamId: (id: string | null) => void;
  
  wikiSidebarOpen: boolean;
  setWikiSidebarOpen: (open: boolean) => void;
}

export const useWikiStore = create<WikiState>((set) => ({
  currentTeamId: null,
  setCurrentTeamId: (id) => set({ currentTeamId: id }),
  
  wikiSidebarOpen: false,
  setWikiSidebarOpen: (open) => set({ wikiSidebarOpen: open }),
}));
