import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-[3px] focus-visible:ring-[hsl(var(--ring))]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--background))] aria-invalid:ring-[hsl(var(--destructive))]/30 aria-invalid:border-[hsl(var(--destructive))] shadow-[0_0_0_rgba(0,0,0,0)] hover:-translate-y-[1px] active:translate-y-[0px] border border-transparent",
  {
    variants: {
      variant: {
        default:
          "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-[hsla(var(--primary),0.45)] shadow-[0_0_18px_hsla(var(--primary),0.35),0_0_28px_hsla(var(--accent),0.18)] hover:bg-[hsl(var(--primary))]/92 hover:shadow-[0_0_20px_hsla(var(--primary),0.45),0_0_32px_hsla(var(--accent),0.2)]",
        destructive:
          "bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] border-[hsla(var(--destructive),0.55)] shadow-[0_0_18px_rgba(239,68,68,0.5)] hover:bg-[hsl(var(--destructive))]/90 hover:shadow-[0_0_22px_rgba(239,68,68,0.65)] focus-visible:ring-[hsl(var(--destructive))]/40",
        outline:
          "border border-[hsl(var(--border))] bg-transparent text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]/35 hover:border-[hsla(var(--primary),0.4)] shadow-[0_0_12px_hsla(var(--primary),0.12)]",
        secondary:
          "bg-[hsla(var(--card),0.72)] text-[hsl(var(--foreground))] border-[hsl(var(--border))] shadow-[0_0_14px_hsla(var(--primary),0.12)] hover:bg-[hsl(var(--muted))]/40 hover:border-[hsla(var(--primary),0.35)]",
        accent:
          "bg-gradient-to-r from-[hsl(var(--accent))] via-[hsl(var(--primary))] to-[hsl(var(--accent))] text-[hsl(var(--primary-foreground))] border-[hsla(var(--accent),0.45)] shadow-[0_0_20px_hsla(var(--accent),0.45),0_0_28px_hsla(var(--primary),0.25)] hover:shadow-[0_0_24px_hsla(var(--accent),0.6),0_0_32px_hsla(var(--primary),0.32)]",
        autoTune:
          "bg-gradient-to-r from-[#6d28d9] via-[#a855f7] to-[#6d28d9] text-white border-[rgba(168,85,247,0.65)] shadow-[0_0_22px_rgba(168,85,247,0.55),0_0_30px_rgba(109,40,217,0.45)] hover:shadow-[0_0_26px_rgba(168,85,247,0.65),0_0_36px_rgba(109,40,217,0.55)] focus-visible:ring-[rgba(168,85,247,0.5)]/70",
        ghost:
          "bg-transparent text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]/25 hover:text-[hsl(var(--primary))]",
        link: "text-[hsl(var(--primary))] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant || "default"}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
