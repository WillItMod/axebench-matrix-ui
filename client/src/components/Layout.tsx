import { MouseEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { Bitcoin } from 'lucide-react';
import { useLocation } from 'wouter';
import MatrixBackground from './MatrixBackground';
import BenchmarkStatusBanner from './BenchmarkStatusBanner';
import NanoTuneStatusBanner from './NanoTuneStatusBanner';
import AutoTuneStatusBanner from './AutoTuneStatusBanner';
import { api, formatUptime } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import BitcoinCelebrationOverlay from './BitcoinCelebrationOverlay';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import DarkModeChallengeHub from './secret/DarkModeChallengeHub';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import EasterEggLaunchers from './secret/EasterEggLaunchers';
import BitcoinLoreModal from './secret/BitcoinLoreModal';
import { MINI_GAMES, type MiniGameEntry } from './secret/games/registry';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { secretUnlocked, setSecretUnlocked, setTheme, theme, setMatrixRainbow } = useTheme();
  const [location, setLocation] = useLocation();
  const [uptimeSeconds, setUptimeSeconds] = useState<number | null>(null);
  const [licenseTier, setLicenseTier] = useState<'free' | 'premium' | 'ultimate'>('free');
  const [deviceCount, setDeviceCount] = useState<number>(0);
  const [deviceLimit, setDeviceLimit] = useState<number>(5);
  const [isPatron, setIsPatron] = useState<boolean>(false);
  const [licenseLoaded, setLicenseLoaded] = useState(false);
  const REMINDER_KEY = 'axebench_egg_reminder_at';
  const RANDOM_GAME_KEY = 'axebench_random_game_last';
  const RANDOM_GAME_COOLDOWN_MS = 15 * 60 * 1000;
  const SECRET_GAME_TAPS_REQUIRED = 5;
  const SECRET_TAP_RESET_MS = 4000;
  const SATOSHI_MODE_KEY = 'axebench_satoshi_mode';
  const SECRET_UNLOCK_KEY = 'axebench_secret_unlocked';
  const SECRET_THEME_KEY = 'axebench_secret_theme';

  // Fetch uptime from backend and keep it ticking between polls
  useEffect(() => {
    let cancelled = false;

    const fetchUptime = async () => {
      try {
        const data = await api.system.uptime();
        if ((data as any)?.skipped) {
          if (!cancelled) {
            setUptimeSeconds(null);
          }
          return;
        }
        const seconds = Number((data as any)?.uptime_seconds);
        if (!Number.isFinite(seconds) || seconds <= 0) {
          if (!cancelled) {
            setUptimeSeconds(null);
          }
          return;
        }
        if (!cancelled) {
          setUptimeSeconds(seconds);
        }
      } catch (error) {
        if (!cancelled) {
          setUptimeSeconds(null);
        }
        console.warn('Failed to fetch uptime:', error);
      }
    };

    // Initial fetch
    fetchUptime();

    // Update every 30 seconds
    const interval = setInterval(fetchUptime, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Increment uptime every second so the clock keeps moving between backend polls
  useEffect(() => {
    const hasBaseline = uptimeSeconds !== null;
    if (!hasBaseline) return;
    const interval = window.setInterval(() => {
      setUptimeSeconds((prev) => (prev === null ? prev : prev + 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [uptimeSeconds !== null]);

  // License tier + device count (for limits and messaging)
  useEffect(() => {
    const loadLicense = async () => {
      try {
        const status = await api.license.status().catch(() => null);
        const tierRaw = (status?.tier as string | undefined)?.toLowerCase();
        let tier: 'free' | 'premium' | 'ultimate' = 'free';
        if (tierRaw === 'ultimate' || status?.is_patron) tier = 'ultimate';
        else if (tierRaw === 'premium') tier = 'premium';
        setLicenseTier(tier);
        const limit =
          Number(status?.device_limit) ||
          (tier === 'ultimate' ? 250 : tier === 'premium' ? 25 : 5);
        setDeviceLimit(limit);
        setIsPatron(tier !== 'free' || !!status?.is_patron);
        if (status?.auth_url) {
          setPatreonUrl(status.auth_url);
        } else if (status?.patreon_url) {
          setPatreonUrl(status.patreon_url);
        }
        setLicenseLoaded(true);
      } catch {
        setLicenseTier('free');
        setDeviceLimit(5);
        setIsPatron(false);
        setLicenseLoaded(true);
      }
    };

    const loadDevices = async () => {
      try {
        const devices = await api.devices.list();
        setDeviceCount(Array.isArray(devices) ? devices.length : 0);
      } catch {
        setDeviceCount(0);
      }
    };

    loadLicense();
    loadDevices();
  }, []);

  // Nag for free tier on load
  useEffect(() => {
    if (licenseLoaded && licenseTier === 'free' && !isPatron) {
      toast.info(`Free tier: up to ${deviceLimit} devices. Support on Patreon to unlock more.`, {
        duration: 8000,
      });
    }
  }, [licenseTier, isPatron, deviceLimit, licenseLoaded]);

  // Monthly nudge to hunt easter eggs
  useEffect(() => {
    if (secretUnlocked) return;
    const now = Date.now();
    const last = Number(localStorage.getItem(REMINDER_KEY) || 0);
    const monthMs = 30 * 24 * 60 * 60 * 1000;
    if (now - last > monthMs && Math.random() < 0.6) {
      toast.info('Hidden protocols detected. Hunt the easter eggs to unlock the secret profile.', {
        duration: 9000,
      });
      localStorage.setItem(REMINDER_KEY, String(now));
    }
  }, [secretUnlocked]);

  const overLimit = deviceCount > deviceLimit;
  const [patreonUrl, setPatreonUrl] = useState<string>(
    import.meta.env.VITE_PATREON_URL || 'https://www.patreon.com/axebench'
  );
  const [showSecret, setShowSecret] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [coinTaps, setCoinTaps] = useState(0);
  const [loreOpen, setLoreOpen] = useState(false);
  const [randomGame, setRandomGame] = useState<MiniGameEntry | null>(null);
  const [randomGameOpen, setRandomGameOpen] = useState(false);
  const [lastRandomLaunch, setLastRandomLaunch] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    const stored = Number(localStorage.getItem(RANDOM_GAME_KEY) || 0);
    return Number.isFinite(stored) ? stored : 0;
  });
  const [satoshiMode, setSatoshiMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(SATOSHI_MODE_KEY) === 'true';
  });
  const previousThemeRef = useRef<string | null>(null);
  const hiddenGameClicksRef = useRef(0);
  const secretTapResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uptimeDisplay = uptimeSeconds !== null ? formatUptime(uptimeSeconds) : 'N/A';

  // Keep forge unlock + theme aligned when satoshiMode flips
  useEffect(() => {
    if (!satoshiMode) return;
    previousThemeRef.current = theme;
    if (theme !== 'forge') {
      setTheme('forge');
    }
    if (!secretUnlocked) {
      setSecretUnlocked(true);
      localStorage.setItem(SECRET_UNLOCK_KEY, 'true');
    }
    localStorage.setItem(SECRET_THEME_KEY, 'forge');
    setMatrixRainbow(true);
    window.dispatchEvent(new CustomEvent('forge-celebrate'));
  }, [satoshiMode, theme, setTheme, secretUnlocked, setSecretUnlocked, setMatrixRainbow]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(SATOSHI_MODE_KEY, satoshiMode ? 'true' : 'false');
    document.documentElement.dataset.satoshiMode = satoshiMode ? 'on' : 'off';
    window.dispatchEvent(new CustomEvent('axebench:satoshi-mode', { detail: { enabled: satoshiMode } }));
  }, [satoshiMode]);

  useEffect(() => {
    const handler = () => {
      setCelebrate(true);
      setShowSecret(false);
    };
    window.addEventListener('forge-celebrate', handler);
    return () => window.removeEventListener('forge-celebrate', handler);
  }, []);

  const handleBitcoinClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (secretUnlocked && event.altKey) {
      setShowSecret((prev) => !prev);
      return;
    }
    setCoinTaps(0);
    setCelebrate(true);
  };

  const handleCelebrationFinished = () => {
    // Keep overlay for coin tapping; do not auto-close here.
  };

  const handleRandomGameDone = () => {
    setRandomGameOpen(false);
    setRandomGame(null);
  };

  const handleUptimeClick = () => {
    const now = Date.now();
    const remaining = RANDOM_GAME_COOLDOWN_MS - (now - lastRandomLaunch);
    if (remaining > 0) {
      const minutes = Math.ceil(remaining / 60000);
      toast.info(`Uptime portal cooling down. Try again in ~${minutes} minute${minutes === 1 ? '' : 's'}.`, {
        duration: 3500,
      });
      return;
    }

    const pick = MINI_GAMES[Math.floor(Math.random() * MINI_GAMES.length)];
    setRandomGame(pick);
    setRandomGameOpen(true);
    setLastRandomLaunch(now);
    if (typeof window !== 'undefined') {
      localStorage.setItem(RANDOM_GAME_KEY, String(now));
    }
  };

  const handleHiddenGameZoneClick = () => {
    const next = hiddenGameClicksRef.current + 1;
    hiddenGameClicksRef.current = next;
    if (secretTapResetRef.current) {
      clearTimeout(secretTapResetRef.current);
    }
    secretTapResetRef.current = window.setTimeout(() => {
      hiddenGameClicksRef.current = 0;
    }, SECRET_TAP_RESET_MS);

    if (next >= SECRET_GAME_TAPS_REQUIRED) {
      hiddenGameClicksRef.current = 0;
      if (secretTapResetRef.current) {
        clearTimeout(secretTapResetRef.current);
        secretTapResetRef.current = null;
      }
      handleUptimeClick();
    }
  };

  useEffect(() => {
    return () => {
      if (secretTapResetRef.current) {
        clearTimeout(secretTapResetRef.current);
      }
    };
  }, []);

  const renderLicenseBanner = () => {
    const bannerBase =
      'gridrunner-surface text-foreground px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3 shadow-chrome border border-transparent';

    if (licenseTier === 'free') {
      return (
        <div className={bannerBase}>
          <div className="text-sm text-muted-foreground">
            Free tier: up to {deviceLimit} devices. You have {deviceCount}.{' '}
            {overLimit ? 'Some features may be limited.' : 'Support to unlock more.'}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="accent"
              className="uppercase tracking-wide"
              onClick={() => window.open(patreonUrl, '_blank')}
            >
              Support on Patreon
            </Button>
          </div>
        </div>
      );
    }

    if (licenseTier === 'premium') {
      return (
        <div className={bannerBase}>
          <div className="text-sm text-muted-foreground">
            Premium: up to {deviceLimit} devices. Thanks for supporting! Devices: {deviceCount}.
          </div>
          <Button
            size="sm"
            variant="accent"
            className="uppercase tracking-wide"
            onClick={() => window.open(patreonUrl, '_blank')}
          >
            Upgrade to Ultimate
          </Button>
        </div>
      );
    }

    if (licenseTier === 'ultimate') {
      return (
        <div className={bannerBase}>
          <div className="text-sm text-muted-foreground">
            Ultimate supporter! Limit {deviceLimit} devices. Thanks for keeping AxeBench running strong.
          </div>
        </div>
      );
    }

    return null;
  };

  const tabs = [
    { path: '/', label: 'DASHBOARD' },
    { path: '/benchmark', label: 'BENCHMARK' },
    { path: '/monitoring', label: 'MONITORING' },
    { path: '/sessions', label: 'SESSIONS' },
    { path: '/profiles', label: 'PROFILES' },
    { path: '/pool', label: 'POOL' },
    { path: '/operations', label: 'OPERATIONS' },
    { path: '/settings', label: 'SETTINGS' },
  ];

  const baseTabClass =
    'px-5 py-2 rounded-xl border text-xs md:text-sm tracking-[0.25em] uppercase transition-all duration-150 shadow-[0_0_0_rgba(0,0,0,0)]';
  const inactiveTabClass =
    'bg-[hsla(var(--card),0.7)] border-[var(--grid-gray)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[hsla(var(--accent),0.45)] hover:shadow-[0_0_12px_hsla(var(--accent),0.28)]';
  const activeTabClass =
    'bg-[hsl(var(--accent))] border-[hsla(var(--accent),0.85)] text-[hsl(var(--accent-foreground))] shadow-[0_0_20px_hsla(var(--accent),0.55),0_0_30px_hsla(var(--primary),0.35)]';

  const licenseBanner = renderLicenseBanner();

  const handleLoreUnlocked = () => {
    setShowSecret(true);
    setLoreOpen(false);
  };

  return (
    <div className="min-h-screen relative bg-background text-foreground overflow-x-hidden">
      <BitcoinCelebrationOverlay
        active={celebrate}
        onFinished={handleCelebrationFinished}
        onCoinTap={(count) => {
          setCoinTaps(count);
          if (count >= 10) {
            setCelebrate(false);
            setLoreOpen(true);
          }
        }}
        onDismiss={() => setCelebrate(false)}
      />
      {/* Matrix Background */}
      <MatrixBackground />
      <EasterEggLaunchers />

      {/* Status Banners - Show across all pages when operations are running */}
      <div className="relative z-30 space-y-2 px-3">
        <BenchmarkStatusBanner />
        <NanoTuneStatusBanner />
        <AutoTuneStatusBanner />
        {licenseBanner}
      </div>

      {/* Main Content */}
      <div className="relative z-20">
        {/* Header */}
        <header className="px-4">
          <div className="container mx-auto">
            <div className="gridrunner-surface border border-transparent shadow-chrome px-4 py-3 flex items-center justify-between gap-3">
              {/* Logo */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleBitcoinClick}
                  className="group flex items-center gap-[3px] text-foreground transition"
                >
                  <span className="text-2xl font-semibold tracking-tight">AXE</span>
                  <span className="relative inline-flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 via-orange-500 to-yellow-400 text-slate-900 shadow-[0_0_18px_rgba(251,191,36,0.65)] border-2 border-amber-200 group-hover:scale-105 transition-transform">
                    <Bitcoin className="w-5 h-5" />
                  </span>
                  <span className="text-2xl font-semibold tracking-tight">BENCH</span>
                </button>
                <div className="text-xs uppercase text-muted-foreground">
                  UI v2.0 | AxeBench v3.0.0 {secretUnlocked ? ' | Forge Ready' : ''}
                </div>
              </div>

              {/* Status Indicator */}
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-primary rounded-full shadow-[0_0_12px_rgba(34,197,94,0.6)] animate-pulse" />
                <span className="text-sm text-muted-foreground">SYSTEM_ONLINE</span>
              </div>
            </div>
          </div>
        </header>

        <nav className="px-4 mt-0.5">
          <div className="container mx-auto">
              <div className="gridrunner-surface border border-transparent shadow-chrome px-3 py-2">
              <div className="flex flex-wrap gap-2">
                {tabs.map((tab) => {
                  const isActive = location === tab.path;
                  return (
                    <button
                      key={tab.path}
                      type="button"
                      onClick={() => setLocation(tab.path)}
                      className={cn(baseTabClass, isActive ? activeTabClass : inactiveTabClass)}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </nav>

        {/* Page Content */}
        <main className="container mx-auto px-4 py-6">{children}</main>

        {/* Footer */}
        <footer className="px-4 mt-12">
          <div className="container mx-auto">
            <div className="gridrunner-surface border border-transparent shadow-chrome px-4 py-4 flex items-center justify-between text-sm text-muted-foreground">
              <div>AxeBench Interface | Bitaxe Fleet Management System</div>
              <div className="flex items-center gap-4">
                <span>
                  STATUS: <span className="text-[hsl(var(--primary))]">OPERATIONAL</span>
                </span>
                <span className="relative inline-block select-none">
                  UPTIME:{' '}
                  <span className="text-[hsl(var(--secondary))]">{uptimeDisplay}</span>
                  <span
                    role="presentation"
                    className="absolute inset-0 cursor-default"
                    onClick={handleHiddenGameZoneClick}
                  />
                </span>
              </div>
            </div>
          </div>
        </footer>

        <BitcoinLoreModal open={loreOpen} onClose={() => setLoreOpen(false)} onUnlocked={handleLoreUnlocked} />

        <Dialog open={showSecret} onOpenChange={setShowSecret}>
          <DialogContent className="max-w-3xl shadow-chrome">
            <DarkModeChallengeHub />
          </DialogContent>
        </Dialog>

        <Dialog
          open={randomGameOpen}
          onOpenChange={(val) => {
            setRandomGameOpen(val);
            if (!val) setRandomGame(null);
          }}
        >
          <DialogContent className="w-[98vw] max-w-[1280px] max-h-[90vh] shadow-chrome">
            {randomGame ? (
              <div className="space-y-3">
                <div className="text-sm text-muted-foreground">
                  System uptime unlocked: {randomGame.title}
                </div>
                {(() => {
                  const Game = randomGame.component;
                  return (
                    <Game
                      onComplete={handleRandomGameDone}
                      onMarkComplete={handleRandomGameDone}
                      showCompletionCta={false}
                    />
                  );
                })()}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No game selected.</div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
