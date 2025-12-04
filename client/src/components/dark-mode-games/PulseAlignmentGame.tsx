import { useEffect, useState } from 'react';
import type { DarkMiniGameProps } from './CrackTheHashGame';

export default function PulseAlignmentGame({ onComplete }: DarkMiniGameProps) {
  const [pos, setPos] = useState(0);
  const [dir, setDir] = useState(1);
  const [hits, setHits] = useState(0);
  const windowStart = 35;
  const windowEnd = 65;

  useEffect(() => {
    const id = setInterval(() => {
      setPos((p) => {
        const next = p + dir * 4;
        if (next >= 100) {
          setDir(-1);
          return 100;
        }
        if (next <= 0) {
          setDir(1);
          return 0;
        }
        return next;
      });
    }, 80);
    return () => clearInterval(id);
  }, [dir]);

  const sync = () => {
    if (pos >= windowStart && pos <= windowEnd) {
      const newHits = hits + 1;
      setHits(newHits);
      if (newHits >= 3) {
        onComplete();
      }
    } else {
      setHits(0);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 text-slate-100">
      <div className="text-lg font-bold text-lime-400 mb-3">PULSE ALIGNMENT</div>
      <div className="text-xs text-slate-400 mb-2">Hit SYNC inside the glow window three times.</div>
      <div className="relative h-10 bg-slate-950 border border-slate-800 rounded overflow-hidden">
        <div
          className="absolute top-0 bottom-0 bg-lime-500/20"
          style={{ left: `${windowStart}%`, width: `${windowEnd - windowStart}%` }}
        />
        <div className="absolute top-0 bottom-0 w-2 bg-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.7)] transition-transform" style={{ transform: `translateX(${pos}%)` }} />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button onClick={sync} className="btn-matrix px-4 py-2">
          SYNC
        </button>
        <div className="text-slate-400 text-sm">Locks: <span className="text-lime-300 font-bold">{hits}/3</span></div>
      </div>
    </div>
  );
}
