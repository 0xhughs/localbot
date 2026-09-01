import type { MascotId } from "@/lib/mascots";
import { cn } from "@/lib/utils";

export function MascotMark({
  id,
  className,
}: {
  id: MascotId;
  className?: string;
}) {
  const cls = cn("size-full", className);
  if (id === "writer") return <WriterMascot className={cls} />;
  if (id === "researcher") return <ResearcherMascot className={cls} />;
  return <OpsMascot className={cls} />;
}

function WriterMascot({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="16" cy="16" r="15" fill="var(--color-mascot-writer-bg)" />
      <ellipse cx="16" cy="18" rx="8.5" ry="7" fill="var(--color-mascot-writer)" />
      <circle cx="13" cy="16.5" r="1.15" fill="var(--color-bg)" />
      <circle cx="19" cy="16.5" r="1.15" fill="var(--color-bg)" />
      <path
        d="M13.2 20.4c1.6 1.1 3.9 1.1 5.6 0"
        fill="none"
        stroke="var(--color-bg)"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      <path
        d="M21.2 8.2 24.6 11.4 15.1 21.2l-3.6.6.7-3.5z"
        fill="var(--color-fg)"
        opacity="0.92"
      />
      <path d="M21.2 8.2 24.6 11.4 22.4 9.3z" fill="var(--color-mascot-writer)" />
    </svg>
  );
}

function ResearcherMascot({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="16" cy="16" r="15" fill="var(--color-mascot-researcher-bg)" />
      <ellipse cx="15" cy="17.5" rx="8" ry="6.6" fill="var(--color-mascot-researcher)" />
      <circle cx="12.4" cy="16.2" r="1.1" fill="var(--color-bg)" />
      <circle cx="17.6" cy="16.2" r="1.1" fill="var(--color-bg)" />
      <path
        d="M12.6 20.1c1.4.9 3.4.9 4.8 0"
        fill="none"
        stroke="var(--color-bg)"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      <circle
        cx="21.4"
        cy="11.2"
        r="4.1"
        fill="none"
        stroke="var(--color-fg)"
        strokeWidth="1.7"
      />
      <path
        d="M24.4 14.2 27.4 17.3"
        fill="none"
        stroke="var(--color-fg)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function OpsMascot({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="16" cy="16" r="15" fill="var(--color-mascot-ops-bg)" />
      <rect x="8.5" y="14" width="15" height="10" rx="1.6" fill="var(--color-mascot-ops)" />
      <path d="M8.5 17.2h15" stroke="var(--color-bg)" strokeWidth="1" opacity="0.45" />
      <rect x="14.2" y="16.6" width="3.6" height="2.4" rx="0.4" fill="var(--color-bg)" />
      <circle cx="16" cy="11.2" r="3.4" fill="var(--color-fg)" />
      <circle cx="16" cy="11.2" r="1.35" fill="var(--color-mascot-ops-bg)" />
      <path
        d="M16 7.4v1.3M16 13.7v1.3M12.2 11.2h1.3M18.5 11.2h1.3M13.3 8.5l.9.9M17.8 12.9l.9.9M18.7 8.5l-.9.9M13.3 12.9l-.9.9"
        stroke="var(--color-fg)"
        strokeWidth="1.15"
        strokeLinecap="round"
      />
    </svg>
  );
}
