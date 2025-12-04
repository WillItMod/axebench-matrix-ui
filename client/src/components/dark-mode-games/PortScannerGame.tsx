import { useMemo, useState } from 'react';
import type { DarkMiniGameProps } from './CrackTheHashGame';

const PORTS = [3000, 5000, 5001, 5002, 8332, 8333, 18444];

export default function PortScannerGame({ onComplete }: DarkMiniGameProps) {
  const sequence = useMemo(() => PORTS.slice().sort((a, b) => a - b), []);
  const shuffled = useMemo(() => PORTS.slice().sort(() => Math.random() - 0.5), []);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('activate ports low → high');

  const click = (port: number) => {
    if (port === sequence[progress]) {
      const next = progress + 1;
      if (next === sequence.length) {
        setMessage('[OK] ordered pipeline online');
        onComplete();
      } else {
        setProgress(next);
        setMessage(`good. next > ${sequence[next]}`);
      }
    } else {
      setProgress(0);
      setMessage('out of order. reset.');
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 text-slate-100">
      <div className="text-lg font-bold text-lime-400 mb-3">PORT SCANNER</div>
      <div className="flex flex-wrap gap-2">
        {shuffled.map((port) => (
          <button
            key={port}
            onClick={() => click(port)}
            className={`px-3 py-2 rounded-full border text-sm ${
              sequence[progress] === port ? 'border-lime-400 text-lime-300' : 'border-slate-700 text-slate-300 hover:border-cyan-400'
            }`}
          >
            {port}
          </button>
        ))}
      </div>
      <div className="mt-3 text-xs text-slate-400">{message}</div>
    </div>
  );
}
