import React, { useEffect, useRef } from 'react';

type GameFrameProps = {
  title?: string;
  description?: string;
  start: (canvas: HTMLCanvasElement) => void | (() => void);
  footerContent?: React.ReactNode;
};

/**
 * Shared wrapper for PixiJS / BabylonJS canvases.
 * - Mounts a single canvas.
 * - Invokes the provided start() exactly once with that canvas.
 * - Runs the returned cleanup on unmount to dispose engines, listeners, etc.
 */
export const GameFrame: React.FC<GameFrameProps> = ({
  title,
  description,
  start,
  footerContent,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cleanupRef = useRef<void | (() => void)>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    // Ensure the canvas uses device-pixel ratio while letting the caller manage resizing logic.
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };

    resize();
    window.addEventListener('resize', resize);

    cleanupRef.current = start(canvas);

    return () => {
      window.removeEventListener('resize', resize);
      if (typeof cleanupRef.current === 'function') {
        cleanupRef.current();
      }
      cleanupRef.current = undefined;
    };
  }, [start]);

  return (
    <div className="relative flex flex-col gap-3 rounded-2xl border border-emerald-400/40 bg-neutral-900/70 p-4 shadow-[0_0_30px_rgba(16,185,129,0.25)] backdrop-blur">
      {(title || description) && (
        <div className="space-y-1">
          {title && (
            <h2 className="text-lg font-semibold uppercase tracking-[0.2em] text-emerald-300 drop-shadow-[0_0_10px_rgba(16,185,129,0.45)]">
              {title}
            </h2>
          )}
          {description && (
            <p className="text-sm text-emerald-100/80">{description}</p>
          )}
        </div>
      )}

      <div className="relative overflow-hidden rounded-xl border border-emerald-500/30 bg-gradient-to-br from-neutral-950 via-neutral-900 to-black">
        <canvas ref={canvasRef} className="h-[420px] w-full" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(34,197,94,0.08),transparent_35%),radial-gradient(circle_at_80%_30%,rgba(56,189,248,0.08),transparent_35%),linear-gradient(135deg,rgba(16,185,129,0.04),rgba(14,116,144,0.02))]" />
      </div>

      {footerContent && (
        <div className="mt-1 flex items-center justify-between rounded-lg border border-emerald-500/20 bg-neutral-900/60 px-3 py-2 text-emerald-100/80">
          {footerContent}
        </div>
      )}
    </div>
  );
};

export default GameFrame;
