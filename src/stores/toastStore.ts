import { create } from "zustand";

export type ToastType = "info" | "success" | "warning" | "error";

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number; // ms, default 4000
}

interface ToastState {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => string;
  removeToast: (id: string) => void;
  clearAll: () => void;
}

let nextId = 0;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  addToast: (toast) => {
    const id = `toast-${++nextId}`;
    const duration = toast.duration ?? 4000;
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));

    if (duration > 0) {
      setTimeout(() => get().removeToast(id), duration);
    }
    return id;
  },

  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  clearAll: () => set({ toasts: [] }),
}));

// Convenience shortcuts
export const toast = {
  info: (message: string, duration?: number) =>
    useToastStore.getState().addToast({ type: "info", message, duration }),
  success: (message: string, duration?: number) =>
    useToastStore.getState().addToast({ type: "success", message, duration }),
  warning: (message: string, duration?: number) =>
    useToastStore.getState().addToast({ type: "warning", message, duration }),
  error: (message: string, duration?: number) =>
    useToastStore.getState().addToast({ type: "error", message, duration }),
};
