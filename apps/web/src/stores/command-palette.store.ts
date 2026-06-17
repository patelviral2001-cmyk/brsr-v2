import { create } from "zustand";

interface CommandPaletteState {
  open: boolean;
  query: string;
  toggle: () => void;
  setOpen: (v: boolean) => void;
  setQuery: (q: string) => void;
}

export const useCommandPaletteStore = create<CommandPaletteState>((set) => ({
  open: false,
  query: "",
  toggle: () => set((s) => ({ open: !s.open })),
  setOpen: (v) => set({ open: v }),
  setQuery: (q) => set({ query: q }),
}));
