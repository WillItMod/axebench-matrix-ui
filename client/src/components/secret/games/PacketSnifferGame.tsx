import { useCallback, useRef } from 'react';
import Phaser from 'phaser';
import MiniGameCanvas from '../MiniGameCanvas';
import MiniGameShell from '../MiniGameShell';
import { DarkMiniGameProps } from '../types';

type Packet = { text: string; suspicious: boolean };

const buildPackets = () => {
  const base = [
    '7A 1F 33 00 AF 10 C8 02',
    '10 22 13 37 00 44 55 66',
    'C0 FF EE 21 09 77 11 00',
    '42 42 42 42 42 42 42 42',
    'AA BB CC DD EE FF 01 23',
    'DE AD BE EF 02 10 99 21',
    'F1 12 34 56 78 90 AB CD',
    '05 1C 09 8D 11 3B 4F 6A',
  ];
  const suspectIndex = Math.floor(Math.random() * base.length);
  return base.map((text, idx) => ({
    text,
    suspicious: idx === suspectIndex,
  }));
};

class PacketSnifferScene extends Phaser.Scene {
  private onCompleteCb: () => void;
  private packets: Packet[];
  private rows: Phaser.GameObjects.Text[] = [];
  private completed = false;

  constructor(onComplete: () => void, packets: Packet[]) {
    super('PacketSnifferScene');
    this.onCompleteCb = onComplete;
    this.packets = packets;
  }

  create() {
    const startY = 60;
    const startX = 40;

    this.add.text(startX, 26, 'scan traffic for odd entropy', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#cbd5e1',
    });

    this.packets.forEach((packet, index) => {
      const row = this.add.text(startX, startY + index * 36, packet.text, {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#e2e8f0',
      });
      row.setInteractive({ useHandCursor: true });
      row.on('pointerover', () => row.setColor('#67e8f9'));
      row.on('pointerout', () => row.setColor('#e2e8f0'));
      row.on('pointerdown', () => this.handleClick(index));
      this.rows.push(row);
    });
  }

  private handleClick(index: number) {
    if (this.completed) return;
    const packet = this.packets[index];
    const row = this.rows[index];
    if (!packet || !row) return;

    if (packet.suspicious) {
      this.completed = true;
      row.setColor('#a3e635');
      row.setText(`${packet.text}  <- anomaly`);
      this.tweens.add({ targets: row, scale: 1.08, yoyo: true, repeat: 4, duration: 100 });
      this.time.delayedCall(200, () => this.onCompleteCb());
    } else {
      row.setColor('#ef4444');
      this.tweens.add({ targets: row, alpha: 0.4, yoyo: true, duration: 110 });
      this.time.delayedCall(180, () => row.setColor('#e2e8f0'));
    }
  }
}

export default function PacketSnifferGame({ onComplete }: DarkMiniGameProps) {
  const sceneRef = useRef<PacketSnifferScene | null>(null);

  const createScene = useCallback(
    (complete: () => void) => {
      const scene = new PacketSnifferScene(complete, buildPackets());
      sceneRef.current = scene;
      return scene;
    },
    []
  );

  return (
    <MiniGameShell
      title="Packet Sniffer"
      subtitle="Spot the suspicious packet by its hex signature."
      status="one packet hides the breach"
      hint="Look for patterns like 13 37 or C0 FF EE."
    >
      <MiniGameCanvas onComplete={onComplete} createScene={createScene} />
    </MiniGameShell>
  );
}
