import { useEffect, useState } from 'react';
import type { DarkMiniGameProps } from './CrackTheHashGame';

type Cell = 'wall' | 'empty' | 'hash' | 'letterB' | 'letterI' | 'letterT' | 'exit';

const baseGrid: Cell[][] = [
  ['wall', 'wall', 'wall', 'wall', 'wall', 'wall', 'wall'],
  ['wall', 'empty', 'hash', 'empty', 'letterB', 'hash', 'wall'],
  ['wall', 'empty', 'wall', 'empty', 'wall', 'empty', 'wall'],
  ['wall', 'hash', 'empty', 'empty', 'letterI', 'empty', 'wall'],
  ['wall', 'empty', 'wall', 'hash', 'wall', 'letterT', 'wall'],
  ['wall', 'empty', 'empty', 'empty', 'empty', 'exit', 'wall'],
  ['wall', 'wall', 'wall', 'wall', 'wall', 'wall', 'wall'],
];

const icons: Record<Cell, string> = {
  wall: '█',
  empty: '·',
  hash: '#',
  letterB: 'B',
  letterI: 'I',
  letterT: 'T',
  exit: '₿',
};

export default function AsicMazeRunnerGame({ onComplete }: DarkMiniGameProps) {
  const [grid, setGrid] = useState<Cell[][]>(baseGrid);
  const [pos, setPos] = useState<[number, number]>([1, 1]);
  const [collected, setCollected] = useState<string[]>([]);

  const move = (dx: number, dy: number) => {
    setGrid((g) => {
      const [x, y] = pos;
      const nx = x + dx;
      const ny = y + dy;
      const target = g[ny][nx];
      if (target === 'wall') return g;

      if (target === 'hash' || target === 'letterB' || target === 'letterI' || target === 'letterT') {
        setCollected((c) => [...c, target]);
        const newG = g.map((row, iy) =>
          row.map((cell, ix) => (ix === nx && iy === ny ? 'empty' : cell)),
        );
        setPos([nx, ny]);
        return newG;
      }
      if (target === 'exit') {
        const needLetters = ['letterB', 'letterI', 'letterT'];
        const hasAll = needLetters.every((l) => collected.includes(l));
        if (hasAll && collected.filter((c) => c === 'hash').length >= 3) {
          onComplete();
        }
        setPos([nx, ny]);
        return g;
      }
      setPos([nx, ny]);
      return g;
    });
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') move(0, -1);
      if (e.key === 'ArrowDown') move(0, 1);
      if (e.key === 'ArrowLeft') move(-1, 0);
      if (e.key === 'ArrowRight') move(1, 0);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 text-slate-100">
      <div className="text-lg font-bold text-lime-400 mb-3">ASIC MAZE RUNNER</div>
      <div className="text-xs text-slate-400 mb-2">Collect # and the letters B I T, then grab ₿.</div>
      <div className="flex gap-4 flex-col md:flex-row">
        <div className="bg-slate-950 border border-slate-800 rounded p-3 font-mono text-sm">
          {grid.map((row, y) => (
            <div key={y} className="leading-6">
              {row.map((cell, x) => (
                <span key={x} className="inline-block w-5 text-center text-slate-300">
                  {pos[0] === x && pos[1] === y ? '⛏' : icons[cell]}
                </span>
              ))}
            </div>
          ))}
        </div>
        <div className="space-y-2 text-xs text-slate-400">
          <div>Hashes: {collected.filter((c) => c === 'hash').length} / 3+</div>
          <div>Letters: {['letterB', 'letterI', 'letterT'].map((l) => (collected.includes(l) ? l.replace('letter', '') : '·')).join(' ')}</div>
          <div className="flex gap-2">
            {[
              ['↑', () => move(0, -1)],
              ['↓', () => move(0, 1)],
              ['←', () => move(-1, 0)],
              ['→', () => move(1, 0)],
            ].map(([label, fn]) => (
              <button key={label as string} onClick={fn as () => void} className="px-3 py-1 bg-slate-800 border border-slate-700 rounded hover:border-lime-400">
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
