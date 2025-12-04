import { useCallback, useRef } from 'react';
import Phaser from 'phaser';
import MiniGameCanvas from '../MiniGameCanvas';
import MiniGameShell from '../MiniGameShell';
import { DarkMiniGameProps } from '../types';

class EntropyShakerScene extends Phaser.Scene {
  private onCompleteCb: () => void;
  private goal = 24;
  private entropy = 0;
  private barFill?: Phaser.GameObjects.Rectangle;
  private label?: Phaser.GameObjects.Text;
  private completed = false;

  constructor(onComplete: () => void) {
    super('EntropyShakerScene');
    this.onCompleteCb = onComplete;
  }

  create() {
    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;

    const button = this.add.circle(centerX, centerY, 70, 0x0b1322, 0.95).setStrokeStyle(3, 0x1f2937, 0.9);
    const buttonLabel = this.add.text(centerX, centerY, 'SHAKE', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#e2e8f0',
    });
    buttonLabel.setOrigin(0.5);

    button.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.bump());

    this.add.text(centerX, 32, 'inject entropy clicks', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#cbd5e1',
    }).setOrigin(0.5);

    this.barFill = this.add.rectangle(centerX - 200, this.scale.height - 60, 0, 18, 0x22c55e, 0.8).setOrigin(0, 0.5);
    this.add.rectangle(centerX - 200, this.scale.height - 60, 400, 18, 0x0f172a, 0.7).setOrigin(0, 0.5).setStrokeStyle(2, 0x1f2937, 0.9);
    this.label = this.add.text(centerX, this.scale.height - 90, this.progressText(), {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#cbd5e1',
    }).setOrigin(0.5);
  }

  private bump() {
    if (this.completed) return;
    this.entropy += 1;
    this.tweens.add({ targets: this.barFill, width: (this.entropy / this.goal) * 400, duration: 120 });
    this.label?.setText(this.progressText());
    this.tweens.add({ targets: this.label, scale: 1.08, yoyo: true, duration: 90 });

    if (this.entropy >= this.goal) {
      this.completed = true;
      this.label?.setText('entropy saturated');
      this.add.text(this.scale.width / 2, this.scale.height / 2 - 120, 'ENTROPY MAXED', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#a3e635',
      }).setOrigin(0.5);
      this.time.delayedCall(200, () => this.onCompleteCb());
    }
  }

  private progressText() {
    return `entropy ${this.entropy}/${this.goal}`;
  }
}

export default function EntropyShakerGame({ onComplete }: DarkMiniGameProps) {
  const sceneRef = useRef<EntropyShakerScene | null>(null);

  const createScene = useCallback(
    (complete: () => void) => {
      const scene = new EntropyShakerScene(complete);
      sceneRef.current = scene;
      return scene;
    },
    []
  );

  return (
    <MiniGameShell
      title="Entropy Shaker"
      subtitle="Spam the entropy injector to fill the gauge."
      status="click to generate randomness"
      hint="Short, rapid taps ramp the bar fastest."
    >
      <MiniGameCanvas onComplete={onComplete} createScene={createScene} />
    </MiniGameShell>
  );
}
