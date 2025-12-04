import React from 'react';
import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { bootPixiApp } from '../shared/pixiApp';
import { palette, pickAccent } from '../shared/theme';
import { makeGameComponent } from '../GameShell';
import type { GameModule } from '../types';

type Particle = {
  node: Graphics;
  vx: number;
  vy: number;
  danger: boolean;
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

    const scoreText = new Text('Score: 0', textStyle);
    const bestText = new Text('Best: 0', textStyle);
    scoreText.position.set(16, 12);
    bestText.position.set(16, 32);
    ui.addChild(scoreText, bestText);

    const player = new Graphics();
    player.beginFill(0x2af598);
    player.drawCircle(0, 0, 10);
    player.endFill();
    player.lineStyle({ width: 2, color: 0x6efacb, alpha: 0.7 });
    player.drawCircle(0, 0, 14);
    player.x = 200;
    player.y = 220;
    layer.addChild(player);

    const particles: Particle[] = [];
    let spawnTimer = 0;
    let spawnDelay = 26;
    let score = 0;
    let best = 0;
    let alive = true;

    const keys = new Set<string>();
    const handleDown = (e: KeyboardEvent) => keys.add(e.key.toLowerCase());
    const handleUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', handleDown);
    window.addEventListener('keyup', handleUp);
    track(() => {
      window.removeEventListener('keydown', handleDown);
      window.removeEventListener('keyup', handleUp);
    });

    const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

    const spawnParticle = () => {
      const danger = Math.random() < 0.35;
      const g = new Graphics();
      const size = danger ? 10 + Math.random() * 8 : 6 + Math.random() * 6;
      g.beginFill(danger ? 0xff6b6b : pickAccent(particles.length));
      g.drawRoundedRect(-size / 2, -size / 2, size, size, 3);
      g.endFill();
      g.alpha = danger ? 0.9 : 0.6;
      g.x = Math.random() * (app.canvas.width / (window.devicePixelRatio || 1));
      g.y = -size;
      layer.addChild(g);

      const particle: Particle = {
        node: g,
        vx: (Math.random() - 0.5) * (danger ? 2 : 1.2),
        vy: (2 + Math.random() * 2.5) * (danger ? 1.15 : 1),
        danger,
      };
      particles.push(particle);
    };

    const reset = () => {
      particles.forEach((p) => p.node.destroy());
      particles.length = 0;
      spawnTimer = 0;
      spawnDelay = 26;
      score = 0;
      alive = true;
      player.position.set(
        (app.canvas.width / (window.devicePixelRatio || 1)) / 2,
        (app.canvas.height / (window.devicePixelRatio || 1)) - 60,
      );
    };

    const updateScore = () => {
      scoreText.text = `Score: ${Math.floor(score)}`;
      bestText.text = `Best: ${Math.floor(best)}`;
    };

    const handleHit = () => {
      alive = false;
      best = Math.max(best, score);
      updateScore();
      player.tint = 0xff5555;
      setTimeout(reset, 650);
    };

    app.ticker.add(() => {
      const delta = app.ticker.deltaMS / 16.666;
      if (alive) {
        score += delta * 0.75;
        spawnTimer += delta;
        spawnDelay = Math.max(8, spawnDelay - delta * 0.003);
        if (spawnTimer >= spawnDelay) {
          spawnTimer = 0;
          spawnParticle();
        }
      }

      // Move player
      const speed = 4.4;
      const width = app.canvas.width / (window.devicePixelRatio || 1);
      const height = app.canvas.height / (window.devicePixelRatio || 1);
      let vx = 0;
      let vy = 0;
      if (keys.has('arrowleft') || keys.has('a')) vx -= speed;
      if (keys.has('arrowright') || keys.has('d')) vx += speed;
      if (keys.has('arrowup') || keys.has('w')) vy -= speed;
      if (keys.has('arrowdown') || keys.has('s')) vy += speed;
      player.x = clamp(player.x + vx * delta, 14, width - 14);
      player.y = clamp(player.y + vy * delta, 14, height - 14);

      // Update particles
      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const p = particles[i];
        p.node.x += p.vx * delta;
        p.node.y += p.vy * delta;

        if (p.node.y > height + 40) {
          p.node.destroy();
          particles.splice(i, 1);
          continue;
        }

        const dx = p.node.x - player.x;
        const dy = p.node.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 16 && p.danger && alive) {
          handleHit();
        }
      }

      updateScore();
    });

    reset();

    return () => {
      app.stage.removeChildren();
    };
  });

const Component = makeGameComponent(startGame, {
  title: 'Hashrate Dodger',
  description: 'Dodge corrupted hash streams; survive to push the uptime score higher.',
});

const meta: GameModule = {
  id: 'hashrate-dodger',
  title: 'Hashrate Dodger',
  description: 'Reactive dodger with neon hash particles and survival scoring.',
  tech: 'pixi',
  startGame,
  Component,
};

export default meta;
