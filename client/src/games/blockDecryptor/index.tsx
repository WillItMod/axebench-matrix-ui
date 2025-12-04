import React from 'react';
import { Container, Graphics, Rectangle, Text, TextStyle } from 'pixi.js';
import { bootPixiApp } from '../shared/pixiApp';
import { palette, pickAccent } from '../shared/theme';
import { makeGameComponent } from '../GameShell';
import type { GameModule } from '../types';

type Tile = {
  idx: number;
  rotation: number;
  target: number;
  graphics: Graphics;
};

const gridOrders = [3, 4, 5];

export const startGame = (canvas: HTMLCanvasElement) =>
  bootPixiApp(canvas, (app) => {
    const stage = new Container();
    app.stage.addChild(stage);

    const ui = new Container();
    stage.addChild(ui);

    const headerStyle = new TextStyle({
      fill: palette.neon,
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 16,
      letterSpacing: 2,
    });

    const bodyStyle = new TextStyle({
      fill: palette.white,
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 13,
      letterSpacing: 1,
    });

    const title = new Text('Block Decryptor', headerStyle);
    const status = new Text('Rotate runes to align the chain.', bodyStyle);
    const progress = new Text('', bodyStyle);
    ui.addChild(title, status, progress);
    title.position.set(18, 12);
    status.position.set(18, 36);
    progress.position.set(18, 58);

    let orderIndex = 0;
    let tiles: Tile[] = [];
    let boardSize = 3;
    let correct = 0;

    const board = new Container();
    stage.addChild(board);

    const drawTiles = () => {
      board.removeChildren();
      tiles = [];
      const width = app.canvas.width / (window.devicePixelRatio || 1);
      const height = app.canvas.height / (window.devicePixelRatio || 1);
      const padding = 42;
      const size = Math.min(width, height) - padding * 2;
      const cell = size / boardSize;
      board.position.set((width - size) / 2, (height - size) / 2 + 12);
      board.hitArea = new Rectangle(0, 0, size, size);
      board.eventMode = 'static';

      for (let y = 0; y < boardSize; y += 1) {
        for (let x = 0; x < boardSize; x += 1) {
          const idx = y * boardSize + x;
          const target = Math.floor(Math.random() * 4);
          const rotation = Math.floor(Math.random() * 4);
          const g = new Graphics();
          g.position.set(x * cell, y * cell);
          g.hitArea = new Rectangle(0, 0, cell, cell);
          g.eventMode = 'static';
          g.cursor = 'pointer';
          const tile: Tile = { idx, rotation, target, graphics: g };
          g.on('pointerdown', () => rotateTile(tile));
          tiles.push(tile);
          board.addChild(g);
          paintTile(tile, cell);
        }
      }
      updateProgress();
    };

    const paintTile = (tile: Tile, cell: number) => {
      const runeColor = pickAccent(tile.idx);
      const g = tile.graphics;
      g.clear();
      g.lineStyle({ width: 2, color: 0x0d1512, alpha: 0.9 });
      g.beginFill(0x0b1412, 0.85);
      g.drawRoundedRect(0, 0, cell - 6, cell - 6, 10);
      g.endFill();

      // Outer glow
      g.lineStyle({ width: 2, color: runeColor, alpha: tile.rotation === tile.target ? 0.8 : 0.4 });
      g.drawRoundedRect(6, 6, cell - 18, cell - 18, 8);

      // Glyph lines
      g.lineStyle({ width: 3, color: runeColor, alpha: 0.75 });
      const cx = (cell - 6) / 2;
      const cy = (cell - 6) / 2;
      const radius = cell * 0.22;
      for (let i = 0; i < 4; i += 1) {
        const angle = ((tile.rotation + i) % 4) * (Math.PI / 2);
        const x1 = cx + Math.cos(angle) * radius * 0.4;
        const y1 = cy + Math.sin(angle) * radius * 0.4;
        const x2 = cx + Math.cos(angle) * radius;
        const y2 = cy + Math.sin(angle) * radius;
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
      }

      // Target hint (subtle)
      g.lineStyle({ width: 1, color: 0x89ffd2, alpha: 0.25 });
      const targetAngle = tile.target * (Math.PI / 2);
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(targetAngle) * radius * 1.1, cy + Math.sin(targetAngle) * radius * 1.1);
    };

    const rotateTile = (tile: Tile) => {
      tile.rotation = (tile.rotation + 1) % 4;
      const width = app.canvas.width / (window.devicePixelRatio || 1);
      const height = app.canvas.height / (window.devicePixelRatio || 1);
      const padding = 42;
      const size = Math.min(width, height) - padding * 2;
      const cell = size / boardSize;
      paintTile(tile, cell);
      updateProgress();
    };

    const updateProgress = () => {
      correct = tiles.filter((t) => t.rotation === t.target).length;
      progress.text = `Aligned: ${correct}/${tiles.length}`;
      if (correct === tiles.length) {
        status.text = 'BLOCK DECRYPTED — next layer...';
        status.style = new TextStyle({
          ...status.style,
          fill: palette.neonSoft,
          dropShadow: true,
          dropShadowColor: palette.neon,
        });
        revealBanner();
        advance();
      } else {
        status.text = 'Rotate runes until the channels align.';
      }
    };

    const revealBanner = () => {
      const width = app.canvas.width;
      const height = app.canvas.height;
      const banner = new Graphics();
      banner.beginFill(0x2af598, 0.12);
      banner.drawRect(0, height / 2 - 28, width, 56);
      banner.endFill();
      banner.lineStyle({ width: 2, color: 0x2af598, alpha: 0.35 });
      banner.moveTo(0, height / 2 - 28);
      banner.lineTo(width, height / 2 - 28);
      banner.moveTo(0, height / 2 + 28);
      banner.lineTo(width, height / 2 + 28);
      stage.addChild(banner);
      app.ticker.add(() => {
        banner.x -= 8;
        if (banner.x <= -width) {
          banner.destroy();
        }
      });
    };

    const advance = () => {
      orderIndex = (orderIndex + 1) % gridOrders.length;
      boardSize = gridOrders[orderIndex];
      setTimeout(drawTiles, 400);
    };

    drawTiles();

    return () => {
      app.stage.removeChildren();
    };
  });

const Component = makeGameComponent(startGame, {
  title: 'Block Decryptor',
  description: 'Rotate runes to complete the block header conduit.',
});

const meta: GameModule = {
  id: 'block-decryptor',
  title: 'Block Decryptor',
  description: 'Tile rotation puzzle with neon glyphs and sweep banner rewards.',
  tech: 'pixi',
  startGame,
  Component,
};

export default meta;
