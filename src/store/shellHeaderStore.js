import { create } from "zustand";

export const useShellHeaderStore = create((set) => ({
  title: null,
  setTitle: (title) => set({ title }),
  clearTitle: () => set({ title: null }),
}));
