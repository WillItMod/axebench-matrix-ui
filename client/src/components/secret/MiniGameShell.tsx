import { ReactNode } from 'react';

type MiniGameShellProps = {
  title: string;
  subtitle?: string;
  hint?: string;
  status?: string;
  children: ReactNode;
};

export default function MiniGameShell({ title, subtitle, hint, status, children }: MiniGameShellProps) {
  return (
    <div className="gridrunner-surface border border-transparent p-4 sm:p-6 flex flex-col gap-4 shadow-chrome">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-lg font-semibold text-foreground">{title}</div>
          {subtitle && <div className="text-sm text-muted-foreground">{subtitle}</div>}
        </div>
        {status && (
          <div className="text-xs text-muted-foreground font-mono px-2 py-1 rounded-md border border-border bg-background/60 backdrop-blur-sm">
            {status}
          </div>
        )}
      </div>
      <div className="gridrunner-surface border border-transparent p-3 sm:p-4">{children}</div>
      {hint && <div className="text-xs text-muted-foreground border-t border-border/60 pt-3">{hint}</div>}
    </div>
  );
}
