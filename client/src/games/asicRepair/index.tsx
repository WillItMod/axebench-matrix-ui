import React from 'react';
import { Container, Graphics, Rectangle, Text, TextStyle } from 'pixi.js';
import { bootPixiApp } from '../shared/pixiApp';
import { palette, pickAccent } from '../shared/theme';
import { makeGameComponent } from '../GameShell';
import type { GameModule } from '../types';

type Level = { size: number; faulty: number[] };

const levels: Level[] = [
  { size: 4, faulty: [5, 6, 9] },
  { size: 5, faulty: [2, 7, 12, 17] },
  { size: 6, faulty: [3, 4, 9, 14, 21] },
  { size: 6, faulty: [0, 7, 8, 15, 30] },
  { size: 7, faulty: [6, 7, 8, 15, 22, 27, 34] },
];

export const startGame = (canvas: HTMLCanvasElement) =>
  bootPixiApp(canvas, (app) => {
    const root = new Container();
    const board = new Container();
    const overlay = new Container();
    const ui = new Container();
    app.stage.addChild(root);
    root.addChild(board);
    root.addChild(ui);
    root.addChild(overlay);

    const headerStyle = new TextStyle({
      fill: palette.neon,
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 16,
      letterSpacing: 2,
      dropShadow: true,
      dropShadowBlur: 6,
      dropShadowColor: palette.neonSoft,
    });

    const bodyStyle = new TextStyle({
      fill: palette.white,
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 13,
      letterSpacing: 1,
    });

    const levelText = new Text('Level 1', headerStyle);
    const movesText = new Text('Moves: --', bodyStyle);
    ui.addChild(levelText);
    ui.addChild(movesText);
    movesText.position.set(0, 22);

    let levelIndex = 0;
    let movesLeft = 0;
    let gridSize = 4;
    let faulty: boolean[] = [];

    const gridGraphics: Graphics[] = [];

    const drawBoard = () => {
      board.removeChildren();
      gridGraphics.length = 0;
      const width = app.canvas.width / (window.devicePixelRatio || 1);
      const height = app.canvas.height / (window.devicePixelRatio || 1);
      const padding = 36;
      const size = Math.min(width, height) - padding * 2;
      const cell = size / gridSize;
      board.position.set((width - size) / 2, (height - size) / 2 + 10);
      board.hitArea = new Rectangle(0, 0, size, size);
      board.eventMode = 'static';
      board.cursor = 'pointer';

      for (let y = 0; y < gridSize; y += 1) {
        for (let x = 0; x < gridSize; x += 1) {
          const idx = y * gridSize + x;
          const g = new Graphics();
          g.position.set(x * cell, y * cell);
          g.eventMode = 'static';
          g.hitArea = new Rectangle(0, 0, cell, cell);
          g.on('pointerdown', () => handleToggle(idx));
          gridGraphics.push(g);
          board.addChild(g);
        }
      }

      renderCells();
    };

    const toggleIndex = (idx: number) => {
      if (idx < 0 || idx >= faulty.length) return;
      faulty[idx] = !faulty[idx];
    };

    const handleToggle = (idx: number) => {
      if (movesLeft <= 0) return;
      movesLeft -= 1;
      toggleIndex(idx);
      const x = idx % gridSize;
      const y = Math.floor(idx / gridSize);
      toggleIndex(idx - 1);
      toggleIndex(idx + 1);
      toggleIndex(idx - gridSize);
      toggleIndex(idx + gridSize);
      renderCells();
      updateUi();
      if (faulty.every((f) => !f)) {
        flashSuccess();
        nextLevel();
      } else if (movesLeft <= 0) {
        pulseFailure();
        resetLevel();
      }
    };

    const renderCells = () => {
      const width = app.canvas.width / (window.devicePixelRatio || 1);
      const height = app.canvas.height / (window.devicePixelRatio || 1);
      const padding = 36;
      const size = Math.min(width, height) - padding * 2;
      const cell = size / gridSize;
      const healthyColor = 0x30ffb1;
      const faultyColor = 0xff9f45;

      gridGraphics.forEach((g, idx) => {
        g.clear();
        const isFaulty = faulty[idx];
        const col = isFaulty ? faultyColor : healthyColor;
        g.lineStyle({ width: 2, color: 0x0d1512, alpha: 0.8 });
        g.beginFill(col, isFaulty ? 0.8 : 0.45);
        g.drawRoundedRect(0, 0, cell - 4, cell - 4, 8);
        g.endFill();
        if (isFaulty) {
          g.lineStyle({ width: 2, color: 0xffd166, alpha: 0.6 });
          g.moveTo(6, 6);
          g.lineTo(cell - 10, cell - 10);
          g.moveTo(cell - 10, 6);
          g.lineTo(6, cell - 10);
        } else {
          g.lineStyle({ width: 1, color: 0x7ef2c6, alpha: 0.4 });
          g.drawRoundedRect(4, 4, cell - 12, cell - 12, 6);
        }
      });
    };

    const updateUi = () => {
      levelText.text = `Level ${levelIndex + 1}`;
      movesText.text = `Moves left: ${movesLeft}`;
      const width = app.canvas.width / (window.devicePixelRatio || 1);
      const height = app.canvas.height / (window.devicePixelRatio || 1);
      levelText.position.set(18, 12);
      movesText.position.set(18, 34);
      ui.position.set(0, 0);
      overlay.removeChildren();
      const prog = 1 - faulty.filter(Boolean).length / faulty.length;
      const bar = new Graphics();
      bar.beginFill(0x0b1611, 0.8);
      bar.drawRoundedRect(16, height - 46, width - 32, 14, 6);
      bar.endFill();
      bar.beginFill(0x2af598);
      bar.drawRoundedRect(16, height - 46, (width - 32) * prog, 14, 6);
      bar.endFill();
      overlay.addChild(bar);
    };

    const resetLevel = () => {
      const lvl = levels[levelIndex % levels.length];
      gridSize = lvl.size;
      faulty = Array(gridSize * gridSize).fill(false);
      lvl.faulty.forEach((i) => {
        if (i < faulty.length) faulty[i] = true;
      });
      movesLeft = gridSize + 3 + levelIndex;
      drawBoard();
      renderCells();
      updateUi();
    };

    const nextLevel = () => {
      levelIndex = (levelIndex + 1) % levels.length;
      resetLevel();
    };

    const flashSuccess = () => {
      const shade = new Graphics();
      shade.beginFill(0x2af598, 0.2);
      shade.drawRect(0, 0, app.canvas.width, app.canvas.height);
      shade.endFill();
      shade.alpha = 0.9;
      shade.eventMode = 'none';
      overlay.addChild(shade);
      app.ticker.add(() => {
        shade.alpha *= 0.92;
        if (shade.alpha < 0.02) shade.destroy();
      });
    };

    const pulseFailure = () => {
      const mask = new Graphics();
      mask.beginFill(0xff5555, 0.2);
      mask.drawRect(0, 0, app.canvas.width, app.canvas.height);
      mask.endFill();
      mask.alpha = 0.8;
      overlay.addChild(mask);
      app.ticker.add(() => {
        mask.alpha *= 0.9;
        if (mask.alpha < 0.02) mask.destroy();
      });
    };

    resetLevel();

    return () => {
      app.stage.removeChildren();
    };
  });

const Component = makeGameComponent(startGame, {
  title: 'ASIC Repair',
  description: 'Toggle faulty chips back online; conserve moves to unlock higher grids.',
});

const meta: GameModule = {
  id: 'asic-repair',
  title: 'ASIC Repair',
  description: 'Lights-out style board fixer with neon chip diagnostics.',
  tech: 'pixi',
  startGame,
  Component,
};

export default meta;
