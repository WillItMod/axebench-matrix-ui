import React from 'react';
import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { bootPixiApp } from '../shared/pixiApp';
import { palette, pickAccent } from '../shared/theme';
import { makeGameComponent } from '../GameShell';
import type { GameModule } from '../types';

type Hotspot = {
  node: Graphics;
  x: number;
  y: number;
  heat: number;
  growth: number;
};

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
    const status = new Text('Tap hotspots before they overheat.', textStyle);
    status.position.set(16, 16);
    ui.addChild(status);

    const hotspots: Hotspot[] = [];
    let stability = 100;
    let score = 0;
    let spawnTimer = 0;

    const spawn = () => {
      const width = app.canvas.width / (window.devicePixelRatio || 1);
      const height = app.canvas.height / (window.devicePixelRatio || 1);
      const node = new Graphics();
      const x = 60 + Math.random() * (width - 120);
      const y = 120 + Math.random() * (height - 200);
      const hotspot: Hotspot = { node, x, y, heat: 0.2, growth: 0.004 + Math.random() * 0.006 };
      layer.addChild(node);
      hotspots.push(hotspot);
      drawHotspot(hotspot);
    };

    const drawHotspot = (h: Hotspot) => {
      const radius = 20 + h.heat * 40;
      h.node.clear();
      const c = heatColor(h.heat);
      h.node.beginFill(c);
      h.node.drawCircle(h.x, h.y, radius);
      h.node.endFill();
      h.node.alpha = 0.4 + h.heat * 0.6;
      h.node.lineStyle({ width: 2, color: 0xffffff, alpha: 0.05 });
      h.node.drawCircle(h.x, h.y, radius + 4);
    };

    const heatColor = (heat: number) => {
      if (heat < 0.3) return 0x2af598;
      if (heat < 0.6) return 0xf6c35f;
      if (heat < 0.8) return 0xff914d;
      return 0xff5555;
    };

    const handleTap = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      let hit = false;
      for (let i = hotspots.length - 1; i >= 0; i -= 1) {
        const h = hotspots[i];
        const radius = 20 + h.heat * 40;
        const dx = x - h.x;
        const dy = y - h.y;
        if (dx * dx + dy * dy <= radius * radius) {
          h.heat = Math.max(0, h.heat - 0.35);
          drawHotspot(h);
          hit = true;
        }
      }
      if (!hit) {
        stability = Math.max(0, stability - 4);
      }
    };

    canvas.addEventListener('pointerdown', handleTap);
    track(() => canvas.removeEventListener('pointerdown', handleTap));

    const tick = () => {
      const delta = app.ticker.deltaMS / 16.666;
      spawnTimer += delta;
      if (spawnTimer > 30) {
        spawnTimer = 0;
        spawn();
      }

      hotspots.forEach((h) => {
        h.heat += h.growth * delta;
        drawHotspot(h);
      });

      for (let i = hotspots.length - 1; i >= 0; i -= 1) {
        const h = hotspots[i];
        if (h.heat >= 1) {
          stability = Math.max(0, stability - 15);
          h.node.destroy();
          hotspots.splice(i, 1);
        } else if (h.heat < 0.05) {
          score += 1.2;
          h.node.destroy();
          hotspots.splice(i, 1);
        }
      }

      if (stability <= 0) {
        hotspots.forEach((h) => h.node.destroy());
        hotspots.length = 0;
        stability = 70;
        score = Math.max(0, score - 10);
      }

      status.text = `System temp: ${(100 - stability).toFixed(0)} | Stability ${stability.toFixed(
        0,
      )} | Score ${score.toFixed(1)}`;
    };

    app.ticker.add(tick);
    track(() => app.ticker.remove(tick));
    spawn();

    return () => {
      app.stage.removeChildren();
    };
  });

const Component = makeGameComponent(startGame, {
  title: 'Fan Fury',
  description: 'Whack-a-heatmap: tap hotspots to cool miners before meltdown.',
});

const meta: GameModule = {
  id: 'fan-fury',
  title: 'Fan Fury',
  description: 'Tap-to-cool heatmap with drifting hotspots and stability meter.',
  tech: 'pixi',
  startGame,
  Component,
};

export default meta;
