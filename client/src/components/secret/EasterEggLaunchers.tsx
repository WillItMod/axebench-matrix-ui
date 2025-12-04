import { useMemo, useState, type CSSProperties } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { MINI_GAMES, type MiniGameKey, type MiniGameEntry } from './games/registry';

type Spot = {
  key: MiniGameKey;
  position: CSSProperties;
  label: string;
};

// Visible glow badges anchored near header/nav/footer
const spots: Spot[] = [
  { key: '2048', position: { top: 110, left: '2%' }, label: 'Status beacon' },
  { key: 'hextris', position: { top: 110, right: '2%' }, label: 'Status beacon' },
  { key: 'clumsy-bird', position: { top: 180, left: '6%' }, label: 'Nav pulse' },
  { key: 'hexgl', position: { top: 180, right: '6%' }, label: 'Nav pulse' },
  { key: 'astray', position: { top: 250, left: '12%' }, label: 'Grid scan' },
  { key: 'js13k', position: { top: 250, right: '12%' }, label: 'Grid scan' },
  { key: 'pixel-defense', position: { bottom: 220, left: '8%' }, label: 'Footer node' },
  { key: 'breakout', position: { bottom: 220, right: '8%' }, label: 'Footer node' },
  { key: 'dark-room', position: { bottom: 140, left: '20%' }, label: 'Console spark' },
  { key: 'kontra', position: { bottom: 140, right: '20%' }, label: 'Console spark' },
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
            onClick={() => handleTrigger(key)}
            className="pointer-events-auto absolute flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400/15 via-cyan-400/12 to-amber-400/15 text-[10px] uppercase tracking-[0.18em] text-emerald-50 shadow-[0_0_18px_rgba(16,185,129,0.35)] border border-emerald-300/30 hover:scale-105 transition"
            style={position}
            title="Hidden protocol"
          >
            SCAN
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
            <div className="text-sm text-muted-foreground">Click a glowing scan badge to deploy.</div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
