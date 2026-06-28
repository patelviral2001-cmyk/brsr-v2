import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ScopeBreadcrumb {
  id: string;
  name: string;
  type: string;
}

interface ScopeState {
  activeScopeId: string;
  activeScopeName: string;
  breadcrumb: ScopeBreadcrumb[];
  fy: string;
  setScope: (id: string, name: string, breadcrumb: ScopeBreadcrumb[]) => void;
  setFY: (fy: string) => void;
}

export const useScopeStore = create<ScopeState>()(
  persist(
    (set) => ({
      activeScopeId: "node_root",
      activeScopeName: "Imagine Powertree Group",
      breadcrumb: [{ id: "node_root", name: "Imagine Powertree Group", type: "GROUP" }],
      fy: "FY24-25",
      setScope: (id, name, breadcrumb) =>
        set({ activeScopeId: id, activeScopeName: name, breadcrumb }),
      setFY: (fy) => set({ fy }),
    }),
    { name: "brsr-scope-store" }
  )
);
