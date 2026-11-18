/** Per-person colour. Class names are written out in full so Tailwind can see them. */
export type Tone = { avatar: string; text: string; soft: string; dot: string; border: string };

export const TONES: Tone[] = [
  { avatar: "bg-rose-600", text: "text-rose-700", soft: "bg-rose-50", dot: "bg-rose-500", border: "border-rose-200" },
  { avatar: "bg-orange-600", text: "text-orange-700", soft: "bg-orange-50", dot: "bg-orange-500", border: "border-orange-200" },
  { avatar: "bg-amber-600", text: "text-amber-700", soft: "bg-amber-50", dot: "bg-amber-500", border: "border-amber-200" },
  { avatar: "bg-lime-600", text: "text-lime-700", soft: "bg-lime-50", dot: "bg-lime-500", border: "border-lime-200" },
  { avatar: "bg-emerald-600", text: "text-emerald-700", soft: "bg-emerald-50", dot: "bg-emerald-500", border: "border-emerald-200" },
  { avatar: "bg-teal-600", text: "text-teal-700", soft: "bg-teal-50", dot: "bg-teal-500", border: "border-teal-200" },
  { avatar: "bg-cyan-600", text: "text-cyan-700", soft: "bg-cyan-50", dot: "bg-cyan-500", border: "border-cyan-200" },
  { avatar: "bg-sky-600", text: "text-sky-700", soft: "bg-sky-50", dot: "bg-sky-500", border: "border-sky-200" },
  { avatar: "bg-indigo-600", text: "text-indigo-700", soft: "bg-indigo-50", dot: "bg-indigo-500", border: "border-indigo-200" },
  { avatar: "bg-violet-600", text: "text-violet-700", soft: "bg-violet-50", dot: "bg-violet-500", border: "border-violet-200" },
  { avatar: "bg-fuchsia-600", text: "text-fuchsia-700", soft: "bg-fuchsia-50", dot: "bg-fuchsia-500", border: "border-fuchsia-200" },
  { avatar: "bg-pink-600", text: "text-pink-700", soft: "bg-pink-50", dot: "bg-pink-500", border: "border-pink-200" },
];

const hash = (s: string) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return Math.abs(h); };

/** Stable colour for anyone, derived from their id (used when we don't know the project's members). */
export const toneByHash = (id: string): Tone => TONES[hash(id) % TONES.length];

/**
 * Colours for one project's members: each prefers the colour its id hashes to, and on a clash takes the next free one,
 * so no two members of a project (up to 12) ever share a colour. Processing in id order keeps results stable between visits.
 */
export function assignTones(ids: string[]): Map<string, Tone> {
  const out = new Map<string, Tone>(), used = new Set<number>();
  for (const id of [...ids].sort()) {
    let i = hash(id) % TONES.length;
    if (used.size < TONES.length) while (used.has(i)) i = (i + 1) % TONES.length;
    used.add(i); out.set(id, TONES[i]);
  }
  return out;
}

export const fmtTime = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
