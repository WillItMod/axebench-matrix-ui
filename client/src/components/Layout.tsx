import { MouseEvent, ReactNode, useEffect, useState } from 'react';
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

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { secretUnlocked } = useTheme();
  const [location, setLocation] = useLocation();
  const [uptime, setUptime] = useState<string>('N/A');
  const [uptimeAvailable, setUptimeAvailable] = useState(true);
  const [licenseTier, setLicenseTier] = useState<'free' | 'premium' | 'ultimate'>('free');
  const [deviceCount, setDeviceCount] = useState<number>(0);
  const [deviceLimit, setDeviceLimit] = useState<number>(5);
  const [isPatron, setIsPatron] = useState<boolean>(false);
  const [licenseLoaded, setLicenseLoaded] = useState(false);
  const REMINDER_KEY = 'axebench_egg_reminder_at';

  // Fetch uptime from backend
  useEffect(() => {
    const fetchUptime = async () => {
      try {
        const data = await api.system.uptime();
        if ((data as any)?.skipped) {
          setUptimeAvailable(false);
          setUptime('N/A');
          return;
        }
        const seconds = Number(data?.uptime_seconds);
        if (!Number.isFinite(seconds) || seconds <= 0) {
          setUptime('N/A');
        } else {
          setUptime(formatUptime(seconds));
        }
      } catch (error) {
        setUptimeAvailable(false);
        setUptime('N/A');
        console.warn('Failed to fetch uptime:', error);
      }
    };

    // Initial fetch
    fetchUptime();

    // Update every 30 seconds
    const interval = setInterval(() => {
      if (uptimeAvailable) {
        fetchUptime();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [uptimeAvailable]);

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
      <div className="relative z-30 space-y-2 px-3 pt-2">
        <div className="min-h-[36px]">
          <BenchmarkStatusBanner />
        </div>
        <div className="min-h-[36px]">
          <NanoTuneStatusBanner />
        </div>
        <div className="min-h-[36px]">
          <AutoTuneStatusBanner />
        </div>
        <div className="min-h-[56px] flex items-stretch transition-all duration-200">{licenseBanner}</div>
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
                    <Button
                      key={tab.path}
                      onClick={() => setLocation(tab.path)}
                      variant={isActive ? 'default' : 'outline'}
                      size="lg"
                      className={cn(
                        'uppercase tracking-[0.14em] font-bold px-5',
                        isActive
                          ? 'shadow-[0_0_18px_hsla(var(--primary),0.45)]'
                          : 'text-foreground/85 border-border'
                      )}
                    >
                      {tab.label}
                    </Button>
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
                <span>
                  UPTIME: <span className="text-[hsl(var(--secondary))]">{uptime}</span>
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
      </div>
    </div>
  );
}
