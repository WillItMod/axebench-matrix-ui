import { useEffect, useMemo } from 'react';

interface Props {
  active: boolean;
  onFinished?: () => void;
}

export default function BitcoinCelebrationOverlay({ active, onFinished }: Props) {
  const coins = useMemo(
    () =>
      Array.from({ length: 30 }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 1.5,
        duration: 3 + Math.random() * 2,
        size: 18 + Math.random() * 12,
      })),
    []
  );

  useEffect(() => {
    if (!active) return;
    const id = setTimeout(() => onFinished?.(), 4200);
    return () => clearTimeout(id);
  }, [active, onFinished]);

  if (!active) return null;

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-amber-500/5 via-transparent to-black/60" />
      {coins.map((c) => (
        <div
          key={c.id}
          className="absolute text-amber-300 drop-shadow-[0_0_12px_rgba(251,191,36,0.8)]"
          style={{
            left: `${c.left}%`,
            fontSize: `${c.size}px`,
            animation: `coin-fall ${c.duration}s ease-in ${c.delay}s forwards`,
            top: '-10%',
          }}
        >
          ₿
        </div>
      ))}
    </div>
  );
}
