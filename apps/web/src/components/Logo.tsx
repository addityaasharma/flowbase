/** The Flowbase mark: a flowing path with a short step bar. Inherits colour from `currentColor`. */
export function FlowbaseMark({ className = "h-6 w-auto" }: { className?: string }) {
  return (
    <svg viewBox="30 37 388 251" fill="none" className={className} aria-hidden="true">
      <g stroke="currentColor" strokeWidth="40" strokeLinecap="round" strokeLinejoin="round">
        <path d="M60 67H187A38 38 0 0 1 225 105V220A38 38 0 0 0 263 258H388" />
        <path d="M60 162H154" />
      </g>
    </svg>
  );
}
