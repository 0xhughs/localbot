import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-md bg-raised px-3 text-sm text-fg placeholder:text-subtle",
        "shadow-[0_0_0_1px_var(--color-border)]",
        "transition-[box-shadow] duration-150",
        "focus-visible:shadow-[0_0_0_2px_var(--color-accent)]",
        "disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-20 w-full rounded-md bg-raised px-3 py-2 text-sm text-fg placeholder:text-subtle",
        "shadow-[0_0_0_1px_var(--color-border)]",
        "transition-[box-shadow] duration-150",
        "focus-visible:shadow-[0_0_0_2px_var(--color-accent)]",
        "disabled:opacity-40 resize-none",
        className,
      )}
      {...props}
    />
  );
}
