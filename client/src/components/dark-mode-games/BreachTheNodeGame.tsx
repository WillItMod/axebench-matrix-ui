import { FormEvent, useState } from 'react';
import type { DarkMiniGameProps } from './CrackTheHashGame';

const steps = [
  'scan -net --entropy',
  'inject --probe-clock',
  'unlock --matrix-core',
];

export default function BreachTheNodeGame({ onComplete }: DarkMiniGameProps) {
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState('');
  const [log, setLog] = useState<string[]>(['root@axebench:~# awaiting commands...']);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const cmd = input.trim();
    if (!cmd) return;
    if (cmd === steps[index]) {
      const next = index + 1;
      const newLog = [...log, `root@axebench:~# ${cmd}`, `[OK] step ${next}/3 accepted`];
      setLog(newLog);
      setInput('');
      setIndex(next);
      if (next === steps.length) {
        setLog([...newLog, '[ACCESS GRANTED] MATRIX CORE ONLINE']);
        onComplete();
      }
    } else {
      setLog((l) => [...l, `root@axebench:~# ${cmd}`, '[ERR] bad opcode, try again']);
      setInput('');
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 text-slate-100">
      <div className="text-lg font-bold text-lime-400 mb-3">BREACH THE NODE</div>
      <div className="h-40 overflow-auto bg-slate-950/80 border border-slate-800 rounded p-3 text-xs font-mono space-y-1">
        {log.map((line, i) => (
          <div key={i} className={line.includes('ERR') ? 'text-red-400' : line.includes('OK') || line.includes('ACCESS') ? 'text-lime-300' : 'text-slate-300'}>
            {line}
          </div>
        ))}
      </div>
      <form onSubmit={submit} className="mt-3">
        <div className="flex items-center gap-2 font-mono text-sm">
          <span className="text-lime-400">root@axebench:~#</span>
          <input
            className="flex-1 bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-100 focus:border-lime-400 focus:ring-2 focus:ring-lime-400/40"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoFocus
          />
        </div>
      </form>
      <div className="mt-2 text-xs text-slate-500">commands needed: {steps[index] ? steps[index] : 'completed'}</div>
    </div>
  );
}
