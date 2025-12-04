import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { MINI_GAMES, type MiniGameKey, type MiniGameEntry } from './games/registry';

type Spot = {
  key: MiniGameKey;
  position: CSSProperties;
  label: string;
};

// Base anchor slots (relative to viewport); a little jitter is added per cycle
const baseSlots: Spot[] = [
  { key: '2048', position: { top: 110, left: '3%' }, label: 'Status beacon' },
  { key: 'hextris', position: { top: 110, right: '3%' }, label: 'Status beacon' },
  { key: 'clumsy-bird', position: { top: 175, left: '8%' }, label: 'Nav pulse' },
  { key: 'hexgl', position: { top: 175, right: '8%' }, label: 'Nav pulse' },
  { key: 'astray', position: { top: 245, left: '15%' }, label: 'Grid scan' },
  { key: 'js13k', position: { top: 245, right: '15%' }, label: 'Grid scan' },
  { key: 'pixel-defense', position: { bottom: 200, left: '10%' }, label: 'Footer node' },
  { key: 'breakout', position: { bottom: 200, right: '10%' }, label: 'Footer node' },
  { key: 'dark-room', position: { bottom: 120, left: '18%' }, label: 'Console spark' },
  { key: 'kontra', position: { bottom: 120, right: '18%' }, label: 'Console spark' },
];

export default function EasterEggLaunchers() {
  const [openKey, setOpenKey] = useState<MiniGameKey | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pulseTick, setPulseTick] = useState(0);

  const Current = useMemo<MiniGameEntry | null>(() => {
    if (!openKey) return null;
    return MINI_GAMES.find((g) => g.key === openKey) ?? null;
  }, [openKey]);

  // Gentle pulse every ~3 minutes
  useEffect(() => {
    const id = setInterval(() => setPulseTick((t) => t + 1), 180000);
    return () => clearInterval(id);
  }, []);

  const spots = useMemo(() => {
    // jitter within +-12px each cycle
    return baseSlots.map((slot, idx) => {
      const jitterX = (Math.random() - 0.5) * 24;
      const jitterY = (Math.random() - 0.5) * 24;
      const pos: CSSProperties = { ...slot.position };
      if (pos.left) pos.left = `calc(${pos.left} + ${jitterX}px)`;
      if (pos.right) pos.right = `calc(${pos.right} + ${jitterX}px)`;
      if (pos.top) pos.top = (Number(pos.top) + jitterY) as number;
      if (pos.bottom) pos.bottom = (Number(pos.bottom) + jitterY) as number;
      return { ...slot, position: pos, pulse: pulseTick % baseSlots.length === idx ? true : false };
    });
  }, [pulseTick]);

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
        {spots.map(({ key, position, label, pulse }) => (
          <button
            key={key}
            type="button"
            aria-label={`Hidden trigger: ${label}`}
            onClick={() => handleTrigger(key)}
            className={`pointer-events-auto absolute flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-emerald-400/10 via-cyan-400/10 to-amber-400/10 text-[9px] uppercase tracking-[0.14em] text-emerald-50 border border-emerald-300/20 hover:scale-110 transition ${
              pulse ? 'shadow-[0_0_24px_rgba(16,185,129,0.45)]' : 'shadow-none'
            }`}
            style={position}
            title="Hidden protocol"
          >
            ●
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
