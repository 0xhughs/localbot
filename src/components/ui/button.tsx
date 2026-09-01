import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-medium transition-[opacity,transform,background-color,color,box-shadow] duration-150 ease-out disabled:pointer-events-none disabled:opacity-40 active:not-disabled:scale-[0.96] select-none",
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-accent-fg hover:opacity-90 shadow-[0_0_0_1px_rgb(255_255_255/0.06)]",
        secondary:
          "bg-raised text-fg hover:bg-hover shadow-[0_0_0_1px_rgb(255_255_255/0.08)]",
        ghost: "bg-transparent text-muted hover:text-fg hover:bg-hover",
        danger: "bg-danger/15 text-danger hover:bg-danger/25",
        outline:
          "bg-transparent text-fg shadow-[0_0_0_1px_var(--color-border)] hover:bg-hover",
      },
      size: {
        sm: "h-8 px-3 text-sm rounded-sm",
        md: "h-10 px-3.5 text-sm rounded-md",
        lg: "h-11 px-4 text-sm rounded-md",
        icon: "size-10 rounded-md",
        "icon-sm": "size-8 rounded-sm",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
