"use client";
import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import clsx from "clsx";
import { Bold, Code, ImagePlus, Italic, Link2, List, ListChecks, ListOrdered } from "lucide-react";
import { uploadImage } from "@/lib/api";
import { Markdown } from "./Markdown";

const MAX = 5 * 1024 * 1024;
const BULLET = /^\s*[-*]\s+(?!\[[ xX]\])/, NUMBER = /^\s*\d+\.\s+/, TASK = /^\s*[-*]\s+\[[ xX]\]\s+/;

/**
 * Markdown editor: toolbar (bold, italic, bullets, numbers, checklist, code, link, image), Enter continues lists,
 * paste or drop images to upload them, Write/Preview tabs. Ctrl/Cmd+Enter calls onSubmit, Ctrl/Cmd+B / I format.
 */
export function RichEditor({ value, onChange, placeholder, rows = 4, onSubmit, autoFocus }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; onSubmit?: () => void; autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const valueRef = useRef(value); valueRef.current = value;
  const selRef = useRef<number | null>(null);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [busy, setBusy] = useState(0);
  const [err, setErr] = useState("");
  const [drag, setDrag] = useState(false);

  const commit = (text: string, a: number, b = a) => {
    flushSync(() => onChange(text));            // render the new text now, so the caret can be placed before the next keystroke
    const t = ref.current; if (t) { t.focus(); t.setSelectionRange(a, b); selRef.current = b; }
  };
  const sel = () => { const t = ref.current!; return [t.selectionStart, t.selectionEnd] as const; };

  const wrap = (before: string, after: string, ph: string) => {
    const [s, e] = sel(), v = valueRef.current, mid = v.slice(s, e) || ph;
    commit(v.slice(0, s) + before + mid + after + v.slice(e), s + before.length, s + before.length + mid.length);
  };
  const prefixLines = (make: (i: number) => string, has: RegExp) => {
    const [s, e] = sel(), v = valueRef.current;
    const ls = v.lastIndexOf("\n", s - 1) + 1; let le = v.indexOf("\n", e); if (le < 0) le = v.length;
    const lines = v.slice(ls, le).split("\n");
    const all = lines.every((l) => has.test(l));
    const strip = (l: string) => l.replace(TASK, "").replace(BULLET, "").replace(NUMBER, "");
    const next = lines.map((l, i) => (all ? strip(l) : make(i) + strip(l))).join("\n");
    // nothing selected: put the caret after the marker so typing continues the item; a selection stays selected
    commit(v.slice(0, ls) + next + v.slice(le), s === e ? ls + next.length : ls, ls + next.length);
  };
  const link = () => {
    const [s, e] = sel(), v = valueRef.current, text = v.slice(s, e) || "link text";
    const ins = `[${text}](https://)`, urlStart = s + text.length + 3;
    commit(v.slice(0, s) + ins + v.slice(e), urlStart, urlStart + 8);
  };
  const insert = (text: string) => {
    const v = valueRef.current, pos = selRef.current ?? v.length;
    onChange(v.slice(0, pos) + text + v.slice(pos)); selRef.current = pos + text.length;
  };

  const upload = async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return;
    setErr("");
    for (const f of imgs) {
      setBusy((b) => b + 1);
      try {
        if (f.size > MAX) throw new Error(`${f.name || "That image"} is larger than 5 MB`);
        insert(`${valueRef.current && !valueRef.current.endsWith("\n") ? "\n" : ""}![${(f.name || "image").replace(/[\]\[()]/g, "")}](${await uploadImage(f)})\n`);
      } catch (e) { setErr((e as Error).message); } finally { setBusy((b) => b - 1); }
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (mod && e.key === "Enter") { e.preventDefault(); onSubmit?.(); return; }
    if (mod && k === "b") { e.preventDefault(); wrap("**", "**", "bold text"); return; }
    if (mod && k === "i") { e.preventDefault(); wrap("*", "*", "italic text"); return; }
    if (e.key !== "Enter" || e.shiftKey || mod) return;
    const [s, end] = sel(); if (s !== end) return;
    const v = valueRef.current, ls = v.lastIndexOf("\n", s - 1) + 1;
    const m = /^(\s*)(?:([-*])|(\d+)\.)\s+(\[[ xX]\]\s+)?(.*)$/.exec(v.slice(ls, s));
    if (!m) return;
    e.preventDefault();
    if (!m[5].trim()) { commit(v.slice(0, ls) + v.slice(s), ls); return; }           // empty item: leave the list
    const marker = m[2] ?? `${Number(m[3]) + 1}.`;
    const add = `\n${m[1]}${marker} ${m[4] ? "[ ] " : ""}`;
    commit(v.slice(0, s) + add + v.slice(s), s + add.length);
  };

  const tool = (label: string, Icon: typeof Bold, run: () => void) => (
    <button type="button" key={label} title={label} aria-label={label} onMouseDown={(e) => e.preventDefault()} onClick={run}
      className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-900"><Icon className="h-4 w-4" /></button>
  );

  return (
    <div className={clsx("rounded-xl border bg-slate-100 transition focus-within:border-indigo-500 focus-within:bg-white focus-within:ring-4 focus-within:ring-indigo-500/15", drag ? "border-indigo-500" : "border-transparent")}>
      <div className="flex items-center justify-between gap-2 border-b border-black/5 px-2 py-1.5">
        <div className="flex items-center gap-0.5">
          {tool("Bold (Ctrl+B)", Bold, () => wrap("**", "**", "bold text"))}
          {tool("Italic (Ctrl+I)", Italic, () => wrap("*", "*", "italic text"))}
          <span className="mx-1 h-4 w-px bg-slate-300" />
          {tool("Bulleted list", List, () => prefixLines(() => "- ", BULLET))}
          {tool("Numbered list", ListOrdered, () => prefixLines((i) => `${i + 1}. `, NUMBER))}
          {tool("Checklist", ListChecks, () => prefixLines(() => "- [ ] ", TASK))}
          <span className="mx-1 h-4 w-px bg-slate-300" />
          {tool("Code", Code, () => wrap("`", "`", "code"))}
          {tool("Link", Link2, link)}
          {tool("Add image", ImagePlus, () => file.current?.click())}
        </div>
        <div className="flex items-center gap-1 text-xs font-medium">
          {busy > 0 && <span className="mr-1 text-slate-400">Uploading…</span>}
          {(["write", "preview"] as const).map((t) => (
            <button type="button" key={t} onClick={() => setTab(t)} className={clsx("rounded-full px-2.5 py-1 capitalize", tab === t ? "bg-white text-slate-900 shadow-card" : "text-slate-500 hover:text-slate-800")}>{t}</button>
          ))}
        </div>
      </div>
      {tab === "write" ? (
        <textarea ref={ref} rows={rows} value={value} autoFocus={autoFocus} placeholder={placeholder}
          onChange={(e) => { onChange(e.target.value); selRef.current = e.target.selectionStart; }}
          onSelect={(e) => { selRef.current = e.currentTarget.selectionStart; }}
          onKeyDown={onKeyDown}
          onPaste={(e) => { const f = [...e.clipboardData.files]; if (f.some((x) => x.type.startsWith("image/"))) { e.preventDefault(); upload(f); } }}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); upload([...e.dataTransfer.files]); }}
          className="block w-full resize-y bg-transparent px-3.5 py-2.5 text-sm outline-none placeholder:text-slate-400" />
      ) : (
        <div className="min-h-20 px-3.5 py-2.5">{value.trim() ? <Markdown source={value} /> : <p className="text-sm text-slate-400">Nothing to preview yet</p>}</div>
      )}
      {err && <p className="border-t border-black/5 px-3.5 py-1.5 text-xs text-rose-600">{err}</p>}
      <input ref={file} type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden onChange={(e) => { upload([...(e.target.files ?? [])]); e.target.value = ""; }} />
    </div>
  );
}
