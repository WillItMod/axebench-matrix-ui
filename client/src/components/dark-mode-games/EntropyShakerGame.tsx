import { useState } from 'react';
import type { DarkMiniGameProps } from './CrackTheHashGame';

export default function EntropyShakerGame({ onComplete }: DarkMiniGameProps) {
  const target = 30;
  const [count, setCount] = useState(0);
  const pct = Math.min(100, Math.round((count / target) * 100));

  const click = () => {
    const next = count + 1;
    setCount(next);
    if (next >= target) {
      onComplete();
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 text-slate-100">
      <div className="text-lg font-bold text-lime-400 mb-3">ENTROPY SHAKER</div>
      <div className="text-xs text-slate-400 mb-2">Click to saturate entropy pool.</div>
      <button
        onClick={click}
        className="w-full py-4 bg-slate-950 border border-slate-800 rounded-lg text-lime-300 font-bold text-lg hover:border-cyan-400"
      >
        SHAKE ENTROPY ({count})
      </button>
      <div className="mt-3 h-3 bg-slate-800 rounded overflow-hidden border border-slate-700">
        <div className="h-full bg-lime-400 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 text-xs text-slate-500">
        {pct >= 100 ? '[OK] ENTROPY SATURATED – SEED ACCEPTED' : 'Inject more clicks.'}
      </div>
    </div>
  );
}
