import { useCallback, useRef } from 'react';
import Phaser from 'phaser';
import MiniGameCanvas from '../MiniGameCanvas';
import MiniGameShell from '../MiniGameShell';
import { DarkMiniGameProps } from '../types';

type Card = { label: string; stable: boolean };

class VoltageRouletteScene extends Phaser.Scene {
  private onCompleteCb: () => void;
  private cards: Card[];
  private completed = false;

  constructor(onComplete: () => void, cards: Card[]) {
    super('VoltageRouletteScene');
    this.onCompleteCb = onComplete;
    this.cards = cards;
  }

  create() {
    const cardWidth = 150;
    const cardHeight = 90;
    const gap = 18;
    const startX = (this.scale.width - (3 * cardWidth + 2 * gap)) / 2;
    const startY = 70;

    this.cards.forEach((card, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const x = startX + col * (cardWidth + gap);
      const y = startY + row * (cardHeight + gap);

      const cardRect = this.add.rectangle(x, y, cardWidth, cardHeight, 0x0b1322, 0.92).setOrigin(0);
      cardRect.setStrokeStyle(2, 0x1f2937, 0.9);

      const text = this.add.text(x + cardWidth / 2, y + cardHeight / 2, card.label, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#e2e8f0',
        align: 'center',
      });
      text.setOrigin(0.5);

      cardRect.setInteractive({ useHandCursor: true })
        .on('pointerover', () => {
          this.tweens.add({ targets: [cardRect, text], scale: 1.04, duration: 110 });
        })
        .on('pointerout', () => {
          this.tweens.add({ targets: [cardRect, text], scale: 1, duration: 110 });
        })
        .on('pointerdown', () => this.handlePick(card, cardRect, text));
    });
  }

  private handlePick(card: Card, rect: Phaser.GameObjects.Rectangle, text: Phaser.GameObjects.Text) {
    if (this.completed) return;
    if (card.stable) {
      this.completed = true;
      rect.setStrokeStyle(3, 0x22c55e, 1);
      this.tweens.add({ targets: rect, scale: 1.08, yoyo: true, repeat: 4, duration: 140 });
      text.setColor('#a3e635');
      this.add
        .text(this.scale.width / 2, 30, 'STABLE SILICON FOUND', {
          fontFamily: 'monospace',
          fontSize: '18px',
          color: '#a3e635',
        })
        .setOrigin(0.5);
      this.time.delayedCall(200, () => this.onCompleteCb());
    } else {
      this.tweens.add({
        targets: [rect, text],
        x: `+=6`,
        yoyo: true,
        repeat: 4,
        duration: 60,
      });
      rect.setStrokeStyle(2, 0xef4444, 0.9);
      text.setColor('#fca5a5');
      this.time.delayedCall(220, () => rect.setStrokeStyle(2, 0x1f2937, 0.9));
      this.time.delayedCall(220, () => text.setColor('#e2e8f0'));
    }
  }
}

export default function VoltageRouletteGame({ onComplete }: DarkMiniGameProps) {
  const sceneRef = useRef<VoltageRouletteScene | null>(null);
  const combos = useRef(() => {
    const stableIndex = Math.floor(Math.random() * 6);
    const base: Card[] = [
      { label: '0.68v | 750MHz', stable: false },
      { label: '0.70v | 800MHz', stable: false },
      { label: '0.72v | 820MHz', stable: false },
      { label: '0.74v | 850MHz', stable: false },
      { label: '0.76v | 900MHz', stable: false },
      { label: '0.78v | 930MHz', stable: false },
    ];
    return base.map((card, idx) => ({ ...card, stable: idx === stableIndex }));
  });

  const createScene = useCallback(
    (complete: () => void) => {
      const scene = new VoltageRouletteScene(complete, combos.current());
      sceneRef.current = scene;
      return scene;
    },
    []
  );

  return (
    <MiniGameShell
      title="Voltage Roulette"
      subtitle="Pick the only stable profile; the rest will brown-out."
      status="one card is stable"
      hint="Hover to inspect then commit to a single voltage combo."
    >
      <MiniGameCanvas onComplete={onComplete} createScene={createScene} />
    </MiniGameShell>
  );
}
