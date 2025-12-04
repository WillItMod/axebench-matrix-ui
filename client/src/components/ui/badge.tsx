import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:ring-[3px] focus-visible:ring-[hsl(var(--ring))]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--background))] aria-invalid:ring-[hsl(var(--destructive))]/20 aria-invalid:border-[hsl(var(--destructive))] transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] [a&]:hover:bg-[hsl(var(--primary))]/90",
        secondary:
          "border border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] [a&]:hover:bg-[hsl(var(--muted))]/80",
        destructive:
          "border-transparent bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] [a&]:hover:bg-[hsl(var(--destructive))]/90 focus-visible:ring-[hsl(var(--destructive))]/20",
        outline:
          "text-[hsl(var(--foreground))] border border-[hsl(var(--border))] [a&]:hover:bg-[hsl(var(--muted))]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
