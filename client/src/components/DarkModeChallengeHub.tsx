import { useEffect, useMemo, useState } from 'react';
import CrackTheHashGame from './dark-mode-games/CrackTheHashGame';
import BreachTheNodeGame from './dark-mode-games/BreachTheNodeGame';
import PulseAlignmentGame from './dark-mode-games/PulseAlignmentGame';
import AsicMazeRunnerGame from './dark-mode-games/AsicMazeRunnerGame';
import VoltageRouletteGame from './dark-mode-games/VoltageRouletteGame';
import FanCurveTunerGame from './dark-mode-games/FanCurveTunerGame';
import PacketSnifferGame from './dark-mode-games/PacketSnifferGame';
import PortScannerGame from './dark-mode-games/PortScannerGame';
import EntropyShakerGame from './dark-mode-games/EntropyShakerGame';
import UptimeKeeperGame from './dark-mode-games/UptimeKeeperGame';
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

const UNLOCK_KEY = 'axebench_dark_unlocked';
const SECRET_THEME_KEY = 'axebench_secret_theme';

export default function DarkModeChallengeHub() {
  const { setTheme, secretUnlocked, setSecretUnlocked } = useTheme();
  const [unlocked, setUnlocked] = useState(false);
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
  };

  if (unlocked) {
    return (
      <div className="bg-slate-900 border border-lime-500/50 rounded-lg p-5 text-slate-100 shadow-[0_0_25px_rgba(34,197,94,0.35)] relative overflow-hidden">
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
