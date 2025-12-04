import { useCallback, useRef } from 'react';
import Phaser from 'phaser';
import MiniGameCanvas from '../MiniGameCanvas';
import MiniGameShell from '../MiniGameShell';
import { DarkMiniGameProps } from '../types';

type Service = {
  name: string;
  health: number;
  decay: number;
  bar?: Phaser.GameObjects.Rectangle;
  tile?: Phaser.GameObjects.Rectangle;
  button?: Phaser.GameObjects.Rectangle;
  label?: Phaser.GameObjects.Text;
};

const serviceNames = ['AxeBench API', 'Pool Proxy', 'Matrix Sync', 'Telemetry', 'Cooling Daemon'];

class UptimeKeeperScene extends Phaser.Scene {
  private onCompleteCb: () => void;
  private services: Service[] = [];
  private statusText?: Phaser.GameObjects.Text;
  private uptime = 0;
  private failed = false;
  private completed = false;

  constructor(onComplete: () => void) {
    super('UptimeKeeperScene');
    this.onCompleteCb = onComplete;
  }

  create() {
    this.add.text(26, 20, 'keep services alive for 15s', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#cbd5e1',
    });
    this.statusText = this.add.text(26, this.scale.height - 36, 'uptime: 0.0s', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#cbd5e1',
    });

    this.resetServices();
  }

  private resetServices() {
    this.failed = false;
    this.completed = false;
    this.uptime = 0;
    this.services = serviceNames.map((name) => ({
      name,
      health: 70 + Math.random() * 30,
      decay: 4 + Math.random() * 5,
    }));
    this.renderServices();
    this.statusText?.setText('uptime: 0.0s');
  }

  private renderServices() {
    const startX = 36;
    const startY = 52;
    const tileWidth = 200;
    const tileHeight = 80;
    const gap = 16;

    this.services.forEach((service, index) => {
      const row = Math.floor(index / 2);
      const col = index % 2;
      const x = startX + col * (tileWidth + gap);
      const y = startY + row * (tileHeight + gap);

      service.tile = this.add.rectangle(x, y, tileWidth, tileHeight, 0x0b1322, 0.9).setOrigin(0);
      service.tile.setStrokeStyle(2, 0x1f2937, 0.9);
      service.label = this.add.text(x + 12, y + 10, service.name, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#e2e8f0',
      });

      this.add.text(x + 12, y + 34, 'health', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#94a3b8',
      });

      this.add.rectangle(x + 12, y + 52, tileWidth - 24, 14, 0x0f172a, 0.75).setOrigin(0, 0.5).setStrokeStyle(1, 0x1f2937, 0.9);
      service.bar = this.add.rectangle(x + 12, y + 52, ((tileWidth - 24) * service.health) / 100, 14, 0x22c55e, 0.85).setOrigin(0, 0.5);

      service.button = this.add.rectangle(x + tileWidth - 64, y + tileHeight - 18, 52, 22, 0x111827, 0.95)
        .setOrigin(0, 0.5)
        .setStrokeStyle(1, 0x1f2937, 0.9);
      this.add.text(x + tileWidth - 38, y + tileHeight - 18, 'restart', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#e2e8f0',
      }).setOrigin(0.5);

      service.button.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.restart(service));
    });
  }

  private restart(service: Service) {
    if (this.failed || this.completed) return;
    service.health = Math.min(100, service.health + 35);
    const baseWidth = 176;
    if (service.bar) {
      service.bar.setFillStyle(0x22c55e, 0.9);
      this.tweens.add({
        targets: service.bar,
        width: (baseWidth * service.health) / 100,
        duration: 140,
      });
    }
  }

  update(_: number, delta: number) {
    if (this.completed) return;
    if (this.failed) return;

    this.uptime += delta;
    const progressSeconds = this.uptime / 1000;
    this.statusText?.setText(`uptime: ${progressSeconds.toFixed(1)}s`);

    this.services.forEach((service) => {
      service.health = Math.max(0, service.health - (service.decay * delta) / 1000);
      if (service.bar) {
        const tileWidth = 200;
        service.bar.width = ((tileWidth - 24) * service.health) / 100;
        service.bar.setFillStyle(service.health > 35 ? 0x22c55e : 0xf59e0b, 0.9);
      }
    });

    if (this.services.some((s) => s.health <= 0)) {
      this.fail();
      return;
    }

    if (progressSeconds >= 15) {
      this.completed = true;
      this.add.text(this.scale.width / 2, 24, 'GRID ONLINE', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#a3e635',
      }).setOrigin(0.5, 0);
      this.time.delayedCall(220, () => this.onCompleteCb());
    }
  }

  private fail() {
    this.failed = true;
    this.statusText?.setText('service failure – resetting');
    this.add.text(this.scale.width / 2, this.scale.height - 70, 'FAIL STATE', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#ef4444',
    }).setOrigin(0.5);
    this.time.delayedCall(900, () => this.resetServices());
  }
}

export default function UptimeKeeperGame({ onComplete }: DarkMiniGameProps) {
  const sceneRef = useRef<UptimeKeeperScene | null>(null);

  const createScene = useCallback(
    (complete: () => void) => {
      const scene = new UptimeKeeperScene(complete);
      sceneRef.current = scene;
      return scene;
    },
    []
  );

  return (
    <MiniGameShell
      title="Uptime Keeper"
      subtitle="Patch and restart services before they brown out."
      status="hold all services above 0% for 15s"
      hint="Restart early; decay ramps up the longer you wait."
    >
      <MiniGameCanvas onComplete={onComplete} createScene={createScene} height={420} />
    </MiniGameShell>
  );
}
