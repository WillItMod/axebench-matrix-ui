import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTheme, availableThemes, fonts } from '@/contexts/ThemeContext';
import { api } from '@/lib/api';
import { toast } from 'sonner';

interface LicenseStatus {
  tier?: string;
  device_limit?: number;
  auth_url?: string;
  patreon_url?: string;
  is_patron?: boolean;
}

export default function Settings() {
  const {
    theme,
    setTheme,
    fontKey,
    setFontKey,
    fontScale,
    setFontScale,
    matrixCodeColor,
    setMatrixCodeColor,
  } = useTheme();
  const [license, setLicense] = useState<LicenseStatus | null>(null);
  const [tier, setTier] = useState<'free' | 'premium' | 'ultimate'>('free');
  const [deviceLimit, setDeviceLimit] = useState<number>(5);
  const [deviceCount, setDeviceCount] = useState<number>(0);
  const [patreonUrl, setPatreonUrl] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [status, devices] = await Promise.all([
          api.license.status().catch(() => null),
          api.devices.list().catch(() => []),
        ]);
        setLicense(status);
        const t = (status?.tier || '').toLowerCase();
        let tierValue: 'free' | 'premium' | 'ultimate' = 'free';
        if (t === 'ultimate' || status?.is_patron) tierValue = 'ultimate';
        else if (t === 'premium') tierValue = 'premium';
        setTier(tierValue);
        const limit =
          Number(status?.device_limit) ||
          (tierValue === 'ultimate' ? 250 : tierValue === 'premium' ? 25 : 5);
        setDeviceLimit(limit);
        setPatreonUrl(status?.auth_url || status?.patreon_url || null);
        setDeviceCount(Array.isArray(devices) ? devices.length : 0);
      } catch {
        setTier('free');
        setDeviceLimit(5);
      }
    };
    load();
  }, []);

  const handleLogout = async () => {
    await api.license.logout().catch(() => null);
    toast.success('Logged out of Patreon');
    setLicense(null);
    setTier('free');
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[var(--theme-primary)] mb-2">SETTINGS</h1>
        <p className="text-[var(--text-secondary)]">Configure your AxeBench experience</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
        {/* Licensing */}
        <Card className="p-4 bg-card border border-border space-y-3 text-foreground h-full">
          <div className="text-lg font-bold text-[var(--theme-accent)]">LICENSING / PATREON</div>
          <div className="text-sm text-[var(--text-secondary)]">
            Current tier: {tier.toUpperCase()} | Devices {deviceCount}/{deviceLimit}
          </div>
          <div className="flex flex-col gap-2">
            {patreonUrl && (
              <Button onClick={() => window.open(patreonUrl!, '_blank')} className="bg-primary text-primary-foreground">
                Open Patreon Login
              </Button>
            )}
            <Button variant="outline" onClick={handleLogout}>
              Logout
            </Button>
          </div>
        </Card>

        {/* Fonts */}
        <Card className="p-4 bg-card border border-border space-y-3 text-foreground h-full">
          <div className="text-lg font-bold text-[var(--theme-accent)]">FONTS & SIZE</div>
          <div className="grid grid-cols-2 gap-2">
            {fonts.map((font) => {
              const selected = fontKey === font.key;
              return (
                <button
                  key={font.key}
                  onClick={() => setFontKey(font.key)}
                  style={{ fontFamily: font.stack }}
                  className={`rounded-md border p-3 text-left transition-all ${
                    selected
                      ? 'border-[var(--theme-primary)] shadow-[0_0_12px_rgba(0,255,65,0.35)] bg-[var(--theme-bg-hover)]'
                      : 'border-border hover:border-[var(--theme-accent)] hover:shadow-[0_0_10px_rgba(0,255,255,0.25)]'
                  }`}
                >
                  {font.label}
                </button>
              );
            })}
          </div>
          <div className="text-xs text-[var(--text-secondary)]">Apply a font stack across the UI.</div>
          <div className="mt-3">
            <Label className="text-xs text-[var(--text-secondary)]">Global Text Size</Label>
            <input
              type="range"
              min="0.9"
              max="1.2"
              step="0.02"
              value={fontScale}
              onChange={(e) => setFontScale(parseFloat(e.target.value))}
              className="w-full accent-[var(--theme-primary)]"
            />
            <div className="text-xs text-[var(--text-secondary)]">Scale: {fontScale.toFixed(2)}x</div>
          </div>
        </Card>
      </div>

      {/* Appearance */}
      <Card className="p-6 bg-card border border-border space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-[var(--theme-accent)]">APPEARANCE</h2>
          <div className="text-sm text-[var(--text-secondary)]">Theme and matrix rain tweaks</div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {availableThemes.map((t) => {
            const active = theme === t.name;
            return (
              <button
                key={t.name}
                onClick={() => setTheme(t.name as any)}
                className={`rounded-lg border p-3 text-left transition-all bg-card/80 ${
                  active
                    ? 'border-[hsl(var(--primary))] shadow-[0_0_12px_rgba(34,197,94,0.3)]'
                    : 'border-border hover:border-[hsl(var(--primary))]/70'
                }`}
              >
                <div className="font-bold text-sm text-foreground">{t.label}</div>
                <div className="mt-2 flex gap-1">
                  <span className="h-4 w-4 rounded" style={{ background: 'var(--primary)' }} />
                  <span className="h-4 w-4 rounded" style={{ background: 'var(--secondary)' }} />
                  <span className="h-4 w-4 rounded border border-border" style={{ background: 'var(--card)' }} />
                  <span className="h-4 w-4 rounded border border-border" style={{ background: 'var(--muted)' }} />
                </div>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-[var(--text-secondary)] uppercase">Matrix Code Color</Label>
            <Input
              type="color"
              value={matrixCodeColor}
              onChange={(e) => setMatrixCodeColor(e.target.value)}
              className="h-10 w-full"
            />
            <div className="text-[var(--text-secondary)] text-xs">Adjust the digital rain hue (animation unchanged).</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
