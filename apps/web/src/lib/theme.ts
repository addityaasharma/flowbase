"use client";
import { useCallback, useEffect, useState } from "react";

export type ThemeChoice = "auto" | "light" | "dark";
const KEY = "flowbase:theme";
const prefersDark = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;
const read = (): ThemeChoice => { try { const v = localStorage.getItem(KEY); return v === "light" || v === "dark" ? v : "auto"; } catch { return "auto"; } };
const apply = (c: ThemeChoice) => { document.documentElement.dataset.theme = c === "dark" || (c === "auto" && prefersDark()) ? "dark" : "light"; };

/** Light / dark / follow-the-device. The first paint is handled by the inline script in the root layout. */
export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>("auto");
  const [dark, setDark] = useState(false);
  useEffect(() => { const c = read(); setChoice(c); apply(c); setDark(document.documentElement.dataset.theme === "dark"); }, []);
  useEffect(() => {
    if (choice !== "auto") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => { apply("auto"); setDark(mq.matches); };
    mq.addEventListener("change", on); return () => mq.removeEventListener("change", on);
  }, [choice]);
  const set = useCallback((c: ThemeChoice) => {
    try { localStorage.setItem(KEY, c); } catch { /* not remembered */ }
    setChoice(c); apply(c); setDark(document.documentElement.dataset.theme === "dark");
  }, []);
  return { choice, dark, set, toggle: () => set(dark ? "light" : "dark") };
}

/** Runs in <head> before React, so a dark user never sees a white flash. */
export const THEME_BOOT = `(function(){try{var t=localStorage.getItem('${KEY}');var d=t==='dark'||((t!=='light')&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light'}catch(e){}})()`;
