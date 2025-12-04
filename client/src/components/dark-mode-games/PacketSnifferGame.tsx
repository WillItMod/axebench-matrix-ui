import type { DarkMiniGameProps } from './CrackTheHashGame';
import { useMemo, useState } from 'react';

const packets = ['AF 1C 9D', '00 13 37', 'C0 FF EE', 'DE AD BE', 'BA AD F0', '42 42 42'];

export default function PacketSnifferGame({ onComplete }: DarkMiniGameProps) {
  const suspicious = useMemo(() => Math.floor(Math.random() * packets.length), []);
  const [status, setStatus] = useState<string>('');

  const click = (idx: number) => {
    if (idx === suspicious) {
      setStatus('[OK] suspicious beacon isolated');
      onComplete();
    } else {
      setStatus('benign traffic');
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 text-slate-100">
      <div className="text-lg font-bold text-lime-400 mb-3">PACKET SNIFFER</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {packets.map((p, idx) => (
          <button
            key={p + idx}
            onClick={() => click(idx)}
            className={`px-3 py-2 rounded border text-left font-mono text-sm ${
              idx === suspicious && status ? 'border-lime-400 text-lime-300' : 'border-slate-700 text-slate-300 hover:border-cyan-400'
            }`}
          >
            {p}
          </button>
        ))}
      </div>
      <div className="mt-3 text-xs text-slate-400">{status || 'Find the suspicious packet.'}</div>
    </div>
  );
}
