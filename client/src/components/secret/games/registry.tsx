import { Button } from '@/components/ui/button';
import type { DarkMiniGameProps } from '../types';
import type { GameModule } from '@/games/types';
import asicRepair from '@/games/asicRepair';
import blockDecryptor from '@/games/blockDecryptor';
import hashrateDodger from '@/games/hashrateDodger';
import psuBalancer from '@/games/psuBalancer';
import voltageSurge from '@/games/voltageSurge';
import fanFury from '@/games/fanFury';
import nanoTuneReflex from '@/games/nanoTuneReflex';
import blockbuilder from '@/games/blockbuilder';
import countermeasure from '@/games/countermeasure';

export type MiniGameKey =
  | 'asic-repair'
  | 'block-decryptor'
  | 'hashrate-dodger'
  | 'psu-balancer'
  | 'voltage-surge'
  | 'fan-fury'
  | 'nano-tune-reflex'
  | 'blockbuilder'
  | 'countermeasure';

export type MiniGameEntry = {
  key: MiniGameKey;
  component: (props: DarkMiniGameProps) => JSX.Element;
  title: string;
  description: string;
  tech: 'pixi' | 'babylon';
};

const wrap = (
  meta: GameModule,
  hint: string,
  ctaLabel = 'Mark Complete',
): MiniGameEntry => ({
  key: meta.id as MiniGameKey,
  title: meta.title,
  description: meta.description,
  tech: meta.tech,
  component: ({ onComplete }: DarkMiniGameProps) => (
    <div className="gridrunner-surface border border-transparent p-3 sm:p-4 space-y-3 shadow-chrome">
      <meta.Component />
      <div className="flex items-center justify-between gap-3 border border-border/30 bg-background/40 rounded-lg px-3 py-2">
        <div className="text-xs text-muted-foreground">{hint}</div>
        <Button
          type="button"
          variant="accent"
          size="sm"
          className="uppercase tracking-wide"
          onClick={onComplete}
        >
          {ctaLabel}
        </Button>
      </div>
    </div>
  ),
});

export const MINI_GAMES: MiniGameEntry[] = [
  wrap(asicRepair, 'Repair every faulty chip with minimal toggles.'),
  wrap(blockDecryptor, 'Rotate runes until the header conduit is seamless.'),
  wrap(hashrateDodger, 'Survive the corrupted hashstream without a collision.'),
  wrap(psuBalancer, 'Hold all rails within the safe envelope as the ranges drift.'),
  wrap(voltageSurge, 'Time the tap in the green window; streak to prove stability.'),
  wrap(fanFury, 'Cool hotspots quickly; keep thermal load under control.'),
  wrap(nanoTuneReflex, 'React instantly to the incoming tuning glyphs.'),
  wrap(blockbuilder, 'Stack aligned templates; only overlaps persist.'),
  wrap(countermeasure, 'Target hostile packets before they breach your perimeter.'),
];

export const getMiniGameByKey = (key: MiniGameKey) =>
  MINI_GAMES.find((game) => game.key === key) ?? MINI_GAMES[0];
