import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/contexts/ThemeContext';
import { MINI_GAMES, type MiniGameKey } from './games/registry';
import { ConfirmDialog } from '@/components/ConfirmDialog';

const SECRET_UNLOCK_KEY = 'axebench_secret_unlocked';
const SECRET_THEME_KEY = 'axebench_secret_theme';
const THEME_KEY = 'axebench_theme';
const PROGRESS_KEY = 'axebench_egg_progress_v2';

type ProgressState = {
  completed: Record<MiniGameKey, boolean>;
  quizPassed: boolean;
};

const defaultProgress: ProgressState = {
  completed: {
    '2048': false,
    hextris: false,
    'clumsy-bird': false,
    astray: false,
    hexgl: false,
    pacman: false,
    'cat-survivors': false,
    'catapoolt': false,
    clawstrike: false,
    'wash-the-cat': false,
  },
  quizPassed: false,
};

const quizQuestions = [
  { q: 'What algorithm secures Bitcoin transactions?', a: 'SHA-256' },
  { q: 'What is the target block time for Bitcoin?', a: '10 minutes' },
  { q: 'What hardware does a Bitaxe optimize for?', a: 'ASIC' },
  { q: 'What triggers a Bitcoin halving?', a: '210,000 blocks' },
  { q: 'What’s the subsidy after the 4th halving?', a: '3.125 BTC' },
  { q: 'Which network layer enables lightning-fast BTC payments?', a: 'Lightning Network' },
  { q: 'Nonce tuning is used to find what?', a: 'A valid block hash' },
  { q: 'What metric is hashes per second?', a: 'Hashrate' },
  { q: 'What keeps temperature safe on a miner?', a: 'Heatsink and fan curve' },
  { q: 'Who invented Bitcoin?', a: 'Satoshi Nakamoto' },
];

const loadProgress = (): ProgressState => {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return defaultProgress;
    const parsed = JSON.parse(raw) as ProgressState;
    return {
      completed: { ...defaultProgress.completed, ...(parsed.completed || {}) },
      quizPassed: !!parsed.quizPassed,
    };
  } catch {
    return defaultProgress;
  }
};

const saveProgress = (state: ProgressState) => {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(state));
};

export default function DarkModeChallengeHub() {
  const { setTheme, secretUnlocked, setSecretUnlocked } = useTheme();
  const [progress, setProgress] = useState<ProgressState>(loadProgress);
  const [quizAnswers, setQuizAnswers] = useState<string[]>(Array(quizQuestions.length).fill(''));
  const [replayMode, setReplayMode] = useState(false);
  const [gameKey, setGameKey] = useState<MiniGameKey>(
    () => MINI_GAMES[Math.floor(Math.random() * MINI_GAMES.length)].key,
  );
  const [quizErrorOpen, setQuizErrorOpen] = useState(false);

  const completedCount = Object.values(progress.completed).filter(Boolean).length;
  const allGamesDone = completedCount === MINI_GAMES.length;
  const unlocked = secretUnlocked || (allGamesDone && progress.quizPassed);

  useEffect(() => {
    if (unlocked) {
      setSecretUnlocked(true);
      setTheme('forge');
      localStorage.setItem(SECRET_UNLOCK_KEY, 'true');
      localStorage.setItem(SECRET_THEME_KEY, 'forge');
      localStorage.setItem(THEME_KEY, 'forge');
      window.dispatchEvent(new CustomEvent('forge-celebrate'));
    }
  }, [unlocked, setSecretUnlocked, setTheme]);

  useEffect(() => {
    // restore legacy unlock
    if (
      secretUnlocked ||
      localStorage.getItem(SECRET_UNLOCK_KEY) === 'true' ||
      localStorage.getItem(SECRET_THEME_KEY) === 'forge'
    ) {
      setProgress((p) => ({ ...p, quizPassed: true, completed: { ...p.completed } }));
      setSecretUnlocked(true);
    }
  }, [secretUnlocked, setSecretUnlocked]);

  const Current = useMemo(
    () => MINI_GAMES.find((g) => g.key === gameKey)?.component ?? MINI_GAMES[0].component,
    [gameKey],
  );

  const markGameComplete = (key: MiniGameKey) => {
    setProgress((prev) => {
      const next = { ...prev, completed: { ...prev.completed, [key]: true } };
      saveProgress(next);
      return next;
    });
  };

  const reroll = () => {
    const remaining = MINI_GAMES.filter((g) => !progress.completed[g.key] && g.key !== gameKey);
    const pool = remaining.length ? remaining : MINI_GAMES.filter((g) => g.key !== gameKey);
    const next = pool[Math.floor(Math.random() * pool.length)]?.key ?? MINI_GAMES[0].key;
    setGameKey(next);
  };

  const handleQuizSubmit = () => {
    const allCorrect = quizQuestions.every((item, idx) => {
      const ans = (quizAnswers[idx] || '').trim().toLowerCase();
      return ans === item.a.trim().toLowerCase();
    });
    if (!allCorrect) {
      setQuizErrorOpen(true);
      return;
    }
    const next = { ...progress, quizPassed: true };
    setProgress(next);
    saveProgress(next);
    setSecretUnlocked(true);
    setTheme('forge');
    window.dispatchEvent(new CustomEvent('forge-celebrate'));
  };

  if (unlocked) {
    return (
      <>
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
                  const next = MINI_GAMES[Math.floor(Math.random() * MINI_GAMES.length)]?.key ?? MINI_GAMES[0].key;
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
                  <div className="text-sm text-muted-foreground">Bonus challenge (Forge already unlocked)</div>
                  <Button onClick={() => setReplayMode(false)} variant="secondary" size="sm" className="uppercase">
                    Close
                  </Button>
                </div>
                <div className="gridrunner-surface border border-transparent p-3">
                  <Current onComplete={() => {}} onMarkComplete={() => {}} />
                </div>
              </div>
            )}
          </div>
        </div>

        <ConfirmDialog
          open={quizErrorOpen}
          title="Try again"
          description="Some quiz answers are incorrect. Double-check the Bitcoin basics and resubmit."
          confirmLabel="Got it"
          cancelLabel="Close"
          onConfirm={() => setQuizErrorOpen(false)}
          onCancel={() => setQuizErrorOpen(false)}
          tone="warning"
        />
      </>
    );
  }

  const quizReady = allGamesDone;

  return (
    <div className="gridrunner-surface border border-transparent p-4 sm:p-5 text-foreground space-y-4 shadow-chrome">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">Secret Profile Unlock</div>
          <div className="text-xs text-muted-foreground">
            Play all 10 easter-egg games and ace the Bitcoin quiz to activate Forge.
          </div>
        </div>
        <Button onClick={reroll} variant="accent" size="sm" className="uppercase">
          Shuffle Game
        </Button>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border/40 bg-background/60 px-3 py-2 text-sm">
        <div>
          Progress: {completedCount}/{MINI_GAMES.length} games complete
          {progress.quizPassed ? ' • Quiz passed' : quizReady ? ' • Quiz ready' : ''}
        </div>
        <div className="text-xs text-muted-foreground">All tasks must be complete to unlock.</div>
      </div>

      <div className="gridrunner-surface border border-transparent p-3">
        <Current
          onComplete={() => markGameComplete(gameKey)}
          onMarkComplete={() => markGameComplete(gameKey)}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Final Quiz (Bitcoin / Bitaxe)</div>
          <Button
            size="sm"
            variant={quizReady ? 'accent' : 'secondary'}
            className="uppercase"
            disabled={!quizReady}
            onClick={handleQuizSubmit}
          >
            Submit Quiz
          </Button>
        </div>
        <div className="grid gap-2">
          {quizQuestions.map((item, idx) => (
            <label key={item.q} className="flex flex-col gap-1 rounded-lg border border-border/40 bg-background/40 p-2 text-xs">
              <span className="text-foreground">{idx + 1}. {item.q}</span>
              <input
                className="bg-transparent border border-border/60 rounded px-2 py-1 text-sm outline-none focus:border-[hsl(var(--accent))]"
                value={quizAnswers[idx]}
                onChange={(e) => {
                  const next = [...quizAnswers];
                  next[idx] = e.target.value;
                  setQuizAnswers(next);
                }}
                placeholder="Answer"
                disabled={!quizReady}
              />
            </label>
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={quizErrorOpen}
        title="Try again"
        description="Some quiz answers are incorrect. Review the questions and resubmit to unlock Forge."
        confirmLabel="Back to quiz"
        cancelLabel="Close"
        onConfirm={() => setQuizErrorOpen(false)}
        onCancel={() => setQuizErrorOpen(false)}
        tone="warning"
      />
    </div>
  );
}
