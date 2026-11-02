import { create } from "zustand";
import { authApi } from "@/lib/api";
import type { CurrentUser } from "@/lib/types";

interface AuthState {
  user: CurrentUser | null;
  loading: boolean;
  initialized: boolean;
  login: (username: string, password: string) => Promise<CurrentUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (user: CurrentUser | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  initialized: false,
  login: async (username, password) => {
    set({ loading: true });
    try {
      const user = await authApi.login(username, password);
      set({ user, loading: false });
      return user;
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },
  logout: async () => {
    try {
      await authApi.logout();
    } finally {
      set({ user: null });
    }
  },
  refresh: async () => {
    try {
      const user = await authApi.currentUser();
      set({ user, initialized: true });
    } catch {
      set({ user: null, initialized: true });
    }
  },
  setUser: (user) => set({ user }),
}));
