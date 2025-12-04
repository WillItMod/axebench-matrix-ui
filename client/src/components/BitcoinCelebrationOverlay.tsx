import React, { useMemo } from 'react';

interface Props {
  active: boolean;
  onFinished?: () => void;
}

export default function BitcoinCelebrationOverlay({ active, onFinished }: Props) {
  const coins = useMemo(
    () =>
      Array.from({ length: 50 }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 1.5,
        duration: 3 + Math.random() * 2,
        size: 18 + Math.random() * 12,
      })),
    []
  );

  if (!active) return null;

  return (
    <div className="fixed inset-0 z-[9999] overflow-hidden pointer-events-none">
      <div className="absolute inset-0 bg-gradient-to-b from-amber-500/10 via-transparent to-black/60" />
      {coins.map((c) => (
        <div
          key={c.id}
          className="absolute text-amber-300 drop-shadow-[0_0_14px_rgba(251,191,36,0.8)]"
          style={{
            left: `${c.left}%`,
            fontSize: `${c.size}px`,
            animation: `coin-fall ${c.duration}s ease-in ${c.delay}s forwards`,
            top: '-12%',
          }}
        >
          ₿
        </div>
      ))}

      <div className="absolute inset-0 flex items-center justify-center">
        <button
          onClick={onFinished}
          className="pointer-events-auto w-28 h-28 rounded-full bg-gradient-to-br from-amber-500 via-orange-500 to-yellow-400 text-5xl font-bold text-slate-900 shadow-[0_0_45px_rgba(251,191,36,0.8)] border-4 border-amber-200 animate-pulse hover:scale-105 transition-transform"
        >
          ₿
        </button>
      </div>
    </div>
  );
}
