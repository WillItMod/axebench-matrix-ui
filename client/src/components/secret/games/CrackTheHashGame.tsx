import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Phaser from 'phaser';
import MiniGameCanvas from '../MiniGameCanvas';
import MiniGameShell from '../MiniGameShell';
import { DarkMiniGameProps } from '../types';

type Tuning = { clock: number; volt: number; fan: number };

const computeHash = ({ clock, volt, fan }: Tuning) => {
  const mix = clock * 7 + volt * 13 + fan * 5;
  return mix.toString(16).padStart(12, '0').slice(0, 12).toUpperCase();
};

class CrackTheHashScene extends Phaser.Scene {
  private onCompleteCb: () => void;
  private targetHash: string;
  private target: Tuning;
  private currentValues: Tuning = { clock: 50, volt: 50, fan: 50 };
  private currentHashText?: Phaser.GameObjects.Text;
  private statusText?: Phaser.GameObjects.Text;
  private ready = false;
  private completed = false;

  constructor(onComplete: () => void, target: Tuning, targetHash: string) {
    super('CrackTheHashScene');
    this.onCompleteCb = onComplete;
    this.target = target;
    this.targetHash = targetHash;
  }

  create() {
    const { width, height } = this.scale;
    this.add.rectangle(width / 2, height / 2, width - 20, height - 20, 0x0b1220, 0.65).setStrokeStyle(2, 0x1f2a44, 0.8);
    this.add.text(20, 14, 'hash forge console', { fontFamily: 'monospace', fontSize: '12px', color: '#9ca3af' });

    this.add.text(20, 40, `target: ${this.targetHash}`, {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#a3e635',
    });

    this.currentHashText = this.add.text(20, 76, 'current: --', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#67e8f9',
    });

    this.statusText = this.add.text(20, height - 40, 'dial in a collision', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#cbd5e1',
    });

    this.ready = true;
    this.refreshHash();
  }

  updateTuning(values: Tuning) {
    this.currentValues = values;
    this.refreshHash();
  }

  private refreshHash() {
    if (!this.ready) return;
    const hash = computeHash(this.currentValues);
    const match = this.isAligned();

    this.currentHashText?.setText(`current: ${hash}`);
    this.currentHashText?.setTint(match ? 0xa3e635 : 0x67e8f9);

    if (match && !this.completed) {
      this.completed = true;
      this.statusText?.setText('collision detected');
      this.tweens.add({
        targets: this.currentHashText,
        scale: 1.08,
        yoyo: true,
        repeat: 6,
        duration: 110,
      });
      this.time.delayedCall(300, () => this.onCompleteCb());
    } else if (!match) {
      this.statusText?.setText('searching entropy space');
    }
  }

  private isAligned() {
    const { clock, volt, fan } = this.currentValues;
    return (
      Math.abs(clock - this.target.clock) <= 4 &&
      Math.abs(volt - this.target.volt) <= 3 &&
      Math.abs(fan - this.target.fan) <= 3
    );
  }
}

export default function CrackTheHashGame({ onComplete }: DarkMiniGameProps) {
  const target = useMemo<Tuning>(
    () => ({
      clock: 55 + Math.floor(Math.random() * 16),
      volt: 52 + Math.floor(Math.random() * 10),
      fan: 50 + Math.floor(Math.random() * 12),
    }),
    []
  );
  const targetHash = useMemo(() => computeHash(target), [target]);
  const [controls, setControls] = useState<Tuning>({ clock: 50, volt: 50, fan: 50 });
  const sceneRef = useRef<CrackTheHashScene | null>(null);

  const createScene = useCallback(
    (complete: () => void) => {
      const scene = new CrackTheHashScene(complete, target, targetHash);
      sceneRef.current = scene;
      return scene;
    },
    [target, targetHash]
  );

  useEffect(() => {
    sceneRef.current?.updateTuning(controls);
  }, [controls]);

  const slider = (label: string, key: keyof Tuning) => (
    <div className="flex items-center gap-3">
      <div className="w-24 text-sm text-muted-foreground">{label}</div>
      <input
        type="range"
        min={0}
        max={100}
        value={controls[key]}
        onChange={(e) => setControls((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
        className="flex-1 accent-[hsl(var(--primary))]"
      />
      <div className="w-12 text-right text-xs text-muted-foreground">{controls[key]}%</div>
    </div>
  );

  return (
    <MiniGameShell
      title="Crack the Hash"
      subtitle="Dial clock / voltage / fan until the live hash collides with the target."
      status={`target hash ${targetHash}`}
      hint="Subtle offsets near the green band are more stable."
    >
      <div className="flex flex-col gap-4">
        <MiniGameCanvas onComplete={onComplete} createScene={createScene} />
        <div className="space-y-3">{['clock', 'volt', 'fan'].map((k) => slider(k.toUpperCase(), k as keyof Tuning))}</div>
      </div>
    </MiniGameShell>
  );
}
