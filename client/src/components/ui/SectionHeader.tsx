import { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  children: ReactNode;
  className?: string;
}

export function SectionHeader({ children, className }: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "text-orange-400 drop-shadow-[0_0_8px_rgba(249,115,22,0.8)] font-semibold tracking-[0.25em] uppercase text-sm md:text-base",
        className
      )}
    >
      {children}
    </div>
  );
}
