"use client";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { useAuth } from "@/lib/auth";

/* little looping animations, drawn with plain CSS so they cost nothing */
const CSS = `
@keyframes tour-drag { 0%,15% { transform: translate(0,0) rotate(0); } 45%,70% { transform: translate(104px,6px) rotate(3deg); } 100% { transform: translate(0,0) rotate(0); } }
@keyframes tour-pulse { 0%,100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(0,113,227,.45); } 50% { transform: scale(1.06); box-shadow: 0 0 0 12px rgba(0,113,227,0); } }
@keyframes tour-tick { 0%,30% { background: transparent; border-color: #cbd5e1; } 40%,100% { background: #10b981; border-color: #10b981; } }
@keyframes tour-check { 0%,35% { opacity: 0; transform: scale(.4); } 50%,100% { opacity: 1; transform: scale(1); } }
@keyframes tour-ring { 0%,100% { transform: rotate(0); } 10%,30% { transform: rotate(18deg); } 20%,40% { transform: rotate(-18deg); } 50% { transform: rotate(0); } }
@keyframes tour-pop { 0% { opacity: 0; transform: translateY(8px) scale(.96); } 15%,85% { opacity: 1; transform: none; } 100% { opacity: 0; } }
@keyframes tour-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.tour-step { animation: tour-in .35s ease both; }
@media (prefers-reduced-motion: reduce) { .tour-step, .tour-anim { animation: none !important; } }
`;

const card = "rounded-xl bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 shadow-card ring-1 ring-slate-200";

function BoardArt() {
  return (
    <div className="flex h-full items-center justify-center gap-3">
      {["To Do", "In Progress", "Done"].map((c, i) => (
        <div key={c} className="h-36 w-[86px] rounded-2xl bg-slate-200/60 p-1.5">
          <div className="mb-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">{c}</div>
          {i === 0 && <div className={clsx(card, "tour-anim relative z-10 !px-2 !py-1.5 !text-[10px]")} style={{ animation: "tour-drag 3.2s ease-in-out infinite" }}>Fix login</div>}
          {i === 0 && <div className={clsx(card, "mt-1.5 !px-2 !py-1.5 !text-[10px] opacity-60")}>Write docs</div>}
          {i === 2 && <div className={clsx(card, "!px-2 !py-1.5 !text-[10px] opacity-60")}>Deploy</div>}
        </div>
      ))}
    </div>
  );
}
function RaiseArt() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <button type="button" tabIndex={-1} className="tour-anim flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-3xl font-light text-white" style={{ animation: "tour-pulse 1.8s ease-in-out infinite" }}>+</button>
      <div className={clsx(card, "w-60 !font-normal text-slate-500")}>Title · priority · due date · assign people</div>
    </div>
  );
}
function SubtaskArt() {
  return (
    <div className="flex h-full flex-col justify-center gap-2 px-6">
      <div className={clsx(card, "flex items-center gap-2.5")}>
        <span className="tour-anim relative flex h-5 w-5 items-center justify-center rounded-md border-2" style={{ animation: "tour-tick 3s ease infinite" }}>
          <Check className="tour-anim h-3.5 w-3.5 text-white" strokeWidth={3} style={{ animation: "tour-check 3s ease infinite" }} /></span>
        <span className="flex-1">Design the screen</span>
        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] text-sky-700">In progress</span>
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 text-[10px] text-indigo-700">A</span>
      </div>
      <div className={clsx(card, "flex items-center gap-2.5 opacity-70")}>
        <span className="h-5 w-5 rounded-md border-2 border-slate-300" /><span className="flex-1">Review copy</span>
        <span className="tour-anim text-amber-500" style={{ animation: "tour-ring 2.4s ease-in-out infinite", transformOrigin: "top center" }}>🔔</span>
      </div>
    </div>
  );
}
function CommentArt() {
  return (
    <div className="flex h-full flex-col justify-center gap-2 px-8">
      <div className={clsx(card, "tour-anim max-w-[80%] !font-normal")} style={{ animation: "tour-pop 4s ease infinite" }}><b>Sam</b> Is the API ready?</div>
      <div className={clsx(card, "tour-anim ml-auto max-w-[80%] !bg-indigo-50 !font-normal")} style={{ animation: "tour-pop 4s ease infinite .9s" }}><b>You</b> <span className="text-indigo-600">@Sam</span> yes, shipped!</div>
    </div>
  );
}
function BlockedArt() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <div className={clsx(card, "flex w-60 items-center gap-2 !bg-rose-50 !text-rose-700 ring-rose-200")}>🔒 Blocked <span className="ml-auto text-[10px] font-normal">Overdue · Nov 17</span></div>
      <div className="flex gap-2 text-[11px] text-slate-500"><span className="rounded-full bg-white px-2.5 py-1 shadow-card">Edits off</span><span className="rounded-full bg-white px-2.5 py-1 shadow-card">Comments on</span><span className="tour-anim rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-700" style={{ animation: "tour-pulse 2s ease-in-out infinite" }}>Unblock</span></div>
    </div>
  );
}

const STEPS: { title: string; text: string; art: () => React.ReactElement }[] = [
  { title: "Your board", art: BoardArt, text: "Every task is a card in a column: To Do, In Progress, In Review, Blocked and Done. Drag a card to move it. On a phone, press and hold a card and pick where it goes." },
  { title: "Raise a ticket", art: RaiseArt, text: "Press Raise (or the round + on a phone) to add a task. Give it a title, a priority and a due date, and assign it to one or more people." },
  { title: "Subtasks and reminders", art: SubtaskArt, text: "Break a task into subtasks. Each can be assigned to several people and only they can tick it or change its status. The bell emails them a reminder, once." },
  { title: "Comments and mentions", art: CommentArt, text: "Discuss in the comments, reply to a comment, or type @ to mention a teammate. They get a notification and an email." },
  { title: "Blocked tasks", art: BlockedArt, text: "A blocked task is frozen: you can comment, but nothing else changes until it is unblocked. If it is also overdue, only the person who created it can unblock it or move the date." },
];

/** Shown once to people who have just signed up: a short offer, then an animated walk-through. Skipping or finishing both mean "never again". */
export function WelcomeTour() {
  const { user, markTourSeen } = useAuth();
  const [step, setStep] = useState(-1); // -1 = the offer, 0.. = the slides
  const show = !!user && user.tourSeen === false;
  const close = () => markTourSeen();
  useEffect(() => {
    if (!show) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (step >= 0 && e.key === "ArrowRight") setStep((s) => Math.min(s + 1, STEPS.length - 1));
      else if (step >= 0 && e.key === "ArrowLeft") setStep((s) => Math.max(s - 1, 0));
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, step]);
  if (!show) return null;
  const last = step === STEPS.length - 1;
  const S = step >= 0 ? STEPS[step] : null;
  return (
    <div className="anim-fade fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Welcome tour">
      <style>{CSS}</style>
      <div className="relative w-full max-w-md overflow-hidden rounded-[28px] bg-white shadow-lift">
        <button type="button" onClick={close} aria-label="Close tour" className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        {!S ? (
          <div className="tour-step px-6 pb-6 pt-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-3xl">👋</div>
            <h2 className="text-xl font-semibold tracking-tight">Welcome{user?.name ? `, ${user.name.split(" ")[0]}` : ""}!</h2>
            <p className="mx-auto mt-2 max-w-xs text-sm text-slate-500">Want a quick tour? It takes about a minute and you will only be asked once.</p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
              <button type="button" onClick={() => setStep(0)} className="flex-1 rounded-full bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700">Show me around</button>
              <button type="button" onClick={close} className="flex-1 rounded-full bg-slate-100 px-5 py-3 text-sm font-medium text-slate-600 hover:bg-slate-200">Skip for now</button>
            </div>
          </div>
        ) : (
          <div key={step} className="tour-step">
            <div className="h-52 bg-gradient-to-b from-indigo-50 to-slate-50"><S.art /></div>
            <div className="px-6 pb-5 pt-5">
              <h2 className="text-lg font-semibold tracking-tight">{S.title}</h2>
              <p className="mt-1.5 min-h-[5.5rem] text-sm leading-relaxed text-slate-500">{S.text}</p>
              <div className="mt-4 flex items-center justify-between">
                <div className="flex gap-1.5" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
                  {STEPS.map((_, i) => <span key={i} className={clsx("h-1.5 rounded-full transition-all", i === step ? "w-5 bg-indigo-600" : "w-1.5 bg-slate-300")} />)}
                </div>
                <div className="flex gap-2">
                  {step > 0 && <button type="button" onClick={() => setStep(step - 1)} className="flex items-center gap-1 rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200"><ArrowLeft className="h-4 w-4" />Back</button>}
                  <button type="button" onClick={() => (last ? close() : setStep(step + 1))} className="flex items-center gap-1 rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
                    {last ? <>Done<Check className="h-4 w-4" /></> : <>Next<ArrowRight className="h-4 w-4" /></>}</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
