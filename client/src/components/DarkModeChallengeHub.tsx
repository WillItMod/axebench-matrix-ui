import { useEffect, useMemo, useState } from 'react';
import CrackTheHashGame from './secret/games/CrackTheHashGame';
import BreachTheNodeGame from './secret/games/BreachTheNodeGame';
import PulseAlignmentGame from './secret/games/PulseAlignmentGame';
import AsicMazeRunnerGame from './secret/games/AsicMazeRunnerGame';
import VoltageRouletteGame from './secret/games/VoltageRouletteGame';
import FanCurveTunerGame from './secret/games/FanCurveTunerGame';
import PacketSnifferGame from './secret/games/PacketSnifferGame';
import PortScannerGame from './secret/games/PortScannerGame';
import EntropyShakerGame from './secret/games/EntropyShakerGame';
import UptimeKeeperGame from './secret/games/UptimeKeeperGame';
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
  const [unlocked, setUnlocked] = useState(false);
  const [replayMode, setReplayMode] = useState(false);
  const [gameKey, setGameKey] = useState<string>(() => games[Math.floor(Math.random() * games.length)].key);

  useEffect(() => {
    if (secretUnlocked || localStorage.getItem(UNLOCK_KEY) === 'true' || localStorage.getItem(SECRET_THEME_KEY) === 'forge') {
      setUnlocked(true);
      setSecretUnlocked(true);
    }
  }, [secretUnlocked, setSecretUnlocked]);

  const Current = useMemo(() => games.find((g) => g.key === gameKey)?.component ?? games[0].component, [gameKey]);

  const complete = () => {
    setUnlocked(true);
    localStorage.setItem(UNLOCK_KEY, 'true');
    localStorage.setItem(SECRET_THEME_KEY, 'forge');
    setSecretUnlocked(true);
    setTheme('forge');
    window.dispatchEvent(new CustomEvent('forge-celebrate'));
    setReplayMode(false);
  };

  if (unlocked) {
    return (
      <div className="bg-slate-900 border border-lime-500/50 rounded-lg p-5 text-slate-100 shadow-[0_0_25px_rgba(34,197,94,0.35)] relative overflow-hidden space-y-3">
        <div className="absolute inset-0 bg-gradient-to-br from-lime-500/10 via-cyan-500/5 to-emerald-500/10 pointer-events-none" />
        <div className="relative">
          <div className="text-xl font-bold text-lime-400">DARK MATRIX ONLINE</div>
          <div className="text-sm text-slate-300 mt-1">Secret ops theme is active. Night vision engaged.</div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
            <span className="px-3 py-1 rounded border border-lime-400/60 text-lime-300">night ops</span>
            <span className="px-3 py-1 rounded border border-cyan-400/60 text-cyan-300">matrix core</span>
            <span className="px-3 py-1 rounded border border-emerald-400/60 text-emerald-300">hacker mode</span>
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
              className="self-start text-xs px-3 py-2 rounded border border-lime-500/60 hover:border-cyan-400 bg-slate-900/60"
            >
              Run a challenge for fun
            </button>
          )}
          {replayMode && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-300">Bonus challenge (Forge already unlocked)</div>
                <button
                  onClick={() => setReplayMode(false)}
                  className="text-xs px-3 py-1 rounded border border-slate-700 hover:border-cyan-400"
                >
                  Close
                </button>
              </div>
              <div className="bg-slate-950/70 border border-slate-700 rounded-md p-3">
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
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 text-slate-100 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-bold text-lime-400">DARK MODE CHALLENGES</div>
          <div className="text-xs text-slate-400">Beat any challenge to unlock night ops.</div>
        </div>
        <button onClick={reroll} className="text-xs px-3 py-2 rounded border border-slate-700 hover:border-cyan-400">
          Spin another
        </button>
      </div>
      <Current onComplete={complete} />
    </div>
  );
}
