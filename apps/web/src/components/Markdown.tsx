"use client";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { renderMarkdown } from "@/lib/markdown";

/** Renders Markdown safely; clicking an image opens it full-size. */
export function Markdown({ source, className }: { source: string; className?: string }) {
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null);
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setZoom(null); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [zoom]);
  return (
    <div className={clsx("text-sm leading-relaxed text-slate-800", className)}>
      {renderMarkdown(source, { onImage: (src, alt) => setZoom({ src, alt }) })}
      {zoom && (
        <div className="anim-fade fixed inset-0 z-[80] flex cursor-zoom-out items-center justify-center bg-black/75 p-6" onClick={() => setZoom(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom.src} alt={zoom.alt} className="max-h-full max-w-full rounded-2xl shadow-lift" />
        </div>
      )}
    </div>
  );
}
