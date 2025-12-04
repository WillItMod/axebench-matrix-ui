import { useEffect, useRef } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useSettings } from '@/contexts/SettingsContext';

/**
 * MatrixBackground
 * Base green rain is untouched. When theme === "forge", a secondary
 * lava/gold overlay (hash/BTC rain + slow block columns) is drawn above it,
 * still behind the UI. Brightness is controlled by the existing
 * --matrix-brightness variable.
 */
export default function MatrixBackground() {
  const { theme, matrixRainbow } = useTheme();
  const { reduceMotion, pauseMatrix } = useSettings();
  const baseRef = useRef<HTMLCanvasElement>(null);
  const forgeRef = useRef<HTMLCanvasElement>(null);

  // Base Matrix rain (unchanged)
  useEffect(() => {
    if (pauseMatrix) return;

    const canvas = baseRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const fontSize = 14;
    const columns = Math.floor(canvas.width / fontSize);
    const drops: number[] = Array(columns).fill(1);

    // Keep the original glyph set
    const chars =
      '‹«с‹«э‹«ь‹«п‹«ж‹«ф‹«ъ‹«ч‹«ы‹«§‹«Ї‹«¬‹««‹«у‹«Ё‹у?‹у?‹у\'‹уџ‹у"‹у.‹уЕ‹уО‹у^‹у%‹уS‹у<‹уO‹у?‹уZ‹у?‹у?‹у\'‹у\'‹у"‹у"‹у‹у-‹у-‹у~‹уT‹уs‹у>‹уo‹«Э‹у?0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    const draw = () => {
      const now = performance.now();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const styles = getComputedStyle(document.documentElement);
      const codeColor = styles.getPropertyValue('--matrix-green').trim() || '#00ff41';
      const alpha = Math.min(Math.max(parseFloat(styles.getPropertyValue('--matrix-brightness')) || 1, 0.2), 1.2);
      ctx.globalAlpha = alpha;
      ctx.font = `${fontSize}px monospace`;

      for (let i = 0; i < drops.length; i++) {
        const char = chars[Math.floor(Math.random() * chars.length)];
        const x = i * fontSize;
        const y = drops[i] * fontSize;

        if (matrixRainbow) {
          const hue = (now * 0.05 + i * 12) % 360;
          ctx.fillStyle = `hsl(${hue}, 90%, 60%)`;
        } else {
          ctx.fillStyle = codeColor;
        }
        ctx.fillText(char, x, y);

        if (y > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
    };

    const interval = setInterval(draw, reduceMotion ? 90 : 50);
    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', resize);
    };
  }, [matrixRainbow, reduceMotion, pauseMatrix]);

  // Forge overlay (hash/BTC rain + block columns)
  useEffect(() => {
    if (pauseMatrix) return;

    const canvas = forgeRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf: number | null = null;
    let last = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    type Glyph = { x: number; y: number; speed: number; text: string; color: string; size: number };
    type BlockColumn = {
      x: number;
      y: number;
      speed: number;
      rows: string[];
      locked: boolean;
      lockTime: number;
      fade: number;
    };

    const glyphs: Glyph[] = [];
    const columns: BlockColumn[] = [];
    const baseGlyphs = ['₿', '#', '0000', 'a3f2', 'deadbeef', 'f9be', 'c0ff', 'e1', 'b10c', '#820123', '#820124'];
    const gold = 'rgba(250,204,21,0.6)';
    const lava = 'rgba(249,115,22,0.45)';

    const addGlyph = (activity: number) => {
      glyphs.push({
        x: Math.random() * canvas.width,
        y: -30,
        speed: (60 + Math.random() * 120 + activity * 40) * (reduceMotion ? 0.6 : 1),
        text: baseGlyphs[Math.floor(Math.random() * baseGlyphs.length)],
        color: Math.random() > 0.15 ? lava : gold,
        size: 12 + Math.random() * 6,
      });
    };

    const addBlock = (activity: number) => {
      if (columns.length >= 3) return;
      const rowsCount = 4 + Math.floor(Math.random() * 4);
      const rows = Array.from({ length: rowsCount }, () => baseGlyphs[Math.floor(Math.random() * baseGlyphs.length)]);
      columns.push({
        x: Math.random() * canvas.width,
        y: -rowsCount * 16,
        speed: (40 + Math.random() * 40 + activity * 30) * (reduceMotion ? 0.55 : 1),
        rows,
        locked: false,
        lockTime: 0,
        fade: 1,
      });
    };

    const step = (time: number) => {
      const delta = last ? (time - last) / 1000 : 0;
      last = time;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const styles = getComputedStyle(document.documentElement);
      const brightness = Math.min(Math.max(parseFloat(styles.getPropertyValue('--matrix-brightness')) || 1, 0.2), 1.2);
      const activity = 0.5 + 0.3 * Math.sin(time / 1500);

      const targetCount = Math.floor((canvas.width / 140) * (0.6 + activity * 0.6));
      while (glyphs.length < targetCount) addGlyph(activity);
      glyphs.forEach((g) => {
        g.y += g.speed * delta;
      });
      for (let i = glyphs.length - 1; i >= 0; i--) {
        if (glyphs[i].y > canvas.height + 40) glyphs.splice(i, 1);
      }

      glyphs.forEach((g) => {
        ctx.globalAlpha = 0.7 * brightness;
        ctx.fillStyle = g.color;
        ctx.font = `${g.size}px 'Share Tech Mono', 'Consolas', monospace`;
        ctx.fillText(g.text, g.x, g.y);
      });

      if (Math.random() < 0.01 + activity * 0.005) addBlock(activity);

      columns.forEach((c) => {
        if (!c.locked) {
          c.y += c.speed * delta;
          if (c.y + c.rows.length * 16 >= canvas.height * 0.85) {
            c.locked = true;
            c.lockTime = time;
          }
        } else {
          const elapsed = time - c.lockTime;
          if (elapsed > 500) {
            c.fade = Math.max(0, 1 - (elapsed - 500) / 2000);
          }
        }
      });
      for (let i = columns.length - 1; i >= 0; i--) {
        if (columns[i].fade <= 0) columns.splice(i, 1);
      }

      columns.forEach((c) => {
        ctx.globalAlpha = brightness * c.fade;
        ctx.fillStyle = c.locked ? gold : lava;
        ctx.font = `14px 'Share Tech Mono', 'Consolas', monospace`;
        c.rows.forEach((row, idx) => {
          const y = c.y + idx * 16;
          ctx.fillText(row, c.x, y);
          if (c.locked && idx === c.rows.length - 1) {
            ctx.save();
            ctx.globalAlpha = brightness * c.fade * 0.8;
            ctx.shadowColor = c.locked ? 'rgba(250,204,21,0.5)' : 'rgba(249,115,22,0.4)';
            ctx.shadowBlur = 12;
            ctx.fillText(row, c.x, y);
            ctx.restore();
          }
        });
      });

      raf = requestAnimationFrame(step);
    };

    if (theme === 'forge') {
      raf = requestAnimationFrame(step);
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [theme, reduceMotion, pauseMatrix]);

  if (pauseMatrix) {
    return null;
  }

  return (
    <>
      <div className="fixed inset-0 animated-grid opacity-30 pointer-events-none z-0" />
      <canvas
        ref={baseRef}
        className="fixed inset-0 pointer-events-none z-0"
        style={{ opacity: 'var(--matrix-brightness, 0.8)' }}
      />
      <canvas
        ref={forgeRef}
        className="fixed inset-0 pointer-events-none z-0"
        style={{ opacity: theme === 'forge' ? 'var(--matrix-brightness, 0.8)' : 0, transition: 'opacity 0.4s ease' }}
      />
    </>
  );
}
