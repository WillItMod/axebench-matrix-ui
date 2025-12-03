import { ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type Tone = 'default' | 'danger' | 'warning';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}

const toneClasses: Record<Tone, string> = {
  default: 'text-[var(--text-primary)]',
  warning: 'text-[var(--warning-amber)]',
  danger: 'text-[var(--error-red)]',
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(val) => !val && onCancel()}>
      <DialogContent className="matrix-card max-w-lg">
        <DialogHeader>
          <DialogTitle className={`text-xl font-bold ${toneClasses[tone]}`}>{title}</DialogTitle>
          {description && (
            <DialogDescription className="text-[var(--text-secondary)]">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>
        {children && <div className="py-2">{children}</div>}
        <DialogFooter className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'destructive' : 'default'}
            className={tone === 'warning' ? 'bg-[var(--warning-amber)] text-black hover:bg-[var(--warning-amber)]/80' : undefined}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
