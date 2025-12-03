import { ReactNode, useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import MatrixBackground from './MatrixBackground';
import BenchmarkStatusBanner from './BenchmarkStatusBanner';
import NanoTuneStatusBanner from './NanoTuneStatusBanner';
import AutoTuneStatusBanner from './AutoTuneStatusBanner';
import { api, formatUptime } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const [uptime, setUptime] = useState<string>('N/A');
  const [uptimeAvailable, setUptimeAvailable] = useState(true);
  const [licenseTier, setLicenseTier] = useState<'free' | 'premium' | 'ultimate'>('free');
  const [deviceCount, setDeviceCount] = useState<number>(0);
  const [deviceLimit, setDeviceLimit] = useState<number>(5);
  const [isPatron, setIsPatron] = useState<boolean>(false);

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
        const tier: 'free' | 'premium' | 'ultimate' =
          tierRaw === 'premium' ? 'premium' : tierRaw === 'ultimate' ? 'ultimate' : 'free';
        setLicenseTier(tier);
        setDeviceLimit(Number(status?.device_limit) || (tier === 'ultimate' ? 250 : tier === 'premium' ? 25 : 5));
        setIsPatron(tier !== 'free' || !!status?.is_patron);
        if (status?.auth_url) {
          setPatreonUrl(status.auth_url);
        } else if (status?.patreon_url) {
          setPatreonUrl(status.patreon_url);
        }
      } catch {
        setLicenseTier('free');
        setDeviceLimit(5);
        setIsPatron(false);
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
    if (licenseTier === 'free' && !isPatron) {
      toast.info(`Free tier: up to ${deviceLimit} devices. Support on Patreon to unlock more.`, {
        duration: 8000,
      });
    }
  }, [licenseTier, isPatron, deviceLimit]);

  const overLimit = deviceCount > deviceLimit;
  const [patreonUrl, setPatreonUrl] = useState<string>(import.meta.env.VITE_PATREON_URL || 'https://www.patreon.com/axebench');

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
        <div className="bg-[var(--dark-gray)] border border-[var(--neon-cyan)] text-[var(--text-primary)] px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
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
        <div className="bg-[var(--dark-gray)] border border-[var(--matrix-green)] text-[var(--text-primary)] px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="text-sm">
            Ultimate supporter! Limit {deviceLimit} devices. Thanks for keeping AxeBench running strong.
          </div>
        </div>
      );
    }

    return null;
  };

  const tabs = [
    { path: '/', label: 'DASHBOARD', icon: '⚡' },
    { path: '/benchmark', label: 'BENCHMARK', icon: '🧪' },
    { path: '/monitoring', label: 'MONITORING', icon: '📈' },
    { path: '/sessions', label: 'SESSIONS', icon: '🗂️' },
    { path: '/profiles', label: 'PROFILES', icon: '🎛️' },
    { path: '/pool', label: 'POOL', icon: '🌐' },
    { path: '/operations', label: 'OPERATIONS', icon: '🛠️' },
    { path: '/settings', label: 'SETTINGS', icon: '⚙️' },
  ];

  return (
    <div className="min-h-screen relative">
      {/* Matrix Background */}
      <MatrixBackground />

      {/* Status Banners - Show across all pages when operations are running */}
      <BenchmarkStatusBanner />
      <NanoTuneStatusBanner />
      <AutoTuneStatusBanner />
      {renderLicenseBanner()}

      {/* Main Content */}
      <div className="relative z-20">
        {/* Header */}
        <header className="border-b-2 border-[var(--matrix-green)] bg-[var(--dark-gray)]/90 backdrop-blur-sm">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              {/* Logo */}
              <div className="flex items-center gap-4">
                <div className="text-3xl font-bold text-glow-green flicker">
                  [AXEBENCH]
                </div>
                <div className="text-sm text-[var(--neon-cyan)] text-glow-cyan">
                  MATRIX_UI_v2.0 | AxeBench_v3.0.0
                </div>
              </div>

              {/* Status Indicator */}
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-[var(--matrix-green)] rounded-full pulse-green box-glow-green" />
                <span className="text-[var(--matrix-green)] text-sm">SYSTEM_ONLINE</span>
              </div>
            </div>
          </div>
        </header>

        {/* Navigation Tabs */}
        <nav className="border-b border-[var(--grid-gray)] bg-[var(--dark-gray)]/80 backdrop-blur-sm">
          <div className="container mx-auto px-4">
            <div className="flex gap-1">
              {tabs.map((tab) => {
                const isActive = location === tab.path;
                return (
                  <Link key={tab.path} href={tab.path}>
                    <button
                      className={`
                        px-6 py-3 font-bold transition-all relative
                        ${
                          isActive
                            ? 'bg-[var(--matrix-green)]/20 text-[var(--matrix-green)] border-b-2 border-[var(--matrix-green)]'
                            : 'text-[var(--text-muted)] hover:text-[var(--neon-cyan)] hover:bg-[var(--grid-gray)]'
                        }
                      `}
                    >
                      <span className="mr-2">{tab.icon}</span>
                      {tab.label}
                      {isActive && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--matrix-green)] shadow-[0_0_10px_rgba(0,255,65,0.8)]" />
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
        <footer className="border-t border-[var(--grid-gray)] bg-[var(--dark-gray)]/80 backdrop-blur-sm mt-12">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between text-sm text-[var(--text-muted)]">
              <div>
                AxeBench Matrix Interface | Bitaxe Fleet Management System
              </div>
              <div className="flex items-center gap-4">
                <span>STATUS: <span className="text-[var(--matrix-green)]">OPERATIONAL</span></span>
                <span>UPTIME: <span className="text-[var(--neon-cyan)]">{uptime}</span></span>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
