import { useMemo, useState } from 'react';
import type { DarkMiniGameProps } from './CrackTheHashGame';

export default function VoltageRouletteGame({ onComplete }: DarkMiniGameProps) {
  const profiles = useMemo(() => {
    const options = [
      { v: 1.21, c: 775 },
      { v: 1.15, c: 715 },
      { v: 1.05, c: 650 },
      { v: 1.30, c: 820 },
      { v: 0.98, c: 590 },
    ];
    const stable = Math.floor(Math.random() * options.length);
    return options.map((opt, idx) => ({ ...opt, stable: idx === stable }));
  }, []);
  const [message, setMessage] = useState<string>('');

  const choose = (stable: boolean) => {
    if (stable) {
      setMessage('Stable silicon found. Core locked.');
      onComplete();
    } else {
      setMessage('ASIC crashed, try another profile.');
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 text-slate-100">
      <div className="text-lg font-bold text-lime-400 mb-3">VOLTAGE ROULETTE</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {profiles.map((p, idx) => (
          <button
            key={idx}
            onClick={() => choose(p.stable)}
            className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-left hover:border-lime-400 transition-all"
          >
            <div className="text-sm text-slate-300">Profile #{idx + 1}</div>
            <div className="text-xl font-bold text-cyan-300">{p.v.toFixed(2)} V</div>
            <div className="text-sm text-slate-400">{p.c} MHz</div>
          </button>
        ))}
      </div>
      <div className="mt-3 text-xs text-slate-400">{message || 'Pick the stable silicon profile.'}</div>
    </div>
  );
}
