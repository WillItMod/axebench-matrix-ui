import React from 'react';
import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { bootPixiApp } from '../shared/pixiApp';
import { palette } from '../shared/theme';
import { makeGameComponent } from '../GameShell';
import type { GameModule } from '../types';

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

    const header = new Text('Voltage Surge — time your tap', {
      ...textStyle,
      fill: palette.neon,
      fontSize: 15,
    });
    const info = new Text('Tap when the needle crosses the green band.', textStyle);
    const streakText = new Text('', textStyle);
    header.position.set(16, 12);
    info.position.set(16, 34);
    streakText.position.set(16, 56);
    ui.addChild(header, info, streakText);

    const gauge = new Graphics();
    const needle = new Graphics();
    layer.addChild(gauge, needle);

    let round = 1;
    let streak = 0;
    let lives = 3;
    let speed = 0.022;
    let phase = 0;
    let lastAccuracy = '';

    const center = () => {
      const width = app.canvas.width / (window.devicePixelRatio || 1);
      const height = app.canvas.height / (window.devicePixelRatio || 1);
      return { x: width / 2, y: height * 0.65 };
    };

    const drawGauge = () => {
      gauge.clear();
      const { x, y } = center();
      const radius = Math.min(x, y) * 0.8;
      const start = Math.PI;
      const end = 2 * Math.PI;

      const arc = (from: number, to: number, color: number, width = 16, alpha = 0.6) => {
        gauge.lineStyle({ width, color, alpha, cap: 'round' });
        gauge.arc(x, y, radius, from, to);
      };

      arc(start, start + (end - start) * 0.2, 0xff5555, 18, 0.35);
      arc(start + (end - start) * 0.2, start + (end - start) * 0.45, 0xf6c35f, 18, 0.4);
      arc(start + (end - start) * 0.45, start + (end - start) * 0.55, 0x2af598, 22, 0.7);
      arc(start + (end - start) * 0.55, start + (end - start) * 0.8, 0xf6c35f, 18, 0.4);
      arc(start + (end - start) * 0.8, end, 0xff5555, 18, 0.35);

      gauge.lineStyle({ width: 2, color: 0x2af598, alpha: 0.5 });
      gauge.drawCircle(x, y, radius + 8);
    };

    const drawNeedle = (angle: number) => {
      needle.clear();
      const { x, y } = center();
      const radius = Math.min(x, y) * 0.78;
      needle.lineStyle({ width: 4, color: 0x6efacb });
      needle.moveTo(x, y);
      needle.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
      needle.beginFill(0x2af598);
      needle.drawCircle(x, y, 10);
      needle.endFill();
    };

    const evaluate = (angle: number) => {
      const norm = (angle - Math.PI) / Math.PI; // 0 to 1
      const distance = Math.abs(norm - 0.5);
      if (distance < 0.05) {
        streak += 1;
        round += 1;
        speed += 0.003;
        lastAccuracy = 'Perfect';
      } else if (distance < 0.12) {
        streak = Math.max(0, streak);
        round += 1;
        lastAccuracy = 'Good';
      } else {
        streak = 0;
        lives -= 1;
        lastAccuracy = 'Miss';
        if (lives <= 0) {
          round = 1;
          speed = 0.022;
          lives = 3;
        }
      }
      streakText.text = `Round ${round} | Streak ${streak} | Lives ${lives} | ${lastAccuracy}`;
    };

    const click = () => evaluate(Math.PI + Math.sin(phase) * Math.PI * 0.5);
    canvas.addEventListener('pointerdown', click);
    track(() => canvas.removeEventListener('pointerdown', click));

    const tick = () => {
      phase += speed * app.ticker.deltaMS;
      const angle = Math.PI + Math.sin(phase) * Math.PI * 0.5;
      drawGauge();
      drawNeedle(angle);
    };

    app.ticker.add(tick);
    track(() => app.ticker.remove(tick));
    drawGauge();
    streakText.text = 'Round 1 | Streak 0 | Lives 3';

    return () => {
      app.stage.removeChildren();
    };
  });

const Component = makeGameComponent(startGame, {
  title: 'Voltage Surge',
  description: 'Tap when the voltage needle sweeps the green window. Faster each round.',
});

const meta: GameModule = {
  id: 'voltage-surge',
  title: 'Voltage Surge',
  description: 'Timing gauge with escalating speed and combo streaks.',
  tech: 'pixi',
  startGame,
  Component,
};

export default meta;
