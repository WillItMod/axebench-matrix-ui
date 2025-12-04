import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { DarkMiniGameProps } from '../types';

export type MiniGameKey =
  | '2048'
  | 'hextris'
  | 'clumsy-bird'
  | 'astray'
  | 'dark-room'
  | 'kontra'
  | 'cat-survivors'
  | 'catapoolt'
  | 'clawstrike'
  | 'wash-the-cat';

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

      <div className="relative overflow-hidden rounded-xl border border-border/40 bg-[hsla(var(--card),var(--surface-strong))] backdrop-blur-sm">
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

      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-[hsla(var(--card),var(--surface-soft))] backdrop-blur-sm px-3 py-2">
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
    description: 'Slide, merge, reach 2048. Offline build.',
    src: '/games/2048/index.html',
    hint: 'Merge tiles into the 2048 block.',
  }),
  makeEntry({
    key: 'hextris',
    title: 'Hextris',
    description: 'Hexagonal spin on Tetris. Local copy.',
    src: '/games/hextris/index.html',
    hint: 'Rotate the hex and clear lines.',
  }),
  makeEntry({
    key: 'clumsy-bird',
    title: 'Clumsy Bird',
    description: 'Flappy-style flyer (offline assets).',
    src: '/games/clumsy-bird/index.html',
    hint: 'Tap/space to dodge pipes.',
  }),
  makeEntry({
    key: 'astray',
    title: 'Astray',
    description: 'First-person maze runner (local).',
    src: '/games/astray/index.html',
    hint: 'Find the exit without falling.',
  }),
  makeEntry({
    key: 'dark-room',
    title: 'A Dark Room',
    description: 'Minimalist RPG (local copy).',
    src: '/games/dark-room/index.html',
    hint: 'Stoke the fire. Explore the dark.',
  }),
  makeEntry({
    key: 'kontra',
    title: 'Kontra Demo',
    description: 'Micro-engine samples (local).',
    src: '/games/kontra/index.html',
    hint: 'Play a demo and claim completion.',
  }),
  makeEntry({
    key: 'cat-survivors',
    title: 'Cat Survivors',
    description: 'Arcade survivor—local build.',
    src: '/games/cat-survivors/index.html',
    hint: 'Stay alive, collect power-ups.',
  }),
  makeEntry({
    key: 'catapoolt',
    title: 'Catapoolt',
    description: 'Fling the cat—local microgame.',
    src: '/games/catapoolt/index.html',
    hint: 'Aim and launch to score.',
  }),
  makeEntry({
    key: 'clawstrike',
    title: 'Clawstrike',
    description: 'Quick reflex swipes—local.',
    src: '/games/clawstrike/index.html',
    hint: 'Strike targets before time runs out.',
  }),
  makeEntry({
    key: 'wash-the-cat',
    title: 'Wash the Cat',
    description: 'Casual mini—local assets.',
    src: '/games/wash-the-cat/index.html',
    hint: 'Keep the cat happy and clean.',
  }),
];

export const getMiniGameByKey = (key: MiniGameKey) =>
  MINI_GAMES.find((game) => game.key === key) ?? MINI_GAMES[0];
