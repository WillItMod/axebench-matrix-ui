import React from 'react';
import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { bootPixiApp } from '../shared/pixiApp';
import { palette, pickAccent } from '../shared/theme';
import { makeGameComponent } from '../GameShell';
import type { GameModule } from '../types';

type Signal = { label: string; key: string; color: number };

const signals: Signal[] = [
  { label: 'Overclock', key: 'w', color: 0x2af598 },
  { label: 'Rebalance', key: 'a', color: 0x3ad5ff },
  { label: 'Underclock', key: 's', color: 0xf6c35f },
  { label: 'Abort', key: 'd', color: 0xff5555 },
];

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
    const status = new Text('Hit the correct key when the signal appears.', textStyle);
    status.position.set(16, 16);
    ui.addChild(status);

    const glyph = new Graphics();
    const label = new Text('', {
      ...textStyle,
      fontSize: 18,
      fill: palette.neon,
      letterSpacing: 3,
    });
    layer.addChild(glyph, label);

    let current: Signal = signals[0];
    let startedAt = performance.now();
    let timeLimit = 1600;
    let round = 1;
    let reactions: number[] = [];
    let misses = 0;
    let active = true;

    const center = () => {
      const width = app.canvas.width / (window.devicePixelRatio || 1);
      const height = app.canvas.height / (window.devicePixelRatio || 1);
      return { x: width / 2, y: height / 2 + 20 };
    };

    const setSignal = () => {
      current = signals[Math.floor(Math.random() * signals.length)];
      startedAt = performance.now();
      timeLimit = Math.max(600, 1600 - round * 18);
      active = true;
      render();
    };

    const render = () => {
      const { x, y } = center();
      glyph.clear();
      glyph.lineStyle({ width: 4, color: current.color, alpha: 0.8 });
      glyph.beginFill(current.color, 0.12);
      glyph.drawPolygon([
        x - 90,
        y,
        x,
        y - 90,
        x + 90,
        y,
        x,
        y + 90,
      ]);
      glyph.endFill();
      glyph.lineStyle({ width: 1, color: 0xffffff, alpha: 0.1 });
      glyph.drawCircle(x, y, 110);
      label.text = `${current.label}\n[${current.key.toUpperCase()}]`;
      label.position.set(x - label.width / 2, y - label.height / 2);
    };

    const handleInput = (key: string) => {
      if (!active) return;
      const now = performance.now();
      const reaction = now - startedAt;
      if (key === current.key) {
        reactions.push(reaction);
        round += 1;
        active = false;
        status.text = `Reaction ${reaction.toFixed(0)}ms | Avg ${
          reactions.reduce((a, b) => a + b, 0) / reactions.length
        }ms | Misses ${misses}`;
        setTimeout(setSignal, 400);
      } else {
        misses += 1;
        status.text = `Wrong key! Misses ${misses}`;
      }
    };

    const keydown = (e: KeyboardEvent) => handleInput(e.key.toLowerCase());
    window.addEventListener('keydown', keydown);
    track(() => window.removeEventListener('keydown', keydown));

    const tick = () => {
      if (!active) return;
      const now = performance.now();
      if (now - startedAt > timeLimit) {
        misses += 1;
        active = false;
        status.text = `Too slow! Misses ${misses}`;
        setTimeout(setSignal, 400);
      }
    };

    app.ticker.add(tick);
    track(() => app.ticker.remove(tick));
    setSignal();

    return () => {
      app.stage.removeChildren();
    };
  });

const Component = makeGameComponent(startGame, {
  title: 'NanoTune Reflex',
  description: 'Reaction test for rapid tuning calls. Hit the mapped key instantly.',
});

const meta: GameModule = {
  id: 'nano-tune-reflex',
  title: 'NanoTune Reflex',
  description: 'Rapid reaction tuner with shrinking windows and average reaction tracking.',
  tech: 'pixi',
  startGame,
  Component,
};

export default meta;
