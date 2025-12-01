import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 transition-all outline-none focus-visible:ring-2 focus-visible:ring-[var(--matrix-green)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:bg-[var(--matrix-green)] data-[state=checked]:border-[var(--matrix-green)]",
        "data-[state=unchecked]:bg-[var(--bg-secondary)] data-[state=unchecked]:border-[var(--border-primary)]",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block h-5 w-5 rounded-full shadow-lg ring-0 transition-transform",
          "data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0",
          "data-[state=checked]:bg-black",
          "data-[state=unchecked]:bg-[var(--text-muted)]"
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
