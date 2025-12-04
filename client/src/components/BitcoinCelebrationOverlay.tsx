import React, { useEffect, useMemo, useState } from 'react';

interface Props {
  active: boolean;
  onFinished?: () => void;
  onCoinTap?: (count: number) => void;
  onDismiss?: () => void;
}

export default function BitcoinCelebrationOverlay({ active, onFinished, onCoinTap, onDismiss }: Props) {
  const [ready, setReady] = useState(false);
  const [taps, setTaps] = useState(0);

  const coins = useMemo(
    () =>
      Array.from({ length: 30 + Math.floor(Math.random() * 50) }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 1.5,
        duration: 3 + Math.random() * 2,
        size: 18 + Math.random() * 12,
      })),
    [],
  );

  useEffect(() => {
    if (!active) {
      setReady(false);
      setTaps(0);
      return;
    }
    const timer = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(timer);
  }, [active]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss?.();
    };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onDismiss]);

  if (!active) return null;

  const handleCoinClick = () => {
    if (!ready) return;
    const next = taps + 1;
    setTaps(next);
    onCoinTap?.(next);
    onFinished?.();
  };

  return (
    <div className="fixed inset-0 z-[9999] overflow-hidden pointer-events-none">
      <div className="absolute inset-0 bg-gradient-to-b from-amber-500/10 via-transparent to-black/70" />
      <button
        type="button"
        onClick={onDismiss}
        className="pointer-events-auto absolute top-4 right-4 rounded-full bg-black/60 border border-amber-300/50 text-amber-200 px-3 py-1 text-xs hover:bg-black/80 transition"
        aria-label="Close bitcoin overlay"
      >
        Close
      </button>

      {coins.map((c) => (
        <div
          key={c.id}
          className="absolute drop-shadow-[0_0_14px_rgba(251,191,36,0.8)]"
          style={{
            left: `${c.left}%`,
            fontSize: `${c.size}px`,
            animation: `coin-fall ${c.duration}s ease-in ${c.delay}s forwards`,
            top: '-12%',
            color: '#fbbf24',
          }}
        >
          ₿
        </div>
      ))}

      <div className="absolute inset-0 flex items-center justify-center">
        <button
          onClick={handleCoinClick}
          className="pointer-events-auto w-28 h-28 rounded-full bg-gradient-to-br from-[hsl(var(--primary))] via-amber-400 to-[hsl(var(--secondary))] text-5xl font-bold text-[hsl(var(--background))] shadow-[0_0_45px_rgba(251,191,36,0.8)] border-4 border-border animate-pulse hover:scale-105 transition-transform"
          aria-label="Activate bitcoin portal"
        >
          ₿
        </button>
        <div className="absolute -bottom-14 text-xs text-amber-100/80 pointer-events-none">
          Tap the coin (progress {taps}/10)
        </div>
      </div>
    </div>
  );
}


