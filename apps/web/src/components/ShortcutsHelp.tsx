"use client";
import { Modal } from "./Bits";

const ROWS: [string[], string][] = [
  [["/"], "Search tickets"], [["c"], "Raise a new ticket"], [["g", "b"], "Go to the Board"], [["g", "t"], "Go to All Tickets"],
  [["g", "m"], "Go to Team & Roles"], [["g", "p"], "Go to your profile"], [["Esc"], "Close a panel or dialog"], [["?"], "Show this list"],
];
export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose}>
      <ul className="divide-y divide-slate-100">
        {ROWS.map(([keys, what]) => (
          <li key={what} className="flex items-center justify-between py-2.5 text-sm">
            <span>{what}</span>
            <span className="flex items-center gap-1">{keys.map((k, i) => <span key={i} className="flex items-center gap-1">{i > 0 && <span className="text-xs text-slate-400">then</span>}<kbd className="min-w-6 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-center font-mono text-xs text-slate-700 shadow-sm">{k}</kbd></span>)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-slate-400">Shortcuts are off while you are typing in a field.</p>
    </Modal>
  );
}
