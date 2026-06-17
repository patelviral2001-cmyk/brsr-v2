import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AppState {
  sidebarCollapsed: boolean;
  theme: "light" | "dark" | "system";
  rightDrawerOpen: boolean;
  rightDrawerContent: { type: string; id: string } | null;
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;
  setTheme: (t: "light" | "dark" | "system") => void;
  openRightDrawer: (type: string, id: string) => void;
  closeRightDrawer: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      theme: "light",
      rightDrawerOpen: false,
      rightDrawerContent: null,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      setTheme: (t) => set({ theme: t }),
      openRightDrawer: (type, id) => set({ rightDrawerOpen: true, rightDrawerContent: { type, id } }),
      closeRightDrawer: () => set({ rightDrawerOpen: false, rightDrawerContent: null }),
    }),
    { name: "brsr-app-store", partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed, theme: s.theme }) }
  )
);
