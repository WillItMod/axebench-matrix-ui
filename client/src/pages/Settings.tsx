import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTheme, palettes, type PaletteName, fonts } from '@/contexts/ThemeContext';
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
  const { paletteName, setPalette, palette, fontKey, setFontKey, fontScale, setFontScale, matrixCodeColor, setMatrixCodeColor } = useTheme();
  const [darkSurge, setDarkSurge] = useState(false);
  const [customPalette, setCustomPalette] = useState({
    primary: palette.colors.primary,
    accent: palette.colors.accent,
    background: palette.colors.background,
    surface: palette.colors.surface,
  });
  const [license, setLicense] = useState<LicenseStatus | null>(null);
  const [tier, setTier] = useState<'free' | 'premium' | 'ultimate'>('free');
  const [deviceLimit, setDeviceLimit] = useState<number>(5);
  const [deviceCount, setDeviceCount] = useState<number>(0);
  const [patreonUrl, setPatreonUrl] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [status, devices] = await Promise.all([api.license.status().catch(() => null), api.devices.list().catch(() => [])]);
        setLicense(status);
        const t = (status?.tier || '').toLowerCase();
        let tierValue: 'free' | 'premium' | 'ultimate' = 'free';
        if (t === 'ultimate' || status?.is_patron) tierValue = 'ultimate';
        else if (t === 'premium') tierValue = 'premium';
        setTier(tierValue);
        const limit = Number(status?.device_limit) || (tierValue === 'ultimate' ? 250 : tierValue === 'premium' ? 25 : 5);
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

  useEffect(() => {
    if (paletteName === 'custom') {
      setCustomPalette({
        primary: palette.colors.primary,
        accent: palette.colors.accent,
        background: palette.colors.background,
        surface: palette.colors.surface,
      });
    }
  }, [paletteName, palette.colors]);

  const paletteEntries = useMemo(() => Object.entries(palettes), []);

  const handleCustomChange = (key: keyof typeof customPalette, value: string) => {
    const updated = { ...customPalette, [key]: value };
    setCustomPalette(updated);
    setPalette('custom', updated);
  };

  const handleLogout = async () => {
    await api.license.logout().catch(() => null);
    toast.success('Logged out of Patreon');
    setLicense(null);
    setTier('free');
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-glow-cyan mb-2">SETTINGS</h1>
        <p className="text-[var(--text-secondary)]">Configure your AxeBench experience</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Licensing */}
        <Card className="p-4 bg-black/80 border-[var(--grid-gray)] space-y-3">
          <div className="text-lg font-bold text-[var(--neon-cyan)]">LICENSING / PATREON</div>
          <div className="text-sm text-[var(--text-secondary)]">
            Current tier: {tier.toUpperCase()} | Devices {deviceCount}/{deviceLimit}
          </div>
          <div className="flex flex-col gap-2">
            {patreonUrl && (
              <Button onClick={() => window.open(patreonUrl!, '_blank')} className="btn-matrix">
                Open Patreon Login
              </Button>
            )}
            <Button variant="outline" onClick={handleLogout}>
              Logout
            </Button>
          </div>
        </Card>

        {/* Fonts */}
        <Card className="p-4 bg-black/80 border-[var(--grid-gray)] space-y-3">
          <div className="text-lg font-bold text-[var(--neon-cyan)]">FONTS</div>
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
                      ? 'border-[var(--theme-primary)] shadow-[0_0_12px_rgba(0,255,65,0.35)] bg-[var(--grid-gray)]/40'
                      : 'border-[var(--grid-gray)] hover:border-[var(--theme-accent)] hover:shadow-[0_0_10px_rgba(0,255,255,0.25)]'
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

      {/* Palettes */}
      <Card className="p-6 bg-black/80 border-[var(--grid-gray)] space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-[var(--neon-cyan)]">PALETTES</h2>
          <div className="text-sm text-[var(--text-secondary)]">Compact contrasting color sets</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {paletteEntries.map(([key, pal]) => {
            const selected = paletteName === key;
            return (
              <button
                key={key}
                onClick={() => {
                  setPalette(key as PaletteName);
                  if (key === 'blackout') {
                    setDarkSurge(true);
                    setTimeout(() => setDarkSurge(false), 700);
                  }
                }}
                className={`rounded-lg border text-left p-3 transition-all relative overflow-hidden ${
                  selected
                    ? 'border-[var(--matrix-green)] shadow-[0_0_10px_rgba(0,255,65,0.3)]'
                    : 'border-[var(--grid-gray)] hover:border-[var(--theme-accent)] hover:shadow-[0_0_12px_rgba(0,255,255,0.25)]'
                }`}
                style={{ background: pal.colors.surface }}
              >
                <div className="flex items-center gap-2 mb-2">
                  {[pal.colors.primary, pal.colors.secondary, pal.colors.accent, pal.colors.text].map((c, idx) => (
                    <div key={idx} className="w-5 h-5 rounded-full border border-white/10" style={{ background: c }} />
                  ))}
                </div>
                <div className="text-sm font-bold" style={{ color: pal.colors.text }}>
                  {pal.label}
                </div>
                <div className="text-xs" style={{ color: pal.colors.textSecondary }}>
                  {selected ? 'Selected' : 'Tap to apply'}
                </div>
                {key === 'blackout' && (
                  <div className="absolute inset-0 pointer-events-none opacity-0 hover:opacity-40 transition-all bg-gradient-to-br from-[#0aff9d]/20 via-[#08e0ff]/15 to-[#ffd166]/20" />
                )}
              </button>
            );
          })}
        </div>

        {/* Custom palette */}
        <div className="mt-4 border-t border-[var(--grid-gray)] pt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-[var(--neon-cyan)]">Custom Palette</h3>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setPalette('custom', customPalette);
                toast.success('Custom palette applied');
              }}
            >
              Use Custom
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {(['primary', 'accent', 'background', 'surface'] as const).map((key) => (
              <div key={key} className="flex flex-col gap-1">
                <Label className="text-xs text-[var(--text-secondary)] uppercase">{key}</Label>
                <Input
                  type="color"
                  value={(customPalette as any)[key]}
                  onChange={(e) => handleCustomChange(key, e.target.value)}
                  className="h-10"
                />
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <Label className="text-xs text-[var(--text-secondary)]">Matrix Code Color</Label>
            <Input
              type="color"
              value={matrixCodeColor}
              onChange={(e) => setMatrixCodeColor(e.target.value)}
              className="h-10 w-28"
            />
            <div className="text-[var(--text-secondary)] text-xs">Adjust the digital rain hue (keeps animation intact).</div>
          </div>
        </div>
      </Card>

      {darkSurge && (
        <div className="fixed inset-0 z-[999] pointer-events-none bg-black/70 animate-pulse" />
      )}
    </div>
  );
}
