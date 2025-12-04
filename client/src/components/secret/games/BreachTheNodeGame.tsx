import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import MiniGameCanvas from '../MiniGameCanvas';
import MiniGameShell from '../MiniGameShell';
import { DarkMiniGameProps } from '../types';

class BreachTheNodeScene extends Phaser.Scene {
  private onCompleteCb: () => void;
  private expected = ['scan -net --entropy', 'inject --probe-clock', 'unlock --matrix-core'];
  private index = 0;
  private logLines: string[] = [];
  private logText?: Phaser.GameObjects.Text;
  private ready = false;
  private completed = false;

  constructor(onComplete: () => void) {
    super('BreachTheNodeScene');
    this.onCompleteCb = onComplete;
  }

  create() {
    const { width, height } = this.scale;
    this.add.rectangle(width / 2, height / 2, width - 18, height - 18, 0x0d111c, 0.7).setStrokeStyle(2, 0x1e293b, 0.85);
    this.add.text(18, 14, 'matrix terminal', { fontFamily: 'monospace', fontSize: '12px', color: '#cbd5e1' });
    this.logText = this.add.text(18, 36, '', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#e2e8f0',
      lineSpacing: 4,
    });

    this.appendLog('[boot] establishing darkline link...');
    this.appendLog('[hint] enter 3 commands in sequence');
    this.ready = true;
  }

  submitCommand(command: string) {
    if (!this.ready || this.completed) return;
    const trimmed = command.trim();
    if (!trimmed) return;

    this.appendLog(`$ ${trimmed}`);

    if (trimmed === this.expected[this.index]) {
      this.index += 1;
      this.appendLog(`[ok] step ${this.index}/3 accepted`);
      if (this.index >= this.expected.length) {
        this.finish();
      }
    } else {
      this.appendLog('[err] command rejected');
    }
  }

  private finish() {
    this.completed = true;
    this.appendLog('ACCESS GRANTED');
    const banner = this.add.text(this.scale.width / 2, this.scale.height / 2, 'ACCESS GRANTED', {
      fontFamily: 'monospace',
      fontSize: '26px',
      color: '#a3e635',
    });
    banner.setOrigin(0.5);
    this.tweens.add({ targets: banner, scale: 1.12, yoyo: true, repeat: 6, duration: 150 });
    this.time.delayedCall(400, () => this.onCompleteCb());
  }

  private appendLog(line: string) {
    this.logLines.push(line);
    if (this.logLines.length > 12) this.logLines.shift();
    this.logText?.setText(this.logLines.join('\n'));
  }
}

export default function BreachTheNodeGame({ onComplete }: DarkMiniGameProps) {
  const [command, setCommand] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const sceneRef = useRef<BreachTheNodeScene | null>(null);

  const createScene = useCallback(
    (complete: () => void) => {
      const scene = new BreachTheNodeScene(complete);
      sceneRef.current = scene;
      return scene;
    },
    []
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    sceneRef.current?.submitCommand(command);
    setCommand('');
  };

  return (
    <MiniGameShell
      title="Breach the Node"
      subtitle="Feed the terminal the exact unlock sequence."
      status="forge unlock challenge"
      hint="Commands are strict; punctuation matters."
    >
      <div className="flex flex-col gap-4">
        <MiniGameCanvas onComplete={onComplete} createScene={createScene} />
        <form onSubmit={submit} className="flex gap-3">
          <input
            ref={inputRef}
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            className="flex-1 bg-card border border-border rounded-md px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/60"
            placeholder="Type command and press enter"
          />
          <button
            type="submit"
            className="px-4 py-2 text-sm rounded-md border border-border bg-card text-foreground hover:border-primary/60"
          >
            Send
          </button>
        </form>
      </div>
    </MiniGameShell>
  );
}
