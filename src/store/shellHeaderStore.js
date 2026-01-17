import { create } from "zustand";

export const useShellHeaderStore = create((set) => ({
  title: null,
  status: null,
  setTitle: (title) => set({ title }),
  clearTitle: () => set({ title: null }),
  setStatus: (status) => set({ status }),
  clearStatus: () => set({ status: null }),
}));
