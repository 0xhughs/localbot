import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-7", className)}
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="8" fill="currentColor" className="text-accent" />
      <rect x="7" y="8" width="7" height="16" rx="2" fill="#0a0b0d" opacity="0.9" />
      <path
        d="M17.5 11h7.5v2.2H20v2.1h4.2v2.2H20V21h-2.5V11z"
        fill="#0a0b0d"
      />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 font-medium tracking-tight", className)}>
      <LogoMark className="size-6" />
      <span className="text-fg">
        Local<span className="text-muted">Bot</span>
      </span>
    </span>
  );
}
