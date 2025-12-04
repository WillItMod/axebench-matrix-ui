import { useEffect, useMemo, useState } from 'react';
import type { DarkMiniGameProps } from './CrackTheHashGame';

type Service = { name: string; health: number };

export default function UptimeKeeperGame({ onComplete }: DarkMiniGameProps) {
  const [services, setServices] = useState<Service[]>([
    { name: 'AxeBench API', health: 100 },
    { name: 'Pool Proxy', health: 100 },
    { name: 'PSU Daemon', health: 100 },
    { name: 'Scheduler', health: 100 },
  ]);
  const [timer, setTimer] = useState(0);
  const duration = 15;
  const decay = useMemo(() => Math.random() * 1.5 + 0.8, []);

  useEffect(() => {
    const id = setInterval(() => {
      setServices((prev) =>
        prev.map((s) => ({ ...s, health: Math.max(0, s.health - decay) })),
      );
      setTimer((t) => t + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [decay]);

  useEffect(() => {
    if (services.some((s) => s.health <= 0)) {
      setTimer(0);
      setServices((prev) => prev.map((s) => ({ ...s, health: 100 })));
    } else if (timer >= duration) {
      onComplete();
    }
  }, [services, timer, duration, onComplete]);

  const restart = (name: string) => {
    setServices((prev) =>
      prev.map((s) => (s.name === name ? { ...s, health: 100 } : s)),
    );
  };

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 text-slate-100">
      <div className="text-lg font-bold text-lime-400 mb-3">UPTIME KEEPER</div>
      <div className="text-xs text-slate-400 mb-3">Keep all services alive for {duration}s.</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {services.map((s) => (
          <div key={s.name} className="bg-slate-950 border border-slate-800 rounded p-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-300">{s.name}</span>
              <span className="text-slate-400">{Math.round(s.health)}%</span>
            </div>
            <div className="h-2 bg-slate-800 rounded overflow-hidden">
              <div
                className={`h-full transition-all ${s.health > 60 ? 'bg-lime-400' : s.health > 30 ? 'bg-amber-400' : 'bg-red-500'}`}
                style={{ width: `${s.health}%` }}
              />
            </div>
            <button onClick={() => restart(s.name)} className="w-full text-xs py-1 border border-slate-700 rounded hover:border-cyan-400">
              RESTART
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 text-xs text-slate-400">Timer: <span className="text-lime-300 font-bold">{timer}s</span></div>
    </div>
  );
}
