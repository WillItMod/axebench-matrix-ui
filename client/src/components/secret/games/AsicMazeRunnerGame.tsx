import { useCallback, useEffect, useRef } from 'react';
import Phaser from 'phaser';
import MiniGameCanvas from '../MiniGameCanvas';
import MiniGameShell from '../MiniGameShell';
import { DarkMiniGameProps } from '../types';

type Point = { x: number; y: number };

const layout = [
  '###########',
  '#S..H..B..#',
  '#.#.###.#.#',
  '#...I..#..#',
  '###.#.###.#',
  '#..T..H...#',
  '#.###.#.###',
  '#....H..E.#',
  '###########',
];

class AsicMazeRunnerScene extends Phaser.Scene {
  private onCompleteCb: () => void;
  private grid: string[][] = [];
  private tileSize = 38;
  private player?: Phaser.GameObjects.Rectangle;
  private playerPos: Point = { x: 1, y: 1 };
  private collectibles = new Set<string>();
  private exitRevealed = false;
  private statusText?: Phaser.GameObjects.Text;
  private totalCollectibles = 0;
  private completed = false;

  constructor(onComplete: () => void) {
    super('AsicMazeRunnerScene');
    this.onCompleteCb = onComplete;
  }

  create() {
    this.grid = layout.map((row) => row.split(''));
    this.collectibles.clear();
    this.totalCollectibles = 0;
    this.exitRevealed = false;
    const originX = 40;
    const originY = 30;

    this.grid.forEach((row, y) => {
      row.forEach((cell, x) => {
        const px = originX + x * this.tileSize;
        const py = originY + y * this.tileSize;
        const isWall = cell === '#';
        const tile = this.add.rectangle(px, py, this.tileSize - 2, this.tileSize - 2, isWall ? 0x111827 : 0x0b1322, 0.9);
        tile.setOrigin(0);
        if (!isWall) {
          tile.setStrokeStyle(1, 0x1f2937, 0.8);
        }

        if (cell === 'S') {
          this.playerPos = { x, y };
        } else if (['H', 'B', 'I', 'T'].includes(cell)) {
          this.collectibles.add(`${x},${y}`);
          this.totalCollectibles += 1;
          const label = cell === 'H' ? '#' : cell;
          this.add.text(px + this.tileSize / 2, py + this.tileSize / 2, label, {
            fontFamily: 'monospace',
            fontSize: '16px',
            color: '#67e8f9',
          }).setOrigin(0.5);
        } else if (cell === 'E') {
          this.add.rectangle(px, py, this.tileSize - 2, this.tileSize - 2, 0x0b1322, 0.7).setOrigin(0);
        }
      });
    });

    const startPx = originX + this.playerPos.x * this.tileSize + (this.tileSize - 18) / 2;
    const startPy = originY + this.playerPos.y * this.tileSize + (this.tileSize - 18) / 2;
    this.player = this.add.rectangle(startPx, startPy, 18, 18, 0xa3e635);

    this.statusText = this.add.text(
      originX,
      originY + this.grid.length * this.tileSize + 12,
      `payload collected: 0 / ${this.totalCollectibles}`,
      {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#cbd5e1',
      }
    );

    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === 'arrowup' || key === 'w') this.tryMove(0, -1);
      if (key === 'arrowdown' || key === 's') this.tryMove(0, 1);
      if (key === 'arrowleft' || key === 'a') this.tryMove(-1, 0);
      if (key === 'arrowright' || key === 'd') this.tryMove(1, 0);
    });
  }

  private tryMove(dx: number, dy: number) {
    if (this.completed) return;
    const nx = this.playerPos.x + dx;
    const ny = this.playerPos.y + dy;
    const row = this.grid[ny];
    const cell = row?.[nx];
    if (!row || !cell || cell === '#') return;

    this.playerPos = { x: nx, y: ny };
    this.tweens.add({
      targets: this.player,
      x: this.player?.x! + dx * this.tileSize,
      y: this.player?.y! + dy * this.tileSize,
      duration: 90,
      ease: 'Sine.easeOut',
    });

    this.checkTile(nx, ny, cell);
  }

  private checkTile(x: number, y: number, cell: string) {
    const key = `${x},${y}`;
    if (['H', 'B', 'I', 'T'].includes(cell) && this.collectibles.has(key)) {
      this.collectibles.delete(key);
      this.grid[y][x] = '.';
      const gathered = this.totalCollectibles - this.collectibles.size;
      this.statusText?.setText(`payload collected: ${gathered} / ${this.totalCollectibles}`);
      this.add.tween({ targets: this.player, scaleX: 1.15, scaleY: 1.15, yoyo: true, duration: 80 });
      if (this.collectibles.size === 0) {
        this.revealExit();
      }
    }

    if (cell === 'E' && this.exitRevealed) {
      this.finish();
    }
  }

  private revealExit() {
    this.exitRevealed = true;
    const pos = this.findCell('E');
    if (!pos) return;
    const originX = 40 + pos.x * this.tileSize;
    const originY = 30 + pos.y * this.tileSize;
    const tile = this.add.rectangle(originX, originY, this.tileSize - 2, this.tileSize - 2, 0x0f172a, 0.9).setOrigin(0);
    tile.setStrokeStyle(2, 0xf59e0b, 0.9);
    this.add.text(originX + this.tileSize / 2, originY + this.tileSize / 2, '₿', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#facc15',
    }).setOrigin(0.5);
    this.statusText?.setText('exit online – reach the ₿ tile');
  }

  private findCell(symbol: string): Point | null {
    for (let y = 0; y < this.grid.length; y += 1) {
      for (let x = 0; x < this.grid[y].length; x += 1) {
        if (this.grid[y][x] === symbol) return { x, y };
      }
    }
    return null;
  }

  private finish() {
    this.completed = true;
    this.add.text(this.scale.width / 2, 14, 'MAZE BREACHED', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#a3e635',
    }).setOrigin(0.5, 0);
    this.time.delayedCall(200, () => this.onCompleteCb());
  }
}

export default function AsicMazeRunnerGame({ onComplete }: DarkMiniGameProps) {
  const sceneRef = useRef<AsicMazeRunnerScene | null>(null);

  const createScene = useCallback(
    (complete: () => void) => {
      const scene = new AsicMazeRunnerScene(complete);
      sceneRef.current = scene;
      return scene;
    },
    []
  );

  useEffect(() => {
    return () => {
      sceneRef.current?.input.keyboard?.removeAllListeners();
    };
  }, []);

  return (
    <MiniGameShell
      title="ASIC Maze Runner"
      subtitle="Collect all hashes and letters, then escape through the BTC exit."
      status="arrow keys / WASD to move"
      hint="Walls are cold iron; plan a short path to the ₿ output."
    >
      <MiniGameCanvas onComplete={onComplete} createScene={createScene} height={380} />
    </MiniGameShell>
  );
}
