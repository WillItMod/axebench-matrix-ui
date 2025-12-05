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

const confirmToneButtonClasses: Record<Tone, string | undefined> = {
  default: undefined,
  warning: 'bg-[var(--warning-amber)] text-black hover:bg-[var(--warning-amber)]/80 border border-[var(--warning-amber)] shadow-[0_0_16px_rgba(234,179,8,0.35)]',
  danger: 'bg-[#ef4444] text-white hover:bg-[#dc2626] border border-[#ef4444] shadow-[0_0_18px_rgba(239,68,68,0.55)]',
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
      <DialogContent className="matrix-card w-[min(90vw,760px)] md:w-[min(90vw,920px)] max-h-[85vh] overflow-y-auto">
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
            className={confirmToneButtonClasses[tone]}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
