import { useCallback, useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import MiniGameCanvas from '../MiniGameCanvas';
import MiniGameShell from '../MiniGameShell';
import { DarkMiniGameProps } from '../types';

class PulseAlignmentScene extends Phaser.Scene {
  private onCompleteCb: () => void;
  private marker!: Phaser.GameObjects.Rectangle;
  private barStartX = 60;
  private barWidth = 440;
  private position = 0.05;
  private direction = 1;
  private speed = 0.22;
  private windowStart: number;
  private windowWidth: number;
  private successCount = 0;
  private statusText?: Phaser.GameObjects.Text;
  private completed = false;

  constructor(onComplete: () => void, windowStart: number, windowWidth: number) {
    super('PulseAlignmentScene');
    this.onCompleteCb = onComplete;
    this.windowStart = windowStart;
    this.windowWidth = windowWidth;
  }

  create() {
    const barY = this.scale.height / 2;
    this.add.rectangle(this.barStartX, barY, this.barWidth, 12, 0x1f2937, 0.8).setOrigin(0, 0.5);
    const windowPixelStart = this.barStartX + this.windowStart * this.barWidth;
    const windowPixelWidth = this.windowWidth * this.barWidth;
    this.add.rectangle(windowPixelStart, barY, windowPixelWidth, 20, 0x22c55e, 0.35).setOrigin(0, 0.5);
    this.marker = this.add.rectangle(this.barStartX, barY, 10, 28, 0x67e8f9).setOrigin(0.5);

    this.statusText = this.add.text(this.barStartX, barY + 40, 'sync pulses: 0/3', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#cbd5e1',
    });
  }

  update(_: number, delta: number) {
    if (this.completed) return;
    this.position += (delta * this.speed * this.direction) / 1000;
    if (this.position > 1) {
      this.position = 1;
      this.direction = -1;
    }
    if (this.position < 0) {
      this.position = 0;
      this.direction = 1;
    }
    this.marker.x = this.barStartX + this.position * this.barWidth;
  }

  attemptSync() {
    if (this.completed) return;
    const inside = this.position >= this.windowStart && this.position <= this.windowStart + this.windowWidth;
    if (inside) {
      this.successCount += 1;
      this.statusText?.setText(`sync pulses: ${this.successCount}/3`);
      this.marker.setFillStyle(0xa3e635);
      this.tweens.add({ targets: this.marker, scaleX: 1.4, scaleY: 1.4, yoyo: true, duration: 140 });
      this.events.emit('sync-progress', this.successCount);
      if (this.successCount >= 3) {
        this.completed = true;
        this.add.text(this.scale.width / 2, this.scale.height / 2 - 60, 'PULSE LOCKED', {
          fontFamily: 'monospace',
          fontSize: '22px',
          color: '#a3e635',
        }).setOrigin(0.5);
        this.time.delayedCall(250, () => this.onCompleteCb());
      }
    } else {
      this.successCount = Math.max(0, this.successCount - 1);
      this.statusText?.setText(`sync pulses: ${this.successCount}/3`);
      this.marker.setFillStyle(0xef4444);
      this.tweens.add({ targets: this.marker, alpha: 0.35, yoyo: true, duration: 180 });
      this.events.emit('sync-progress', this.successCount);
    }
  }
}

export default function PulseAlignmentGame({ onComplete }: DarkMiniGameProps) {
  const [hits, setHits] = useState(0);
  const sceneRef = useRef<PulseAlignmentScene | null>(null);
  const windowStart = useRef(0.25 + Math.random() * 0.35);
  const windowWidth = useRef(0.14 + Math.random() * 0.08);

  const createScene = useCallback(
    (complete: () => void) => {
      const scene = new PulseAlignmentScene(complete, windowStart.current, windowWidth.current);
      sceneRef.current = scene;
      return scene;
    },
    []
  );

  const handleSync = () => {
    sceneRef.current?.attemptSync();
  };

  const onSceneReady = (scene: Phaser.Scene) => {
    if (scene instanceof PulseAlignmentScene) {
      scene.events.on('sync-progress', (count: number) => setHits(count));
    }
  };

  useEffect(() => {
    return () => {
      sceneRef.current?.events.removeAllListeners();
    };
  }, []);

  return (
    <MiniGameShell
      title="Pulse Alignment"
      subtitle="Catch the oscillating pulse inside the sync window."
      status="3 successful syncs to unlock"
      hint="Timing improves if you watch the marker speed change near the edges."
    >
      <div className="flex flex-col gap-4">
        <MiniGameCanvas onComplete={onComplete} createScene={createScene} onSceneReady={onSceneReady} />
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">Sync progress: {hits}/3</div>
          <button
            type="button"
            onClick={handleSync}
            className="px-4 py-2 rounded-md border border-border bg-card text-foreground hover:border-primary/70"
          >
            SYNC
          </button>
        </div>
      </div>
    </MiniGameShell>
  );
}
