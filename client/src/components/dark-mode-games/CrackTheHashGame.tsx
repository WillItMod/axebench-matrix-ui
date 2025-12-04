import { useMemo, useState } from 'react';

export type DarkMiniGameProps = { onComplete: () => void };

const randomHex = () => {
  const bytes = Array.from({ length: 6 }, () => Math.floor(Math.random() * 256));
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
};

export default function CrackTheHashGame({ onComplete }: DarkMiniGameProps) {
  const target = useMemo(() => randomHex(), []);
  const [[clock, volt, fan], setVals] = useState<[number, number, number]>([50, 50, 50]);
  const hash = useMemo(() => {
    const mix = clock * 7 + volt * 13 + fan * 5;
    return mix.toString(16).padStart(10, '0').slice(0, 12).toUpperCase();
  }, [clock, volt, fan]);

  const matched = Math.abs(parseInt(hash, 16) - parseInt(target, 16)) < 0x8000 || (clock > 62 && volt > 58 && fan > 54 && clock < 68 && volt < 62 && fan < 60);

  if (matched) {
    onComplete();
  }

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 text-slate-100 shadow-[0_0_25px_rgba(34,197,94,0.15)]">
      <div className="text-lg font-bold text-lime-400 mb-3">CRACK THE HASH</div>
      <div className="bg-slate-950/80 border border-slate-800 rounded p-3 text-xs font-mono space-y-2">
        <div className="text-slate-400">target: <span className="text-lime-400">{target}</span></div>
        <div className="text-slate-400">current: <span className="text-cyan-300">{hash}</span></div>
        <div className="text-slate-500">twist the dials until collision lights up</div>
      </div>
      <div className="mt-4 space-y-3">
        {[
          ['Clock', clock, (v: number) => setVals([v, volt, fan])],
          ['Voltage', volt, (v: number) => setVals([clock, v, fan])],
          ['Fan', fan, (v: number) => setVals([clock, volt, v])],
        ].map(([label, val, set]) => (
          <div key={label as string} className="flex items-center gap-3">
            <div className="w-24 text-sm text-slate-300">{label}</div>
            <input
              type="range"
              min={0}
              max={100}
              value={val as number}
              onChange={(e) => (set as (v: number) => void)(Number(e.target.value))}
              className="flex-1 accent-lime-400"
            />
            <div className="w-12 text-right text-slate-400 text-sm">{val as number}%</div>
          </div>
        ))}
      </div>
      <div className="mt-3 text-xs text-slate-500 font-mono">
        {matched ? '[OK] HASH COLLISION DETECTED' : '[...] searching entropy space'}
      </div>
    </div>
  );
}
