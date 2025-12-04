import React from 'react';
import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { bootPixiApp } from '../shared/pixiApp';
import { palette, pickAccent } from '../shared/theme';
import { makeGameComponent } from '../GameShell';
import type { GameModule } from '../types';

type Block = {
  width: number;
  x: number;
  y: number;
  gfx: Graphics;
};

export const startGame = (canvas: HTMLCanvasElement) =>
  bootPixiApp(canvas, (app, track) => {
    const stage = new Container();
    app.stage.addChild(stage);

    const ui = new Container();
    app.stage.addChild(ui);

    const textStyle = new TextStyle({
      fill: palette.white,
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 13,
      letterSpacing: 1,
    });
    const header = new Text('Blockbuilder — stack aligned hashes', {
      ...textStyle,
      fill: palette.neon,
      fontSize: 15,
    });
    const status = new Text('Click or press space to drop.', textStyle);
    header.position.set(16, 12);
    status.position.set(16, 34);
    ui.addChild(header, status);

    const blocks: Block[] = [];
    let current: Block | null = null;
    let speed = 2.6;
    let direction = 1;
    let best = 0;
    let heightScore = 0;

    const groundY = () => (app.canvas.height / (window.devicePixelRatio || 1)) - 80;

    const createBlock = (width: number, x: number, y: number) => {
      const gfx = new Graphics();
      stage.addChild(gfx);
      const block: Block = { width, x, y, gfx };
      drawBlock(block, 0);
      return block;
    };

    const drawBlock = (block: Block, glow = 0) => {
      const accent = pickAccent(blocks.length);
      block.gfx.clear();
      block.gfx.lineStyle({ width: 2, color: 0x0d1512, alpha: 0.8 });
      block.gfx.beginFill(accent, 0.6);
      block.gfx.drawRoundedRect(block.x - block.width / 2, block.y - 18, block.width, 36, 8);
      block.gfx.endFill();
      if (glow > 0) {
        block.gfx.lineStyle({ width: 3, color: accent, alpha: 0.5 });
        block.gfx.drawRoundedRect(
          block.x - block.width / 2 - glow,
          block.y - 18 - glow,
          block.width + glow * 2,
          36 + glow * 2,
          10,
        );
      }
    };

    const reset = () => {
      stage.removeChildren();
      blocks.length = 0;
      speed = 2.6;
      direction = 1;
      heightScore = 0;
      const base = createBlock(220, (app.canvas.width / (window.devicePixelRatio || 1)) / 2, groundY());
      blocks.push(base);
      spawnBlock();
    };

    const spawnBlock = () => {
      const prev = blocks[blocks.length - 1];
      const width = Math.max(60, prev.width - Math.random() * 16);
      const y = prev.y - 36;
      const startX = prev.x - 160;
      current = createBlock(width, startX, y);
      direction = 1;
      speed = Math.min(6, speed + 0.12);
      drawBlock(current, 6);
    };

    const drop = () => {
      if (!current) return;
      const prev = blocks[blocks.length - 1];
      const overlap = prev.width / 2 + current.width / 2 - Math.abs(current.x - prev.x);
      if (overlap <= 0) {
        status.text = 'Misaligned! Stack resets.';
        best = Math.max(best, heightScore);
        setTimeout(reset, 600);
        return;
      }
      const newWidth = Math.max(30, overlap * 2);
      current.width = newWidth;
      current.x = (current.x + prev.x) / 2;
      drawBlock(current, 3);
      blocks.push(current);
      current = null;
      heightScore = blocks.length - 1;
      best = Math.max(best, heightScore);
      status.text = `Height ${heightScore} | Best ${best}`;
      spawnBlock();
    };

    const click = () => drop();
    canvas.addEventListener('pointerdown', click);
    track(() => canvas.removeEventListener('pointerdown', click));

    const keydown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        drop();
      }
    };
    window.addEventListener('keydown', keydown);
    track(() => window.removeEventListener('keydown', keydown));

    const tick = () => {
      if (!current) return;
      const width = app.canvas.width / (window.devicePixelRatio || 1);
      current.x += direction * speed;
      if (current.x > width - current.width / 2 - 12) {
        current.x = width - current.width / 2 - 12;
        direction = -1;
      } else if (current.x < current.width / 2 + 12) {
        current.x = current.width / 2 + 12;
        direction = 1;
      }
      drawBlock(current, 6);
    };

    app.ticker.add(tick);
    track(() => app.ticker.remove(tick));
    reset();

    return () => {
      app.stage.removeChildren();
    };
  });

const Component = makeGameComponent(startGame, {
  title: 'Blockbuilder',
  description: 'Drop moving data blocks; only overlaps survive. Climb the chain.',
});

const meta: GameModule = {
  id: 'blockbuilder',
  title: 'Blockbuilder',
  description: 'Stacker arcade with shrinking blocks and neon chain vibes.',
  tech: 'pixi',
  startGame,
  Component,
};

export default meta;
