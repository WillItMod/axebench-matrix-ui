import { useMemo } from 'react';

interface Firework {
  id: number;
  left: number;
  delay: number;
  size: number;
  duration: number;
  color: string;
}

export default function FireworksOverlay({ active }: { active: boolean }) {
  const bursts = useMemo<Firework[]>(() => {
    return Array.from({ length: 14 }).map((_, i) => ({
      id: i,
      left: 6 + Math.random() * 88,
      delay: Math.random() * 0.8,
      size: 8 + Math.random() * 10,
      duration: 1.8 + Math.random() * 1.2,
      color: ['#a855f7', '#22d3ee', '#f59e0b', '#22c55e'][i % 4],
    }));
  }, []);

  if (!active) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[9998] overflow-hidden">
      {bursts.map((b) => (
        <div
          key={b.id}
          className="absolute"
          style={{
            left: `${b.left}%`,
            top: `${10 + Math.random() * 60}%`,
            animation: `firework-pop ${b.duration}s ease-out ${b.delay}s forwards`,
            opacity: 0,
          }}
        >
          <div
            className="relative"
            style={{
              width: `${b.size}px`,
              height: `${b.size}px`,
              filter: 'drop-shadow(0 0 10px rgba(255,255,255,0.6))',
            }}
          >
            {Array.from({ length: 8 }).map((_, idx) => (
              <span
                key={idx}
                className="absolute block rounded-full animate-ping"
                style={{
                  width: `${b.size}px`,
                  height: `${b.size}px`,
                  backgroundColor: b.color,
                  transform: `rotate(${idx * 45}deg) translateY(-10px)`,
                  animationDuration: `${b.duration}s`,
                  animationDelay: `${b.delay}s`,
                  opacity: 0.85,
                }}
              />
            ))}
          </div>
        </div>
      ))}
      <style>{`
        @keyframes firework-pop {
          0% { opacity: 0; transform: scale(0.7); }
          25% { opacity: 1; transform: scale(1.05); }
          60% { opacity: 0.8; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.9); }
        }
      `}</style>
    </div>
  );
}
