import { useEffect, useMemo, useState } from 'react';
import CrackTheHashGame from './games/CrackTheHashGame';
import BreachTheNodeGame from './games/BreachTheNodeGame';
import PulseAlignmentGame from './games/PulseAlignmentGame';
import AsicMazeRunnerGame from './games/AsicMazeRunnerGame';
import VoltageRouletteGame from './games/VoltageRouletteGame';
import FanCurveTunerGame from './games/FanCurveTunerGame';
import PacketSnifferGame from './games/PacketSnifferGame';
import PortScannerGame from './games/PortScannerGame';
import EntropyShakerGame from './games/EntropyShakerGame';
import UptimeKeeperGame from './games/UptimeKeeperGame';
import { useTheme } from '@/contexts/ThemeContext';

type GameEntry = {
  key: string;
  component: (props: { onComplete: () => void }) => JSX.Element;
  title: string;
};

const games: GameEntry[] = [
  { key: 'hash', component: CrackTheHashGame, title: 'Crack the Hash' },
  { key: 'breach', component: BreachTheNodeGame, title: 'Breach the Node' },
  { key: 'pulse', component: PulseAlignmentGame, title: 'Pulse Alignment' },
  { key: 'maze', component: AsicMazeRunnerGame, title: 'ASIC Maze Runner' },
  { key: 'volt', component: VoltageRouletteGame, title: 'Voltage Roulette' },
  { key: 'fan', component: FanCurveTunerGame, title: 'Fan Curve Tuner' },
  { key: 'sniff', component: PacketSnifferGame, title: 'Packet Sniffer' },
  { key: 'ports', component: PortScannerGame, title: 'Port Scanner' },
  { key: 'entropy', component: EntropyShakerGame, title: 'Entropy Shaker' },
  { key: 'uptime', component: UptimeKeeperGame, title: 'Uptime Keeper' },
];

const SECRET_UNLOCK_KEY = 'axebench_secret_unlocked';
const SECRET_THEME_KEY = 'axebench_secret_theme';
const THEME_KEY = 'axebench_theme';

export default function DarkModeChallengeHub() {
  const { setTheme, secretUnlocked, setSecretUnlocked } = useTheme();
  const [unlocked, setUnlocked] = useState(
    () => secretUnlocked || localStorage.getItem(SECRET_UNLOCK_KEY) === 'true'
  );
  const [replayMode, setReplayMode] = useState(false);
  const [gameKey, setGameKey] = useState<string>(
    () => games[Math.floor(Math.random() * games.length)].key
  );

  useEffect(() => {
    if (secretUnlocked) {
      setUnlocked(true);
      return;
    }
    if (
      localStorage.getItem(SECRET_UNLOCK_KEY) === 'true' ||
      localStorage.getItem(SECRET_THEME_KEY) === 'forge'
    ) {
      setUnlocked(true);
      setSecretUnlocked(true);
    }
  }, [secretUnlocked, setSecretUnlocked]);

  const Current = useMemo(
    () => games.find((g) => g.key === gameKey)?.component ?? games[0].component,
    [gameKey]
  );

  const complete = () => {
    setUnlocked(true);
    localStorage.setItem(SECRET_UNLOCK_KEY, 'true');
    localStorage.setItem(SECRET_THEME_KEY, 'forge');
    localStorage.setItem(THEME_KEY, 'forge');
    setSecretUnlocked(true);
    setTheme('forge');
    window.dispatchEvent(new CustomEvent('forge-celebrate'));
    setReplayMode(false);
  };

  if (unlocked) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 text-foreground relative overflow-hidden space-y-3">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-secondary/5 to-primary/10 pointer-events-none" />
        <div className="relative space-y-1">
          <div className="text-lg font-semibold">Unlocked - Satoshi&apos;s Forge Online</div>
          <div className="text-sm text-muted-foreground">
            Forge theme is active. Run bonus challenges any time from the Bitcoin logo.
          </div>
        </div>
        <div className="relative flex flex-col gap-2">
          {!replayMode && (
            <button
              onClick={() => {
                const next = games[Math.floor(Math.random() * games.length)]?.key ?? games[0].key;
                setGameKey(next);
                setReplayMode(true);
              }}
              className="self-start text-xs px-3 py-2 rounded border border-border bg-background/80 text-foreground hover:border-primary/60"
            >
              Run a challenge for fun
            </button>
          )}
          {replayMode && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Bonus challenge (Forge already unlocked)
                </div>
                <button
                  onClick={() => setReplayMode(false)}
                  className="text-xs px-3 py-1 rounded border border-border hover:border-primary/60"
                >
                  Close
                </button>
              </div>
              <div className="bg-background/80 border border-border rounded-md p-3">
                <Current onComplete={complete} />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const reroll = () => {
    const remaining = games.filter((g) => g.key !== gameKey);
    const next = remaining[Math.floor(Math.random() * remaining.length)]?.key ?? games[0].key;
    setGameKey(next);
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 sm:p-5 text-foreground space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">Dark Mode Challenges</div>
          <div className="text-xs text-muted-foreground">
            Beat any challenge to unlock Satoshi&apos;s Forge.
          </div>
        </div>
        <button
          onClick={reroll}
          className="text-xs px-3 py-2 rounded border border-border bg-background/80 hover:border-primary/60"
        >
          Spin another
        </button>
      </div>
      <div className="bg-background/80 border border-border rounded-lg p-3">
        <Current onComplete={complete} />
      </div>
    </div>
  );
}
