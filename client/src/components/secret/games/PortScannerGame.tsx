import { useCallback, useRef } from 'react';
import Phaser from 'phaser';
import MiniGameCanvas from '../MiniGameCanvas';
import MiniGameShell from '../MiniGameShell';
import { DarkMiniGameProps } from '../types';

const ports = [8332, 8333, 3000, 5000, 18444, 9735];
const requiredOrder = [8332, 8333, 3000, 5000];

class PortScannerScene extends Phaser.Scene {
  private onCompleteCb: () => void;
  private currentIndex = 0;
  private statusText?: Phaser.GameObjects.Text;
  private completed = false;

  constructor(onComplete: () => void) {
    super('PortScannerScene');
    this.onCompleteCb = onComplete;
  }

  create() {
    this.add.text(26, 24, 'open ports detected: lock sequence in order', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#cbd5e1',
    });

    const centerX = this.scale.width / 2;
    const startY = 80;
    const gap = 90;

    ports.forEach((port, idx) => {
      const x = centerX + (idx - ports.length / 2 + 0.5) * gap;
      const y = startY + (idx % 2) * 90;

      const badge = this.add.circle(x, y, 34, 0x0b1322, 0.9);
      badge.setStrokeStyle(2, 0x1f2937, 0.9);
      const label = this.add.text(x, y, port.toString(), {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#e2e8f0',
      });
      label.setOrigin(0.5);

      badge.setInteractive({ useHandCursor: true })
        .on('pointerover', () => {
          this.tweens.add({ targets: [badge, label], scale: 1.05, duration: 100 });
        })
        .on('pointerout', () => {
          this.tweens.add({ targets: [badge, label], scale: 1, duration: 100 });
        })
        .on('pointerdown', () => this.handleClick(port, badge, label));
    });

    this.statusText = this.add.text(26, this.scale.height - 40, this.progressText(), {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#cbd5e1',
    });
  }

  private handleClick(port: number, badge: Phaser.GameObjects.Arc, label: Phaser.GameObjects.Text) {
    if (this.completed) return;
    const expected = requiredOrder[this.currentIndex];
    if (port === expected) {
      badge.setStrokeStyle(3, 0x22c55e, 1);
      label.setColor('#a3e635');
      this.tweens.add({ targets: badge, scale: 1.12, yoyo: true, duration: 120 });
      this.currentIndex += 1;
      this.statusText?.setText(this.progressText());
      if (this.currentIndex >= requiredOrder.length) {
        this.completed = true;
        this.add.text(this.scale.width / 2, 30, 'PORTS ALIGNED', {
          fontFamily: 'monospace',
          fontSize: '18px',
          color: '#a3e635',
        }).setOrigin(0.5);
        this.time.delayedCall(200, () => this.onCompleteCb());
      }
    } else {
      this.currentIndex = 0;
      this.statusText?.setText('sequence reset');
      badge.setStrokeStyle(2, 0xef4444, 0.9);
      this.tweens.add({ targets: badge, x: '+=5', yoyo: true, repeat: 3, duration: 60 });
      label.setColor('#fca5a5');
      this.time.delayedCall(180, () => {
        badge.setStrokeStyle(2, 0x1f2937, 0.9);
        label.setColor('#e2e8f0');
        this.statusText?.setText(this.progressText());
      });
    }
  }

  private progressText() {
    return `sequence: ${this.currentIndex}/${requiredOrder.length}`;
  }
}

export default function PortScannerGame({ onComplete }: DarkMiniGameProps) {
  const sceneRef = useRef<PortScannerScene | null>(null);

  const createScene = useCallback(
    (complete: () => void) => {
      const scene = new PortScannerScene(complete);
      sceneRef.current = scene;
      return scene;
    },
    []
  );

  return (
    <MiniGameShell
      title="Port Scanner"
      subtitle="Tap ports in the correct order to open the matrix link."
      status="ordered click puzzle"
      hint="If you miss, the sequence resets."
    >
      <MiniGameCanvas onComplete={onComplete} createScene={createScene} />
    </MiniGameShell>
  );
}
