import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Phaser from 'phaser';
import MiniGameCanvas from '../MiniGameCanvas';
import MiniGameShell from '../MiniGameShell';
import { DarkMiniGameProps } from '../types';

const rpmFromOffset = (offset: number) => 1400 + offset * 18;

class FanCurveTunerScene extends Phaser.Scene {
  private onCompleteCb: () => void;
  private targetMin: number;
  private targetMax: number;
  private displayRpm = 1400;
  private targetRpm = 1400;
  private holdMs = 0;
  private needle?: Phaser.GameObjects.Rectangle;
  private windowRect?: Phaser.GameObjects.Rectangle;
  private completed = false;

  constructor(onComplete: () => void, targetMin: number, targetMax: number) {
    super('FanCurveTunerScene');
    this.onCompleteCb = onComplete;
    this.targetMin = targetMin;
    this.targetMax = targetMax;
  }

  create() {
    const barX = 60;
    const barY = this.scale.height / 2;
    const barWidth = 420;

    this.add.rectangle(barX, barY, barWidth, 18, 0x0f172a, 0.9).setOrigin(0, 0.5).setStrokeStyle(2, 0x1f2937, 0.9);
    const minRatio = (this.targetMin - 1200) / 1800;
    const maxRatio = (this.targetMax - 1200) / 1800;
    this.windowRect = this.add
      .rectangle(barX + minRatio * barWidth, barY, (maxRatio - minRatio) * barWidth, 28, 0x22c55e, 0.25)
      .setOrigin(0, 0.5);

    this.needle = this.add.rectangle(barX, barY, 6, 36, 0x67e8f9).setOrigin(0.5);

    this.add.text(barX, barY + 40, 'hold RPM inside the green band for 1s', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#cbd5e1',
    });
  }

  setOffset(offset: number) {
    this.targetRpm = rpmFromOffset(offset);
  }

  update(_: number, delta: number) {
    if (this.completed) return;
    this.displayRpm = Phaser.Math.Linear(this.displayRpm, this.targetRpm, 0.06);
    const ratio = Phaser.Math.Clamp((this.displayRpm - 1200) / 1800, 0, 1);
    const barX = 60;
    const barWidth = 420;
    const barY = this.scale.height / 2;
    if (this.needle) {
      this.needle.x = barX + ratio * barWidth;
      this.needle.y = barY;
    }

    const inWindow = this.displayRpm >= this.targetMin && this.displayRpm <= this.targetMax;
    if (inWindow) {
      this.holdMs += delta;
      this.windowRect?.setFillStyle(0x22c55e, 0.35);
      if (this.holdMs >= 1000 && !this.completed) {
        this.completed = true;
        this.add.text(this.scale.width / 2, barY - 70, 'CURVE LOCKED', {
          fontFamily: 'monospace',
          fontSize: '20px',
          color: '#a3e635',
        }).setOrigin(0.5);
        this.tweens.add({ targets: this.needle, scaleY: 1.4, yoyo: true, repeat: 4, duration: 120 });
        this.time.delayedCall(250, () => this.onCompleteCb());
      }
    } else {
      this.holdMs = 0;
      this.windowRect?.setFillStyle(0x22c55e, 0.22);
    }
  }
}

export default function FanCurveTunerGame({ onComplete }: DarkMiniGameProps) {
  const [offset, setOffset] = useState(50);
  const sceneRef = useRef<FanCurveTunerScene | null>(null);
  const targetRange = useMemo(() => {
    const center = 2250 + Math.random() * 250;
    return { min: center - 70, max: center + 70 };
  }, []);

  const createScene = useCallback(
    (complete: () => void) => {
      const scene = new FanCurveTunerScene(complete, targetRange.min, targetRange.max);
      sceneRef.current = scene;
      return scene;
    },
    [targetRange.max, targetRange.min]
  );

  useEffect(() => {
    sceneRef.current?.setOffset(offset);
  }, [offset]);

  const rpm = rpmFromOffset(offset);

  return (
    <MiniGameShell
      title="Fan Curve Tuner"
      subtitle="Stabilize the fan RPM inside the target band."
      status={`target ${Math.round(targetRange.min)} - ${Math.round(targetRange.max)} RPM`}
      hint="Small adjustments settle faster—avoid overcorrecting."
    >
      <div className="flex flex-col gap-4">
        <MiniGameCanvas onComplete={onComplete} createScene={createScene} />
        <div className="flex items-center gap-3">
          <div className="w-28 text-sm text-muted-foreground">Fan offset</div>
          <input
            type="range"
            min={0}
            max={100}
            value={offset}
            onChange={(e) => setOffset(Number(e.target.value))}
            className="flex-1 accent-[hsl(var(--primary))]"
          />
          <div className="w-28 text-right text-sm text-muted-foreground font-mono">{Math.round(rpm)} RPM</div>
        </div>
      </div>
    </MiniGameShell>
  );
}
