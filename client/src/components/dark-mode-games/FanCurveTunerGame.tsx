import { useEffect, useState } from 'react';
import type { DarkMiniGameProps } from './CrackTheHashGame';

export default function FanCurveTunerGame({ onComplete }: DarkMiniGameProps) {
  const [offset, setOffset] = useState(50);
  const [hold, setHold] = useState(0);
  const targetMin = 4200;
  const targetMax = 4400;
  const rpm = 3000 + offset * 30;
  const inRange = rpm >= targetMin && rpm <= targetMax;

  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;
    if (inRange) {
      id = setTimeout(() => {
        setHold((h) => {
          const next = h + 1;
          if (next >= 1) {
            onComplete();
          }
          return next;
        });
      }, 1000);
    } else {
      setHold(0);
    }
    return () => clearTimeout(id);
  }, [inRange, onComplete]);

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 text-slate-100">
      <div className="text-lg font-bold text-lime-400 mb-3">FAN CURVE TUNER</div>
      <div className="text-sm text-slate-400 mb-2">Target: {targetMin}-{targetMax} RPM</div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={100}
          value={offset}
          onChange={(e) => setOffset(Number(e.target.value))}
          className="flex-1 accent-lime-400"
        />
        <div className="text-sm text-cyan-300 font-mono">{Math.round(rpm)} RPM</div>
      </div>
      <div className="mt-2 text-xs text-slate-400">
        {inRange ? 'Holding...' : 'Adjust to hit the sweet spot'}
      </div>
    </div>
  );
}
