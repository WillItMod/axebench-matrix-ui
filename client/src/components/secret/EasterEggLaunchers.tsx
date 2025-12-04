import { useMemo, useState, type CSSProperties } from 'react';
import {
  ActivitySquare,
  Antenna,
  Atom,
  CircuitBoard,
  Cpu,
  LucideIcon,
  Radar,
  ScanLine,
  Shield,
  Zap,
} from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { MINI_GAMES, type MiniGameKey, type MiniGameEntry } from './games/registry';

type Spot = {
  key: MiniGameKey;
  Icon: LucideIcon;
  position: CSSProperties;
  label: string;
};

const spots: Spot[] = [
  { key: 'hash', Icon: CircuitBoard, position: { top: 88, left: 10 }, label: 'entropy tap' },
  { key: 'breach', Icon: Antenna, position: { top: 140, right: 14 }, label: 'darkline ping' },
  { key: 'pulse', Icon: Radar, position: { top: 210, left: 18 }, label: 'sync node' },
  { key: 'maze', Icon: Cpu, position: { top: 280, right: 22 }, label: 'asic crawl' },
  { key: 'volt', Icon: Zap, position: { top: 360, left: 12 }, label: 'voltage probe' },
  { key: 'fan', Icon: Atom, position: { top: 430, right: 16 }, label: 'fan whisper' },
  { key: 'sniff', Icon: ScanLine, position: { bottom: 160, left: 18 }, label: 'packet snare' },
  { key: 'ports', Icon: Shield, position: { bottom: 220, right: 18 }, label: 'port trap' },
  { key: 'entropy', Icon: ActivitySquare, position: { bottom: 120, left: 26 }, label: 'entropy bump' },
  { key: 'uptime', Icon: Shield, position: { bottom: 70, right: 14 }, label: 'uptime keep' },
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
        {spots.map(({ key, Icon, position, label }) => (
          <button
            key={key}
            type="button"
            aria-label={`Easter egg: ${label}`}
            onClick={() => handleTrigger(key)}
            className="pointer-events-auto absolute w-7 h-7 text-muted-foreground/30 hover:text-primary transition transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            style={position}
          >
            <Icon className="w-6 h-6" />
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
        <DialogContent className="max-w-3xl bg-card border border-border text-foreground">
          {Current ? (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">Easter egg: {Current.title}</div>
              <div className="border border-border rounded-lg bg-background/80 p-3">
                <Current.component onComplete={close} />
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Activate an easter egg to begin.</div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
