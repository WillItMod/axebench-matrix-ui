import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/contexts/ThemeContext';
import { MINI_GAMES, type MiniGameKey } from './games/registry';

type GameEntry = {
  key: MiniGameKey;
  component: (props: { onComplete: () => void }) => JSX.Element;
  title: string;
};

const games: GameEntry[] = MINI_GAMES;

const SECRET_UNLOCK_KEY = 'axebench_secret_unlocked';
const SECRET_THEME_KEY = 'axebench_secret_theme';
const THEME_KEY = 'axebench_theme';

export default function DarkModeChallengeHub() {
  const { setTheme, secretUnlocked, setSecretUnlocked } = useTheme();
  const [unlocked, setUnlocked] = useState(
    () => secretUnlocked || localStorage.getItem(SECRET_UNLOCK_KEY) === 'true'
  );
  const [replayMode, setReplayMode] = useState(false);
  const [gameKey, setGameKey] = useState<MiniGameKey>(
    () => games[Math.floor(Math.random() * games.length)].key
  );

  useEffect(() => {
    if (secretUnlocked) {
      setUnlocked(true);
      return;
    }
    if (
      localStorage.getItem(SECRET_UNLOCK_KEY) === 'true' ||
      localStorage.getItem(SECRET_THEME_KEY) === 'forge'
    ) {
      setUnlocked(true);
      setSecretUnlocked(true);
    }
  }, [secretUnlocked, setSecretUnlocked]);

  const Current = useMemo(
    () => games.find((g) => g.key === gameKey)?.component ?? games[0].component,
    [gameKey]
  );

  const complete = () => {
    setUnlocked(true);
    localStorage.setItem(SECRET_UNLOCK_KEY, 'true');
    localStorage.setItem(SECRET_THEME_KEY, 'forge');
    localStorage.setItem(THEME_KEY, 'forge');
    setSecretUnlocked(true);
    setTheme('forge');
    window.dispatchEvent(new CustomEvent('forge-celebrate'));
    setReplayMode(false);
  };

  if (unlocked) {
    return (
      <div className="gridrunner-surface border border-transparent p-5 text-foreground relative overflow-hidden space-y-3 shadow-chrome">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-secondary/5 to-primary/10 pointer-events-none" />
        <div className="relative space-y-1">
          <div className="text-lg font-semibold">Unlocked - Satoshi&apos;s Forge Online</div>
          <div className="text-sm text-muted-foreground">
            Forge theme is active. Run bonus challenges any time from the Bitcoin logo.
          </div>
        </div>
        <div className="relative flex flex-col gap-2">
          {!replayMode && (
            <Button
              onClick={() => {
                const next = games[Math.floor(Math.random() * games.length)]?.key ?? games[0].key;
                setGameKey(next);
                setReplayMode(true);
              }}
              variant="accent"
              size="sm"
              className="self-start uppercase tracking-wide"
            >
              Run a challenge for fun
            </Button>
          )}
          {replayMode && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Bonus challenge (Forge already unlocked)
                </div>
                <Button onClick={() => setReplayMode(false)} variant="secondary" size="sm" className="uppercase">
                  Close
                </Button>
              </div>
              <div className="gridrunner-surface border border-transparent p-3">
                <Current onComplete={complete} />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const reroll = () => {
    const remaining = games.filter((g) => g.key !== gameKey);
    const next = remaining[Math.floor(Math.random() * remaining.length)]?.key ?? games[0].key;
    setGameKey(next);
  };

  return (
    <div className="gridrunner-surface border border-transparent p-4 sm:p-5 text-foreground space-y-3 shadow-chrome">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">Dark Mode Challenges</div>
          <div className="text-xs text-muted-foreground">
            Beat any challenge to unlock Satoshi&apos;s Forge.
          </div>
        </div>
        <Button onClick={reroll} variant="accent" size="sm" className="uppercase">
          Spin another
        </Button>
      </div>
      <div className="gridrunner-surface border border-transparent p-3">
        <Current onComplete={complete} />
      </div>
    </div>
  );
}
