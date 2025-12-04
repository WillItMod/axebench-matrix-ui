import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import FontAppearanceSplash from '@/components/FontAppearanceSplash';
import { useTheme, availableThemes, fonts as fontChoices, themePalettes } from '@/contexts/ThemeContext';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';

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
    fontScale,
    setFontScale,
    matrixCodeColor,
    setMatrixCodeColor,
    fontOverride,
    matrixBrightness,
    setMatrixBrightness,
    matrixRainbow,
    setMatrixRainbow,
  } = useTheme();
  const [license, setLicense] = useState<LicenseStatus | null>(null);
  const [tier, setTier] = useState<'free' | 'premium' | 'ultimate'>('free');
  const [deviceLimit, setDeviceLimit] = useState<number>(5);
  const [deviceCount, setDeviceCount] = useState<number>(0);
  const [patreonUrl, setPatreonUrl] = useState<string | null>(null);
  const [showAppearanceModal, setShowAppearanceModal] = useState(false);

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

  const currentThemeLabel = useMemo(
    () => availableThemes.find((t) => t.name === theme)?.label ?? theme,
    [theme]
  );
  const currentFontLabel = useMemo(
    () => fontChoices.find((f) => f.key === fontKey)?.label ?? fontKey,
    [fontKey]
  );
  const defaultFontLabel = useMemo(() => {
    const def = themePalettes[theme]?.defaults.font;
    return fontChoices.find((f) => f.key === def)?.label ?? def ?? 'Share Tech Mono';
  }, [theme]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground">Configure AxeBench to match your rig and preferences.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">Licensing / Patreon</div>
              <div className="text-lg font-semibold text-foreground">
                Tier: {tier.toUpperCase()}
              </div>
            </div>
            <Badge variant="outline" className="text-xs">
              Devices {deviceCount}/{deviceLimit}
            </Badge>
          </div>
          <div className="text-sm text-muted-foreground">
            {tier === 'free'
              ? 'Free tier is limited. Upgrade to unlock higher device counts and patron perks.'
              : 'Thanks for supporting AxeBench. Your subscription keeps the rigs humming.'}
          </div>
          <div className="flex flex-wrap gap-2">
            {patreonUrl && (
              <Button size="sm" onClick={() => window.open(patreonUrl!, '_blank')}>
                Open Patreon Login
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={handleLogout}>
              Logout
            </Button>
          </div>
        </Card>

        <Card className="p-5 space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-muted-foreground">Current Theme</div>
              <div className="text-xl font-semibold text-foreground">{currentThemeLabel}</div>
            </div>
            <Badge variant="secondary" className="text-xs">
              {fontOverride ? 'Custom font' : 'Theme default'}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            <span className="rounded-full bg-muted/40 px-3 py-1 border border-border/60">
              Font: <span className="text-foreground">{currentFontLabel}</span>
            </span>
            <span className="rounded-full bg-muted/40 px-3 py-1 border border-border/60">
              Default: <span className="text-foreground">{defaultFontLabel}</span>
            </span>
            <span className="rounded-full bg-muted/40 px-3 py-1 border border-border/60">
              Scale {fontScale.toFixed(2)}x
            </span>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" size="sm" onClick={() => setShowAppearanceModal(true)}>
              Adjust fonts & appearance
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setTheme('matrix')}>
              Reset to Matrix Dark
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Matrix Code Color</Label>
              <Input
                type="color"
                value={matrixCodeColor}
                onChange={(e) => setMatrixCodeColor(e.target.value)}
                className="h-10 w-full"
              />
              <div className="text-[11px] text-muted-foreground">
                Adjust digital rain hue. Animation & brightness stay untouched.
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Font scale</Label>
              <input
                type="range"
                min="0.9"
                max="1.2"
                step="0.02"
                value={fontScale}
                onChange={(e) => setFontScale(parseFloat(e.target.value))}
                className="w-full accent-[hsl(var(--primary))]"
              />
              <div className="text-[11px] text-muted-foreground">Scale: {fontScale.toFixed(2)}x</div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Matrix brightness</Label>
              <input
                type="range"
                min="0.2"
                max="1.2"
                step="0.02"
                value={matrixBrightness}
                onChange={(e) => setMatrixBrightness(parseFloat(e.target.value))}
                className="w-full accent-[hsl(var(--primary))]"
              />
              <div className="text-[11px] text-muted-foreground">
                Intensity: {matrixBrightness.toFixed(2)} (affects background rain only)
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-card/80 px-3 py-2">
              <div className="flex flex-col">
                <span className="text-sm text-foreground">Rainbow rain mode</span>
                <span className="text-[11px] text-muted-foreground">Cycle the digital rain through full spectrum</span>
              </div>
              <Switch checked={matrixRainbow} onCheckedChange={setMatrixRainbow} />
            </div>
          </div>
        </Card>
      </div>

      <FontAppearanceSplash open={showAppearanceModal} onOpenChange={setShowAppearanceModal} />
    </div>
  );
}

