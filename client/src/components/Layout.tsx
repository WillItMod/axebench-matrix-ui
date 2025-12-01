import { ReactNode, useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import MatrixBackground from './MatrixBackground';
import BenchmarkStatusBanner from './BenchmarkStatusBanner';
import NanoTuneStatusBanner from './NanoTuneStatusBanner';
import AutoTuneStatusBanner from './AutoTuneStatusBanner';
import { api, formatUptime } from '@/lib/api';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const [uptime, setUptime] = useState<string>('∞');

  // Fetch uptime from backend
  useEffect(() => {
    const fetchUptime = async () => {
      try {
        const data = await api.system.uptime();
        setUptime(formatUptime(data.uptime_seconds));
      } catch (error) {
        // If backend is down or endpoint not available, keep infinity symbol
        console.warn('Failed to fetch uptime:', error);
      }
    };

    // Initial fetch
    fetchUptime();

    // Update every 30 seconds
    const interval = setInterval(fetchUptime, 30000);
    return () => clearInterval(interval);
  }, []);

  const tabs = [
    { path: '/', label: 'DASHBOARD', icon: '⚡' },
    { path: '/benchmark', label: 'BENCHMARK', icon: '🔬' },
    { path: '/monitoring', label: 'MONITORING', icon: '📊' },
    { path: '/profiles', label: 'PROFILES', icon: '📋' },
    { path: '/sessions', label: 'SESSIONS', icon: '📁' },
    { path: '/pool', label: 'POOL', icon: '🌐' },
    { path: '/operations', label: 'OPERATIONS', icon: '⏰' },
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
