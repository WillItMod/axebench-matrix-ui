import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { DarkMiniGameProps } from '../types';

export type MiniGameKey =
  | '2048'
  | 'hextris'
  | 'clumsy-bird'
  | 'hexgl'
  | 'astray'
  | 'js13k'
  | 'pixel-defense'
  | 'breakout'
  | 'dark-room'
  | 'kontra';

export type MiniGameEntry = {
  key: MiniGameKey;
  title: string;
  description: string;
  src: string;
  hint: string;
  component: (props: DarkMiniGameProps & { onMarkComplete: () => void }) => JSX.Element;
};

const HtmlGameCard = ({
  title,
  description,
  src,
  hint,
  onMarkComplete,
}: {
  title: string;
  description: string;
  src: string;
  hint: string;
  onMarkComplete: () => void;
}) => {
  const [loaded, setLoaded] = useState(false);
  const safeSrc = useMemo(() => src, [src]);
  return (
    <div className="gridrunner-surface border border-transparent p-3 sm:p-4 space-y-3 shadow-chrome">
      <div className="space-y-1">
        <div className="text-base font-semibold uppercase tracking-[0.12em] text-foreground">
          {title}
        </div>
        <div className="text-sm text-muted-foreground">{description}</div>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-border/40 bg-black/60">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
            Loading game…
          </div>
        )}
        <iframe
          src={safeSrc}
          title={title}
          onLoad={() => setLoaded(true)}
          className="w-full h-[440px]"
          sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-forms"
          allow="autoplay; fullscreen"
        />
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-background/60 px-3 py-2">
        <div className="text-xs text-muted-foreground">{hint}</div>
        <Button type="button" variant="accent" size="sm" className="uppercase tracking-wide" onClick={onMarkComplete}>
          Mark Complete
        </Button>
      </div>
    </div>
  );
};

const makeEntry = (config: Omit<MiniGameEntry, 'component'>): MiniGameEntry => ({
  ...config,
  component: ({ onComplete, onMarkComplete }: DarkMiniGameProps & { onMarkComplete: () => void }) => (
    <HtmlGameCard
      title={config.title}
      description={config.description}
      src={config.src}
      hint={config.hint}
      onMarkComplete={() => {
        onMarkComplete();
        onComplete();
      }}
    />
  ),
});

export const MINI_GAMES: MiniGameEntry[] = [
  makeEntry({
    key: '2048',
    title: '2048',
    description: 'Slide, merge, reach 2048. Tiny, clean, classic.',
    src: 'https://play2048.co/',
    hint: 'Merge tiles into the 2048 block.',
  }),
  makeEntry({
    key: 'hextris',
    title: 'Hextris',
    description: 'Hexagonal spin on Tetris. Keep the stack alive.',
    src: 'https://hextris.github.io/',
    hint: 'Rotate the hex and clear lines.',
  }),
  makeEntry({
    key: 'clumsy-bird',
    title: 'Clumsy Bird',
    description: 'Flappy-style flyer with physics polish.',
    src: 'https://ellisonleao.github.io/clumsy-bird/',
    hint: 'Tap/space to dodge pipes.',
  }),
  makeEntry({
    key: 'hexgl',
    title: 'HexGL',
    description: 'WebGL anti-grav racing for the “wow” factor.',
    src: 'http://hexgl.bkcore.com/play/',
    hint: 'Arrow keys for speed; avoid walls.',
  }),
  makeEntry({
    key: 'astray',
    title: 'Astray',
    description: 'First-person maze runner built on Three.js.',
    src: 'https://wwwtyro.github.io/Astray/',
    hint: 'Find the exit without falling.',
  }),
  makeEntry({
    key: 'js13k',
    title: 'JS13k Winner',
    description: 'Ultra-light microgame from JS13k entries.',
    src: 'https://js13kgames.com/games/evil-glitch/index.html',
    hint: 'Beat the mini arcade to proceed.',
  }),
  makeEntry({
    key: 'pixel-defense',
    title: 'Pixel Defense',
    description: 'Compact tower defense on pure canvas.',
    src: 'https://schteppe.github.io/pixel-defense/',
    hint: 'Defend the core; place wisely.',
  }),
  makeEntry({
    key: 'breakout',
    title: 'Breakout',
    description: 'Mozilla’s clean breakout implementation.',
    src: 'https://mdn.github.io/breakout/',
    hint: 'Clear the bricks. Paddle to survive.',
  }),
  makeEntry({
    key: 'dark-room',
    title: 'A Dark Room',
    description: 'Minimalist RPG with cult vibes.',
    src: 'https://adarkroom.doublespeakgames.com/',
    hint: 'Stoke the fire. Explore the dark.',
  }),
  makeEntry({
    key: 'kontra',
    title: 'Kontra Demo',
    description: 'Micro-engine sample—tiny but slick.',
    src: 'https://straker.github.io/kontra/',
    hint: 'Play a demo and claim completion.',
  }),
];

export const getMiniGameByKey = (key: MiniGameKey) =>
  MINI_GAMES.find((game) => game.key === key) ?? MINI_GAMES[0];
