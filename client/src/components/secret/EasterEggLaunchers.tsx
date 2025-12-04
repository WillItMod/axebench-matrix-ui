import { useMemo, useState, type CSSProperties } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { MINI_GAMES, type MiniGameKey, type MiniGameEntry } from './games/registry';

type Spot = {
  key: MiniGameKey;
  position: CSSProperties;
  label: string;
};

// Tiny “glint” triggers tucked into page chrome; double-click to open.
const spots: Spot[] = [
  { key: 'asic-repair', position: { top: 96, left: 22 }, label: 'board service' },
  { key: 'block-decryptor', position: { top: 188, right: 26 }, label: 'header rune' },
  { key: 'hashrate-dodger', position: { top: 272, left: 34 }, label: 'hashstream drift' },
  { key: 'psu-balancer', position: { top: 352, right: 32 }, label: 'rail shim' },
  { key: 'voltage-surge', position: { top: 438, left: 28 }, label: 'pulse tap' },
  { key: 'fan-fury', position: { bottom: 220, right: 30 }, label: 'thermal relief' },
  { key: 'nano-tune-reflex', position: { bottom: 260, left: 40 }, label: 'signal snap' },
  { key: 'blockbuilder', position: { bottom: 180, left: 22 }, label: 'stack probe' },
  { key: 'countermeasure', position: { bottom: 130, right: 26 }, label: 'counterfire' },
];

export default function EasterEggLaunchers() {
  const [openKey, setOpenKey] = useState<MiniGameKey | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const Current = useMemo<MiniGameEntry | null>(() => {
    if (!openKey) return null;
    return MINI_GAMES.find((g) => g.key === openKey) ?? null;
  }, [openKey]);

  const handleTrigger = (key: MiniGameKey) => {
    setOpenKey(key);
    setDialogOpen(true);
  };

  const close = () => {
    setDialogOpen(false);
    setOpenKey(null);
  };

  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-30 select-none">
        {spots.map(({ key, position, label }) => (
          <button
            key={key}
            type="button"
            aria-label={`Hidden trigger: ${label}`}
            onDoubleClick={() => handleTrigger(key)}
            className="pointer-events-auto absolute w-4 h-4 rounded-full bg-gradient-to-br from-emerald-400/5 via-cyan-400/5 to-amber-400/5 opacity-0 hover:opacity-50 focus:opacity-70 ring-offset-background ring-1 ring-transparent focus:ring-emerald-400/70 transition duration-300"
            style={position}
            title="Signal pin"
          >
            <span className="sr-only">{label}</span>
          </button>
        ))}
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(val) => {
          setDialogOpen(val);
          if (!val) {
            setOpenKey(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl shadow-chrome">
          {Current ? (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">Hidden protocol: {Current.title}</div>
              <Current.component onComplete={close} />
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Double-tap a hidden pin to deploy.</div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
