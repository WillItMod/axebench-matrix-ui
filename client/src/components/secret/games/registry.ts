import type { DarkMiniGameProps } from '../types';
import CrackTheHashGame from './CrackTheHashGame';
import BreachTheNodeGame from './BreachTheNodeGame';
import PulseAlignmentGame from './PulseAlignmentGame';
import AsicMazeRunnerGame from './AsicMazeRunnerGame';
import VoltageRouletteGame from './VoltageRouletteGame';
import FanCurveTunerGame from './FanCurveTunerGame';
import PacketSnifferGame from './PacketSnifferGame';
import PortScannerGame from './PortScannerGame';
import EntropyShakerGame from './EntropyShakerGame';
import UptimeKeeperGame from './UptimeKeeperGame';

export type MiniGameKey =
  | 'hash'
  | 'breach'
  | 'pulse'
  | 'maze'
  | 'volt'
  | 'fan'
  | 'sniff'
  | 'ports'
  | 'entropy'
  | 'uptime';

export type MiniGameEntry = {
  key: MiniGameKey;
  component: (props: DarkMiniGameProps) => JSX.Element;
  title: string;
};

export const MINI_GAMES: MiniGameEntry[] = [
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

export const getMiniGameByKey = (key: MiniGameKey) =>
  MINI_GAMES.find((game) => game.key === key) ?? MINI_GAMES[0];
