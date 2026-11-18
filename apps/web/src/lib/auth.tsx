"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, tokenStore } from "./api";
import type { User } from "./types";

type Ctx = {
  user: User | null; loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>; logout: () => void;
  updateName: (name: string) => Promise<void>;
  setSession: (token: string, user: User) => void; // used after a password reset
  markVerified: () => void;
  /** Run `then` now if signed in; otherwise open the sign-in popover and run it after login. */
  requireAuth: (then?: () => void) => boolean;
  signInOpen: boolean; setSignInOpen: (v: boolean) => void;
};
const AuthCtx = createContext<Ctx>(null!);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signInOpen, setSignInOpen] = useState(false);
  const pending = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!tokenStore.get()) return setLoading(false);
    api<User>("/auth/me").then(setUser).catch(() => tokenStore.clear()).finally(() => setLoading(false));
  }, []);

  const finish = (r: { token: string; user: User }) => {
    tokenStore.set(r.token);
    setUser(r.user);
    setSignInOpen(false);
    const cb = pending.current; pending.current = null;
    if (cb) setTimeout(cb, 0);
  };
  const login = async (email: string, password: string) =>
    finish(await api<{ token: string; user: User }>("/auth/login", { method: "POST", json: { email, password } }));
  const register = async (name: string, email: string, password: string) =>
    finish(await api<{ token: string; user: User }>("/auth/register", { method: "POST", json: { name, email, password } }));
  const setSession = (token: string, u: User) => { tokenStore.set(token); setUser(u); };
  const markVerified = () => setUser((u) => (u ? { ...u, emailVerified: true } : u));
  const updateName = async (name: string) => setUser(await api<User>("/auth/me", { method: "PATCH", json: { name } }));
  const logout = () => { tokenStore.clear(); setUser(null); pending.current = null; };

  const requireAuth = useCallback((then?: () => void) => {
    if (user) { then?.(); return true; }
    pending.current = then ?? null;
    setSignInOpen(true);
    return false;
  }, [user]);

  return <AuthCtx.Provider value={{ user, loading, login, register, logout, updateName, setSession, markVerified, requireAuth, signInOpen, setSignInOpen }}>{children}</AuthCtx.Provider>;
}
