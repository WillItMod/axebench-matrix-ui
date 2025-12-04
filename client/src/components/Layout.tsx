import { ReactNode, useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import MatrixBackground from './MatrixBackground';
import BenchmarkStatusBanner from './BenchmarkStatusBanner';
import NanoTuneStatusBanner from './NanoTuneStatusBanner';
import AutoTuneStatusBanner from './AutoTuneStatusBanner';
import { api, formatUptime } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import BitcoinCelebrationOverlay from './BitcoinCelebrationOverlay';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import DarkModeChallengeHub from './DarkModeChallengeHub';
import { useTheme } from '@/contexts/ThemeContext';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { secretUnlocked } = useTheme();
  const [location] = useLocation();
  const [uptime, setUptime] = useState<string>('N/A');
  const [uptimeAvailable, setUptimeAvailable] = useState(true);
  const [licenseTier, setLicenseTier] = useState<'free' | 'premium' | 'ultimate'>('free');
  const [deviceCount, setDeviceCount] = useState<number>(0);
  const [deviceLimit, setDeviceLimit] = useState<number>(5);
  const [isPatron, setIsPatron] = useState<boolean>(false);
  const [licenseLoaded, setLicenseLoaded] = useState(false);

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

  const overLimit = deviceCount > deviceLimit;
  const [patreonUrl, setPatreonUrl] = useState<string>(import.meta.env.VITE_PATREON_URL || 'https://www.patreon.com/axebench');
  const [showSecret, setShowSecret] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  useEffect(() => {
    const handler = () => setCelebrate(true);
    window.addEventListener('forge-celebrate', handler);
    return () => window.removeEventListener('forge-celebrate', handler);
  }, []);

  const renderLicenseBanner = () => {
    if (licenseTier === 'free') {
      return (
        <div className="bg-[var(--dark-gray)] border border-[var(--warning-amber)] text-[var(--text-primary)] px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="text-sm">
            Free tier: up to {deviceLimit} devices. You have {deviceCount}. {overLimit ? 'Some features may be limited.' : 'Support to unlock more.'}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="btn-matrix"
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
        <div className="bg-card border border-border text-foreground px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="text-sm">
            Premium: up to {deviceLimit} devices. Thanks for supporting! Devices: {deviceCount}.
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.open(patreonUrl, '_blank')}
          >
            Upgrade to Ultimate
          </Button>
        </div>
      );
    }

    if (licenseTier === 'ultimate') {
      return (
        <div className="bg-card border border-border text-foreground px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="text-sm">
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

  return (
    <div className="min-h-screen relative bg-background text-foreground">
      <BitcoinCelebrationOverlay active={celebrate} onFinished={() => setCelebrate(false)} />
      {/* Matrix Background */}
      <MatrixBackground />

      {/* Status Banners - Show across all pages when operations are running */}
      <div className="relative z-10 space-y-2">
        <div className="min-h-[36px]">
          <BenchmarkStatusBanner />
        </div>
        <div className="min-h-[36px]">
          <NanoTuneStatusBanner />
        </div>
        <div className="min-h-[36px]">
          <AutoTuneStatusBanner />
        </div>
        <div className="min-h-[56px] flex items-stretch transition-all duration-200">
          {licenseBanner}
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-20">
        {/* Header */}
        <header className="border-b border-border bg-card/90 backdrop-blur-sm">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              {/* Logo */}
              <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => {
                if (secretUnlocked) setCelebrate(true);
                else setShowSecret(true);
              }}
              className="flex items-center gap-1 text-3xl font-bold text-[var(--theme-primary)] hover:text-[var(--theme-secondary)] transition"
            >
              <span className="text-foreground">AXE</span>

              <span className="relative inline-flex items-center justify-center w-9 h-9 -mx-[3px] rounded-full bg-gradient-to-br from-amber-500 via-orange-500 to-yellow-400 text-slate-900 shadow-[0_0_18px_rgba(251,191,36,0.75)] border-2 border-amber-200">
                ₿
              </span>

              <span className="text-foreground">ENCH</span>
            </button>
                <div className="text-sm text-muted-foreground">
                  UI v2.0 | AxeBench v3.0.0
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

        {/* Navigation Tabs */}
        <nav className="border-b border-border bg-card/80 backdrop-blur-sm">
          <div className="container mx-auto px-4">
            <div className="flex gap-1">
              {tabs.map((tab) => {
                const isActive = location === tab.path;
                return (
                  <Link key={tab.path} href={tab.path}>
                    <button
                      className={`
                        px-6 py-3 font-bold uppercase tracking-wide transition-all relative rounded-md border
                        ${
                          isActive
                            ? 'text-primary-foreground bg-primary border-primary shadow-[0_0_16px_rgba(34,197,94,0.45)]'
                            : 'text-foreground/90 hover:text-primary hover:border-primary hover:shadow-[0_0_10px_rgba(34,211,238,0.3)] hover:bg-muted border-border bg-card/60'
                        }
                      `}
                    >
                      {tab.label}
                      {isActive && (
                        <div className="absolute inset-0 rounded-md pointer-events-none shadow-[0_0_22px_rgba(0,255,65,0.55)]" />
                      )}
                    </button>
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>

        {/* Page Content */}
        <main className="container mx-auto px-4 py-6">
          {children}
        </main>

        {/* Footer */}
        <footer className="border-t border-border bg-card/80 backdrop-blur-sm mt-12">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <div>
                AxeBench Interface | Bitaxe Fleet Management System
              </div>
              <div className="flex items-center gap-4">
                <span>STATUS: <span className="text-primary">OPERATIONAL</span></span>
                <span>UPTIME: <span className="text-secondary">{uptime}</span></span>
              </div>
            </div>
          </div>
        </footer>

        <Dialog open={showSecret} onOpenChange={setShowSecret}>
          <DialogContent className="bg-[var(--dark-gray)] border border-[var(--grid-gray)] shadow-[0_0_20px_rgba(0,255,65,0.25)] max-w-3xl">
            <DarkModeChallengeHub />
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
