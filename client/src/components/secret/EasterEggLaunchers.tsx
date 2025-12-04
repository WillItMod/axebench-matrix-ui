import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
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
  const [glintKey, setGlintKey] = useState<MiniGameKey | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const Current = useMemo<MiniGameEntry | null>(() => {
    if (!openKey) return null;
    return MINI_GAMES.find((g) => g.key === openKey) ?? null;
  }, [openKey]);

  // Schedule a single glint every 3-15 minutes
  useEffect(() => {
    const schedule = () => {
      const delay = 180000 + Math.random() * (900000 - 180000); // 3 to 15 minutes
      timerRef.current = setTimeout(() => {
        const pick = baseSlots[Math.floor(Math.random() * baseSlots.length)];
        setGlintKey(pick.key);
        setPulseTick((t) => t + 1);
        setTimeout(() => setGlintKey(null), 2200);
        schedule();
      }, delay);
    };
    schedule();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const spots = useMemo(() => {
    // jitter within +-8px on each pulse cycle
    return baseSlots.map((slot, idx) => {
      const jitterX = (Math.random() - 0.5) * 16;
      const jitterY = (Math.random() - 0.5) * 16;
      const pos: CSSProperties = { ...slot.position };
      if (pos.left) pos.left = `calc(${pos.left} + ${jitterX}px)`;
      if (pos.right) pos.right = `calc(${pos.right} + ${jitterX}px)`;
      if (pos.top) pos.top = (Number(pos.top) + jitterY) as number;
      if (pos.bottom) pos.bottom = (Number(pos.bottom) + jitterY) as number;
      return { ...slot, position: pos, pulse: glintKey === slot.key };
    });
  }, [pulseTick, glintKey]);

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
            className={`pointer-events-auto absolute flex items-center justify-center w-4 h-4 rounded-full bg-transparent text-[0px] border border-transparent transition ${
              pulse ? 'shadow-[0_0_30px_rgba(16,185,129,0.7)]' : 'shadow-none'
            }`}
            style={position}
            title="Hidden protocol"
          >
            <span
              className={`block w-full h-full rounded-full ${
                pulse ? 'bg-emerald-300/70' : 'bg-white/0'
              }`}
            />
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
