import { Fragment, type ReactNode } from "react";
import { API_BASE } from "./api";

/**
 * A small, safe Markdown renderer. It builds React elements directly (never HTML strings), so pasted markup
 * cannot run: <script>, onerror=, javascript: links etc. are shown as plain text or ignored.
 * Supports: paragraphs, # headings, **bold**, *italic*, `code`, ``` code blocks, > quotes, - / 1. lists (nested),
 * - [ ] checklists, [links](https://…), ![images](…), bare URLs, ---.
 */
const UPLOAD_PREFIX = "/api/uploads/";

/** An <img> may load from our own uploads or any https URL. Anything else (javascript:, data:, http:) is not rendered. */
export function imageSrc(u: string): string | null {
  const name = u.slice(UPLOAD_PREFIX.length);
  if (u.startsWith(UPLOAD_PREFIX) && /^[a-f0-9]{32}\.(png|jpg|gif|webp)$/.test(name)) return `${API_BASE}/uploads/${name}`;
  return /^https:\/\/[^\s"'<>]+$/i.test(u) ? u : null;
}
const linkHref = (u: string) => (/^(https?:\/\/|mailto:)[^\s"'<>]+$/i.test(u) ? u : null);

export type MdOptions = { onImage?: (src: string, alt: string) => void };

const INLINE = String.raw`!\[(?<ialt>[^\]]*)\]\((?<isrc>[^)\s]+)\)|\[(?<ltxt>[^\]]+)\]\((?<lurl>[^)\s]+)\)|\x60(?<code>[^\x60]+)\x60|\*\*(?<bold>[^*]+)\*\*|\*(?<em>[^*\s][^*]*)\*|(?<auto>https?:\/\/[^\s<]+[^\s<.,;:!?)\]])`;
const A = "text-indigo-600 underline underline-offset-2 hover:text-indigo-700 break-words";

function inline(text: string, key: string, o: MdOptions): ReactNode[] {
  const re = new RegExp(INLINE, "g");
  const out: ReactNode[] = [];
  let last = 0, n = 0, m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const g = m.groups!, k = `${key}.${n++}`;
    if (g.isrc !== undefined) {
      const src = imageSrc(g.isrc);
      out.push(src
        // eslint-disable-next-line @next/next/no-img-element
        ? <img key={k} src={src} alt={g.ialt} loading="lazy" onClick={() => o.onImage?.(src, g.ialt)} className="my-1 inline-block max-h-80 max-w-full cursor-zoom-in rounded-xl border border-slate-200 align-middle" />
        : m[0]);
    } else if (g.lurl !== undefined) {
      const href = linkHref(g.lurl);
      out.push(href ? <a key={k} href={href} target="_blank" rel="noopener noreferrer nofollow" className={A}>{inline(g.ltxt, k, o)}</a> : m[0]);
    } else if (g.code !== undefined) out.push(<code key={k} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em] text-slate-800">{g.code}</code>);
    else if (g.bold !== undefined) out.push(<strong key={k} className="font-semibold">{inline(g.bold, k, o)}</strong>);
    else if (g.em !== undefined) out.push(<em key={k}>{inline(g.em, k, o)}</em>);
    else if (g.auto !== undefined) out.push(<a key={k} href={g.auto} target="_blank" rel="noopener noreferrer nofollow" className={A}>{g.auto}</a>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Item = { indent: number; ordered: boolean; task: boolean | null; text: string };
const LIST = /^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/;
const LIST_FULL = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

function renderList(items: Item[], key: string, o: MdOptions): ReactNode {
  const base = items[0].indent;
  const lis: ReactNode[] = [];
  let i = 0;
  while (i < items.length) {
    let j = i + 1;
    while (j < items.length && items[j].indent > base) j++;
    const it = items[i], children = items.slice(i + 1, j);
    lis.push(
      <li key={`${key}.${i}`} className={it.task !== null ? "-ml-5 list-none" : undefined}>
        {it.task !== null && <input type="checkbox" checked={it.task} readOnly disabled className="mr-2 h-3.5 w-3.5 translate-y-[2px] accent-indigo-600" />}
        <span className={it.task ? "text-slate-400 line-through" : undefined}>{inline(it.text, `${key}.${i}`, o)}</span>
        {children.length > 0 && renderList(children, `${key}.${i}c`, o)}
      </li>,
    );
    i = j;
  }
  const Tag = items[0].ordered ? "ol" : "ul";
  return <Tag key={key} className={(items[0].ordered ? "list-decimal" : "list-disc") + " my-2 space-y-1 pl-5 first:mt-0 last:mb-0"}>{lis}</Tag>;
}

export function renderMarkdown(src: string, o: MdOptions = {}, key = "b"): ReactNode[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let i = 0, n = 0;
  const k = () => `${key}${n++}`;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (/^\s*```/.test(line)) {
      const buf: string[] = []; i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(<pre key={k()} className="my-2 overflow-x-auto rounded-xl bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-100"><code>{buf.join("\n")}</code></pre>);
      continue;
    }
    const h = /^(#{1,3})\s+(.+)$/.exec(line);
    if (h) {
      const cls = ["mt-4 mb-2 text-xl font-semibold", "mt-3 mb-1.5 text-lg font-semibold", "mt-3 mb-1 text-base font-semibold"][h[1].length - 1];
      out.push(<div key={k()} role="heading" aria-level={h[1].length} className={cls + " first:mt-0"}>{inline(h[2], k(), o)}</div>);
      i++; continue;
    }
    if (/^---+\s*$/.test(line)) { out.push(<hr key={k()} className="my-3 border-slate-200" />); i++; continue; }
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
      out.push(<blockquote key={k()} className="my-2 border-l-4 border-slate-200 pl-3 text-slate-600">{renderMarkdown(buf.join("\n"), o, k())}</blockquote>);
      continue;
    }
    if (LIST.test(line)) {
      const items: Item[] = [];
      while (i < lines.length && LIST.test(lines[i])) {
        const m = LIST_FULL.exec(lines[i])!;
        const t = /^\[( |x|X)\]\s+(.*)$/.exec(m[3]);
        items.push({ indent: m[1].replace(/\t/g, "  ").length, ordered: /\d/.test(m[2]), task: t ? t[1].toLowerCase() === "x" : null, text: t ? t[2] : m[3] });
        i++;
      }
      out.push(renderList(items, k(), o));
      continue;
    }
    const buf = [line]; i++;
    while (i < lines.length && lines[i].trim() && !/^\s*```|^#{1,3}\s|^>\s?|^---+\s*$/.test(lines[i]) && !LIST.test(lines[i])) buf.push(lines[i++]);
    out.push(<p key={k()} className="my-2 break-words first:mt-0 last:mb-0">{buf.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l, `${k()}.${j}`, o)}</Fragment>)}</p>);
  }
  return out;
}
