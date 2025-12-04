import React from 'react';
import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { bootPixiApp } from '../shared/pixiApp';
import { palette, pickAccent } from '../shared/theme';
import { makeGameComponent } from '../GameShell';
import type { GameModule } from '../types';

type Channel = {
  label: string;
  value: number;
  targetMin: number;
  targetMax: number;
  draw: Graphics;
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export const startGame = (canvas: HTMLCanvasElement) =>
  bootPixiApp(canvas, (app, track) => {
    const layer = new Container();
    app.stage.addChild(layer);

    const ui = new Container();
    app.stage.addChild(ui);

    const textStyle = new TextStyle({
      fill: palette.white,
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 13,
      letterSpacing: 1,
    });

    const header = new Text('PSU Balancer — keep all rails stable', {
      ...textStyle,
      fill: palette.neon,
      fontSize: 15,
    });
    const status = new Text('', textStyle);
    header.position.set(16, 12);
    status.position.set(16, 34);
    ui.addChild(header, status);

    const channels: Channel[] = [];
    const count = 4;
    for (let i = 0; i < count; i += 1) {
      channels.push({
        label: `Rail ${i + 1}`,
        value: 52 + Math.random() * 6,
        targetMin: 48 + Math.random() * 4,
        targetMax: 58 + Math.random() * 5,
        draw: new Graphics(),
      });
    }

    const rails = new Container();
    layer.addChild(rails);
    channels.forEach((c) => rails.addChild(c.draw));

    let dragging: Channel | null = null;
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      const bounds = app.canvas.getBoundingClientRect();
      const y = e.clientY - bounds.top;
      const railHeight = bounds.height - 140;
      const pct = clamp(1 - (y - 80) / railHeight, 0, 1);
      dragging.value = 40 + pct * 35;
      renderRails();
    };
    const onPointerUp = () => {
      dragging = null;
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    track(() => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    });

    let stability = 100;
    let score = 0;

    const renderRails = () => {
      const width = app.canvas.width / (window.devicePixelRatio || 1);
      const height = app.canvas.height / (window.devicePixelRatio || 1);
      const railWidth = Math.min(120, width / channels.length - 18);
      const baseX = (width - (railWidth + 16) * channels.length) / 2;

      channels.forEach((c, idx) => {
        const g = c.draw;
        g.clear();
        const x = baseX + idx * (railWidth + 16);
        const top = 80;
        const railHeight = height - 160;
        const pct = (c.value - 40) / 35;
        const y = top + railHeight * (1 - pct);
        const targetMinPct = (c.targetMin - 40) / 35;
        const targetMaxPct = (c.targetMax - 40) / 35;
        const minY = top + railHeight * (1 - targetMaxPct);
        const maxY = top + railHeight * (1 - targetMinPct);

        g.lineStyle({ width: 2, color: 0x133029, alpha: 0.9 });
        g.beginFill(0x0b1612, 0.9);
        g.drawRoundedRect(x, top, railWidth, railHeight, 12);
        g.endFill();

        // Target zone
        g.beginFill(0x2af598, 0.18);
        g.drawRoundedRect(x + 6, minY, railWidth - 12, maxY - minY, 10);
        g.endFill();
        g.lineStyle({ width: 1, color: 0x2af598, alpha: 0.6 });
        g.drawRoundedRect(x + 6, minY, railWidth - 12, maxY - minY, 10);

        // Current value bar
        const accent = pickAccent(idx);
        g.lineStyle({ width: 2, color: accent, alpha: 0.8 });
        g.beginFill(accent, 0.35);
        g.drawRoundedRect(x + 12, y - 10, railWidth - 24, 20, 8);
        g.endFill();
        g.beginFill(accent, 0.8);
        g.drawCircle(x + railWidth / 2, y, 9);
        g.endFill();

        // Label
        g.lineStyle({ width: 0 });
        g.beginFill(0x0c1914, 0.8);
        g.drawRoundedRect(x, top - 36, railWidth, 24, 10);
        g.endFill();
        g.lineStyle({ width: 1, color: accent, alpha: 0.6 });
        g.drawRoundedRect(x, top - 36, railWidth, 24, 10);
        g.endFill();
      });
    };

    channels.forEach((c) => {
      c.draw.eventMode = 'static';
      c.draw.cursor = 'ns-resize';
      c.draw.on('pointerdown', () => {
        dragging = c;
      });
    });

    const tick = () => {
      const delta = app.ticker.deltaMS / 16.666;
      // Drift target ranges a bit
      channels.forEach((c) => {
        c.targetMin = clamp(c.targetMin + (Math.random() - 0.5) * 0.08, 45, 55);
        c.targetMax = clamp(c.targetMax + (Math.random() - 0.5) * 0.08, 55, 65);
        // Random spikes
        if (Math.random() < 0.003) {
          c.targetMax += 4;
          c.targetMin += 4;
        }
      });

      const violations = channels.filter((c) => c.value < c.targetMin || c.value > c.targetMax).length;
      if (violations === 0) {
        stability = clamp(stability + delta * 0.6, 0, 100);
        score += delta * 1.4;
      } else {
        stability = clamp(stability - delta * violations * 1.8, 0, 100);
      }

      if (stability <= 0) {
        stability = 60;
        score = Math.max(0, score - 10);
      }

      status.text = `Stability: ${stability.toFixed(0)} | Score: ${score.toFixed(1)}`;
      renderRails();
    };

    app.ticker.add(tick);
    track(() => app.ticker.remove(tick));
    renderRails();

    return () => {
      app.stage.removeChildren();
    };
  });

const Component = makeGameComponent(startGame, {
  title: 'PSU Balancer',
  description: 'Drag rails to keep every miner inside safe power envelopes.',
});

const meta: GameModule = {
  id: 'psu-balancer',
  title: 'PSU Balancer',
  description: 'Reactive rail tuning with drifting safe zones and stability scoring.',
  tech: 'pixi',
  startGame,
  Component,
};

export default meta;
