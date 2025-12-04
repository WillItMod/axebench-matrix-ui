import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useTheme, availableThemes, fonts as fontChoices, themePalettes } from '@/contexts/ThemeContext';
import { useSettings, type BenchmarkDefaults, type GlobalBenchmarkDefaults } from '@/contexts/SettingsContext';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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
    resetFontOverride,
    matrixBrightness,
    setMatrixBrightness,
    matrixRainbow,
    setMatrixRainbow,
    resetMatrixVisuals,
    secretUnlocked,
  } = useTheme();
  const {
    temperatureUnit,
    hashrateDisplay,
    timeFormat,
    dashboardRefreshMs,
    monitoringRefreshMs,
    reduceMotion,
    pauseMatrix,
    alertChipTemp,
    alertVrTemp,
    safetyMaxChipTemp,
    safetyMaxVrTemp,
    safetyMaxPower,
    enforceSafetyLimits,
    updateSettings,
    toDisplayTemp,
    fromDisplayTemp,
    modelBenchmarkDefaults,
    globalBenchmarkDefaults,
    setModelBenchmarkDefaults,
    setGlobalBenchmarkDefaults,
  } = useSettings();
  const [license, setLicense] = useState<LicenseStatus | null>(null);
  const [tier, setTier] = useState<'free' | 'premium' | 'ultimate'>('free');
  const [deviceLimit, setDeviceLimit] = useState<number>(5);
  const [deviceCount, setDeviceCount] = useState<number>(0);
  const [patreonUrl, setPatreonUrl] = useState<string | null>(null);
  const [showModelDefaults, setShowModelDefaults] = useState<string | null>(null);
  const [showGlobalDefaults, setShowGlobalDefaults] = useState(false);
  const [draftModelDefaults, setDraftModelDefaults] = useState<BenchmarkDefaults | null>(null);
  const [draftGlobalDefaults, setDraftGlobalDefaults] = useState<GlobalBenchmarkDefaults>(globalBenchmarkDefaults);

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
  const dashboardRefreshSec = useMemo(
    () => Number((Math.max(1000, dashboardRefreshMs) / 1000).toFixed(1)),
    [dashboardRefreshMs]
  );
  const monitoringRefreshSec = useMemo(
    () => Number((Math.max(500, monitoringRefreshMs) / 1000).toFixed(1)),
    [monitoringRefreshMs]
  );

  const modelCards = [
    { key: 'gamma', label: 'Gamma (BM1370)' },
    { key: 'supra', label: 'Supra (BM1368)' },
    { key: 'ultra', label: 'Ultra (BM1366)' },
    { key: 'hex', label: 'Hex (BM1366 x6)' },
    { key: 'max', label: 'Max (BM1397)' },
    { key: 'nerdqaxe', label: 'NerdQAxe (BM1370)' },
    { key: 'nerdqaxe_plus', label: 'NerdQAxe+' },
    { key: 'nerdqaxe_plus_plus', label: 'NerdQAxe++' },
  ];

  const handleOpenModelDefaults = (model: string) => {
    const existing = modelBenchmarkDefaults[model] || null;
    setDraftModelDefaults(
      existing || {
        auto_mode: true,
        voltage_start: 1100,
        voltage_stop: 1200,
        voltage_step: 25,
        frequency_start: 400,
        frequency_stop: 700,
        frequency_step: 25,
        benchmark_duration: globalBenchmarkDefaults.benchmark_duration,
        warmup_time: globalBenchmarkDefaults.warmup_time,
        cooldown_time: globalBenchmarkDefaults.cooldown_time,
        cycles_per_test: globalBenchmarkDefaults.cycles_per_test,
        goal: 'balanced',
        fan_target: null,
      }
    );
    setShowModelDefaults(model);
  };

  const saveModelDefaults = () => {
    if (!showModelDefaults || !draftModelDefaults) {
      setShowModelDefaults(null);
      return;
    }
    setModelBenchmarkDefaults(showModelDefaults, draftModelDefaults);
    toast.success(`Saved benchmark defaults for ${showModelDefaults.toUpperCase()}`);
    setShowModelDefaults(null);
  };

  const saveGlobalDefaults = () => {
    setGlobalBenchmarkDefaults(draftGlobalDefaults);
    toast.success('Saved global benchmark defaults');
    setShowGlobalDefaults(false);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-glow-green uppercase">SETTINGS</h1>
          <p className="text-muted-foreground">Configure AxeBench to match your rig and preferences.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">Licensing / Patreon</div>
              <div className="text-lg font-semibold text-glow-cyan">
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

        <Card className="p-5 space-y-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-muted-foreground">Appearance & Typography</div>
              <div className="text-xl font-semibold text-glow-cyan">THEME & FONT LAB</div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">Themes</div>
                <div className="text-xs text-muted-foreground">Current: {currentThemeLabel}</div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {availableThemes.map((t) => {
                  const locked = t.name === 'forge' && !secretUnlocked;
                  const active = theme === t.name;
                  const paletteColors = themePalettes[t.name]?.colors;
                  return (
                    <button
                      key={t.name}
                      type="button"
                      disabled={locked}
                      onClick={() => setTheme(t.name)}
                      className={[
                        'relative overflow-hidden rounded-lg border px-3 py-3 text-left transition-all',
                        active
                          ? 'border-[hsl(var(--primary))] shadow-[0_0_0_1px_hsla(var(--primary),0.3),0_0_18px_hsla(var(--primary),0.18)]'
                          : 'border-border hover:border-[hsl(var(--primary))]/60 hover:shadow-[0_0_16px_hsla(var(--primary),0.12)]',
                        locked ? 'opacity-50 cursor-not-allowed' : '',
                      ].join(' ')}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold text-sm">{t.label}</div>
                        {locked ? (
                          <Badge variant="outline" className="text-amber-400 border-amber-400/60">
                            Locked
                          </Badge>
                        ) : active ? (
                          <Badge variant="secondary" className="text-xs">Active</Badge>
                        ) : null}
                      </div>
                      {paletteColors && (
                        <div className="mt-2 flex gap-1">
                          {[paletteColors.primary, paletteColors.secondary, paletteColors.surface, paletteColors.hover].map((color, idx) => (
                            <span key={`${color}-${idx}`} className="h-4 w-4 rounded border border-border" style={{ background: color }} />
                          ))}
                        </div>
                      )}
                      <div className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                        Default font: {fontChoices.find((f) => f.key === themePalettes[t.name]?.defaults.font)?.label ?? themePalettes[t.name]?.defaults.font}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">Fonts</div>
                <Button variant="outline" size="sm" onClick={() => { setFontKey(themePalettes[theme]?.defaults.font || 'share-tech'); resetFontOverride(); }}>
                  Use theme default
                </Button>
              </div>
              <div className="grid gap-2">
                {fontChoices.map((font) => {
                  const active = fontKey === font.key;
                  const isDefault = font.key === (themePalettes[theme]?.defaults.font || 'share-tech');
                  return (
                    <button
                      key={font.key}
                      type="button"
                      onClick={() => setFontKey(font.key)}
                      className={[
                        'rounded-lg border px-3 py-2 text-left transition-all',
                        active
                          ? 'border-[hsl(var(--primary))] shadow-[0_0_0_1px_hsla(var(--primary),0.28),0_0_14px_hsla(var(--primary),0.2)]'
                          : 'border-border hover:border-[hsl(var(--primary))]/60 hover:shadow-[0_0_12px_hsla(var(--primary),0.12)]',
                      ].join(' ')}
                      style={{ fontFamily: font.stack }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium text-sm">{font.label}</div>
                        <div className="flex gap-2 items-center">
                          {isDefault && <Badge variant="outline">Theme default</Badge>}
                          {active && <Badge variant="secondary">Selected</Badge>}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">The quick brown fox jumps over the lazy miner.</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
            <div className="space-y-1">
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
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Matrix Code Color</Label>
              <Input
                type="color"
                value={matrixCodeColor}
                onChange={(e) => setMatrixCodeColor(e.target.value)}
                className="h-9 w-20 rounded-md border border-border/70 bg-card px-1 shadow-sm cursor-pointer"
              />
              <div className="text-[11px] text-muted-foreground">
                Adjust digital rain hue. Animation & brightness stay untouched.
              </div>
            </div>
            <div className="space-y-1">
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
                Intensity: {matrixBrightness.toFixed(2)} (background rain only)
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-card/80 px-3 py-2">
            <div className="flex flex-col">
              <span className="text-sm text-foreground">Rainbow rain mode</span>
              <span className="text-[11px] text-muted-foreground">Cycle the digital rain through full spectrum</span>
            </div>
            <Switch checked={matrixRainbow} onCheckedChange={setMatrixRainbow} />
          </div>

          <div className="flex flex-wrap gap-3">
            <Button size="sm" variant="ghost" onClick={resetMatrixVisuals}>
              Reset to Matrix Dark
            </Button>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-muted-foreground">Monitoring & refresh</div>
              <div className="text-lg font-semibold text-glow-cyan">Poll cadence</div>
            </div>
            <Badge variant="outline" className="text-xs">Per-device</Badge>
          </div>
          <div className="space-y-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Dashboard auto-refresh (seconds)</Label>
              <Input
                type="number"
                min={1}
                max={60}
                step={0.5}
                value={dashboardRefreshSec}
                onChange={(e) => {
                  const sec = Math.max(1, Math.min(60, parseFloat(e.target.value) || 0));
                  updateSettings({ dashboardRefreshMs: sec * 1000 });
                }}
              />
              <div className="text-[11px] text-muted-foreground">Controls the interval used by the fleet grid.</div>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Live monitoring polling (seconds)</Label>
              <Input
                type="number"
                min={0.5}
                max={30}
                step={0.5}
                value={monitoringRefreshSec}
                onChange={(e) => {
                  const sec = Math.max(0.5, Math.min(30, parseFloat(e.target.value) || 0));
                  updateSettings({ monitoringRefreshMs: sec * 1000 });
                }}
              />
              <div className="text-[11px] text-muted-foreground">Lower intervals = smoother charts, higher = lighter backend load.</div>
            </div>
          </div>
        </Card>

        <Card className="p-5 space-y-4">
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Units & display</div>
            <div className="text-lg font-semibold text-glow-cyan">How values render</div>
          </div>
          <div className="space-y-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Temperature unit</Label>
              <Select value={temperatureUnit} onValueChange={(val) => updateSettings({ temperatureUnit: val as any })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="C">Celsius</SelectItem>
                  <SelectItem value="F">Fahrenheit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Hashrate display</Label>
              <Select value={hashrateDisplay} onValueChange={(val) => updateSettings({ hashrateDisplay: val as any })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select scale" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto (GH/TH)</SelectItem>
                  <SelectItem value="gh">Force GH/s</SelectItem>
                  <SelectItem value="th">Force TH/s</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Time format</Label>
              <Select value={timeFormat} onValueChange={(val) => updateSettings({ timeFormat: val as any })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">24-hour</SelectItem>
                  <SelectItem value="12h">12-hour</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        <Card className="p-5 space-y-4">
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Performance & visuals</div>
            <div className="text-lg font-semibold text-glow-cyan">Animation comfort</div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-border bg-card/80 px-3 py-2">
              <div className="flex flex-col">
                <span className="text-sm text-foreground">Reduce motion</span>
                <span className="text-[11px] text-muted-foreground">Slows background animations to keep CPUs cool.</span>
              </div>
              <Switch checked={reduceMotion} onCheckedChange={(val) => updateSettings({ reduceMotion: val })} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-card/80 px-3 py-2">
              <div className="flex flex-col">
                <span className="text-sm text-foreground">Pause Matrix background</span>
                <span className="text-[11px] text-muted-foreground">Hide the digital rain entirely for shared screens.</span>
              </div>
              <Switch checked={pauseMatrix} onCheckedChange={(val) => updateSettings({ pauseMatrix: val })} />
            </div>
          </div>
        </Card>
      </div>

      {/* Benchmark defaults */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-muted-foreground">Bench tuning</div>
            <div className="text-xl font-semibold text-glow-cyan">DEFAULT BENCHMARK PROFILES</div>
            <p className="text-sm text-muted-foreground">
              Set per-model defaults that prefill benchmarking and Autopilot for each device family.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => { setDraftGlobalDefaults(globalBenchmarkDefaults); setShowGlobalDefaults(true); }}>
            Global test defaults
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {modelCards.map((m) => {
            const hasCustom = !!modelBenchmarkDefaults[m.key];
            return (
              <div
                key={m.key}
                className="rounded-lg border border-border/60 bg-card/60 p-3 flex items-center justify-between"
              >
                <div>
                  <div className="text-sm font-semibold text-[var(--text-primary)]">{m.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {hasCustom ? 'Custom defaults set' : 'Using global defaults'}
                  </div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => handleOpenModelDefaults(m.key)}>
                  Configure
                </Button>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-muted-foreground">Safety & alerts</div>
              <div className="text-lg font-semibold text-foreground">Thresholds</div>
            </div>
            <Badge variant="secondary" className="text-xs">Applied app-wide</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Chip temp warning ({temperatureUnit})</Label>
              <Input
                type="number"
                min={40}
                max={120}
                step={0.5}
                value={toDisplayTemp(alertChipTemp).toFixed(1)}
                onChange={(e) => {
                  const displayVal = parseFloat(e.target.value);
                  if (!Number.isFinite(displayVal)) return;
                  const celsius = fromDisplayTemp(displayVal);
                  updateSettings({ alertChipTemp: Math.max(40, Math.min(120, celsius)) });
                }}
              />
              <div className="text-[11px] text-muted-foreground">Used for dashboard warnings and live monitoring.</div>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">VR temp warning ({temperatureUnit})</Label>
              <Input
                type="number"
                min={50}
                max={130}
                step={0.5}
                value={toDisplayTemp(alertVrTemp).toFixed(1)}
                onChange={(e) => {
                  const displayVal = parseFloat(e.target.value);
                  if (!Number.isFinite(displayVal)) return;
                  const celsius = fromDisplayTemp(displayVal);
                  updateSettings({ alertVrTemp: Math.max(50, Math.min(130, celsius)) });
                }}
              />
              <div className="text-[11px] text-muted-foreground">Triggers alerts when VRM temps exceed this value.</div>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Max chip temp cap ({temperatureUnit})</Label>
              <Input
                type="number"
                min={50}
                max={120}
                step={0.5}
                value={toDisplayTemp(safetyMaxChipTemp).toFixed(1)}
                onChange={(e) => {
                  const displayVal = parseFloat(e.target.value);
                  if (!Number.isFinite(displayVal)) return;
                  const celsius = fromDisplayTemp(displayVal);
                  updateSettings({ safetyMaxChipTemp: Math.max(50, Math.min(120, celsius)) });
                }}
              />
              <div className="text-[11px] text-muted-foreground">Benchmark runs will be capped to this value.</div>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Max VR temp cap ({temperatureUnit})</Label>
              <Input
                type="number"
                min={60}
                max={140}
                step={0.5}
                value={toDisplayTemp(safetyMaxVrTemp).toFixed(1)}
                onChange={(e) => {
                  const displayVal = parseFloat(e.target.value);
                  if (!Number.isFinite(displayVal)) return;
                  const celsius = fromDisplayTemp(displayVal);
                  updateSettings({ safetyMaxVrTemp: Math.max(60, Math.min(140, celsius)) });
                }}
              />
              <div className="text-[11px] text-muted-foreground">Benchmark runs will be capped to this value.</div>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Max power cap (W)</Label>
              <Input
                type="number"
                min={5}
                max={200}
                step={0.5}
                value={safetyMaxPower.toFixed(1)}
                onChange={(e) => {
                  const watts = parseFloat(e.target.value);
                  if (!Number.isFinite(watts)) return;
                  updateSettings({ safetyMaxPower: Math.max(5, Math.min(200, watts)) });
                }}
              />
              <div className="text-[11px] text-muted-foreground">Upper bound for benchmark requests.</div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-card/80 px-3 py-2">
              <div className="flex flex-col">
                <span className="text-sm text-foreground">Enforce safety caps</span>
                <span className="text-[11px] text-muted-foreground">Applies caps automatically when starting benchmarks.</span>
              </div>
              <Switch checked={enforceSafetyLimits} onCheckedChange={(val) => updateSettings({ enforceSafetyLimits: val })} />
            </div>
          </div>
        </Card>
      </div>
    </div>

    {/* Model benchmark defaults dialog */}
    <Dialog open={!!showModelDefaults} onOpenChange={(open) => { if (!open) setShowModelDefaults(null); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-glow-cyan">
            {showModelDefaults ? `Benchmark defaults: ${showModelDefaults.toUpperCase()}` : 'Benchmark defaults'}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Prefill voltage/frequency ranges and goals when benchmarking this model.
          </DialogDescription>
        </DialogHeader>

        {draftModelDefaults && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Voltage start (mV)</Label>
              <Input
                type="number"
                value={draftModelDefaults.voltage_start}
                onChange={(e) => setDraftModelDefaults({ ...draftModelDefaults, voltage_start: parseInt(e.target.value) || 0 })}
              />
              <Label className="text-xs text-muted-foreground">Voltage stop (mV)</Label>
              <Input
                type="number"
                value={draftModelDefaults.voltage_stop}
                onChange={(e) => setDraftModelDefaults({ ...draftModelDefaults, voltage_stop: parseInt(e.target.value) || 0 })}
              />
              <Label className="text-xs text-muted-foreground">Voltage step (mV)</Label>
              <Input
                type="number"
                value={draftModelDefaults.voltage_step}
                onChange={(e) => setDraftModelDefaults({ ...draftModelDefaults, voltage_step: parseInt(e.target.value) || 0 })}
              />
              <Label className="text-xs text-muted-foreground">Goal</Label>
              <Select
                value={draftModelDefaults.goal}
                onValueChange={(val) => setDraftModelDefaults({ ...draftModelDefaults, goal: val as any })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quiet">Quiet</SelectItem>
                  <SelectItem value="efficient">Efficient</SelectItem>
                  <SelectItem value="balanced">Balanced</SelectItem>
                  <SelectItem value="max">Max</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Switch
                  checked={draftModelDefaults.auto_mode}
                  onCheckedChange={(val) => setDraftModelDefaults({ ...draftModelDefaults, auto_mode: val })}
                />
                <span className="text-sm text-muted-foreground">Auto step</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Frequency start (MHz)</Label>
              <Input
                type="number"
                value={draftModelDefaults.frequency_start}
                onChange={(e) => setDraftModelDefaults({ ...draftModelDefaults, frequency_start: parseInt(e.target.value) || 0 })}
              />
              <Label className="text-xs text-muted-foreground">Frequency stop (MHz)</Label>
              <Input
                type="number"
                value={draftModelDefaults.frequency_stop}
                onChange={(e) => setDraftModelDefaults({ ...draftModelDefaults, frequency_stop: parseInt(e.target.value) || 0 })}
              />
              <Label className="text-xs text-muted-foreground">Frequency step (MHz)</Label>
              <Input
                type="number"
                value={draftModelDefaults.frequency_step}
                onChange={(e) => setDraftModelDefaults({ ...draftModelDefaults, frequency_step: parseInt(e.target.value) || 0 })}
              />

              <Label className="text-xs text-muted-foreground">Fan target (%) (optional)</Label>
              <Input
                type="number"
                placeholder="e.g., 40"
                value={draftModelDefaults.fan_target ?? ''}
                onChange={(e) => {
                  const val = e.target.value === '' ? null : parseInt(e.target.value);
                  setDraftModelDefaults({ ...draftModelDefaults, fan_target: val });
                }}
              />
            </div>
          </div>
        )}

        {draftModelDefaults && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Duration (s)</Label>
              <Input
                type="number"
                value={draftModelDefaults.benchmark_duration}
                onChange={(e) => setDraftModelDefaults({ ...draftModelDefaults, benchmark_duration: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Warmup (s)</Label>
              <Input
                type="number"
                value={draftModelDefaults.warmup_time}
                onChange={(e) => setDraftModelDefaults({ ...draftModelDefaults, warmup_time: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Cooldown (s)</Label>
              <Input
                type="number"
                value={draftModelDefaults.cooldown_time}
                onChange={(e) => setDraftModelDefaults({ ...draftModelDefaults, cooldown_time: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Cycles per test</Label>
              <Input
                type="number"
                value={draftModelDefaults.cycles_per_test}
                onChange={(e) => setDraftModelDefaults({ ...draftModelDefaults, cycles_per_test: parseInt(e.target.value) || 1 })}
              />
            </div>
          </div>
        )}

        <DialogFooter className="flex items-center justify-between">
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => { if (showModelDefaults) setModelBenchmarkDefaults(showModelDefaults, null); setShowModelDefaults(null); }}>
              Reset to global
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowModelDefaults(null)}>Cancel</Button>
            <Button onClick={saveModelDefaults}>Save</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Global benchmark defaults dialog */}
    <Dialog open={showGlobalDefaults} onOpenChange={(open) => { if (!open) setShowGlobalDefaults(false); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-glow-cyan">Global test defaults</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Applies when no per-model defaults exist.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Duration (s)</Label>
            <Input
              type="number"
              value={draftGlobalDefaults.benchmark_duration}
              onChange={(e) => setDraftGlobalDefaults({ ...draftGlobalDefaults, benchmark_duration: parseInt(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Warmup (s)</Label>
            <Input
              type="number"
              value={draftGlobalDefaults.warmup_time}
              onChange={(e) => setDraftGlobalDefaults({ ...draftGlobalDefaults, warmup_time: parseInt(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Cooldown (s)</Label>
            <Input
              type="number"
              value={draftGlobalDefaults.cooldown_time}
              onChange={(e) => setDraftGlobalDefaults({ ...draftGlobalDefaults, cooldown_time: parseInt(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Cycles per test</Label>
            <Input
              type="number"
              value={draftGlobalDefaults.cycles_per_test}
              onChange={(e) => setDraftGlobalDefaults({ ...draftGlobalDefaults, cycles_per_test: parseInt(e.target.value) || 1 })}
            />
          </div>
        </div>
        <DialogFooter className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setShowGlobalDefaults(false)}>Cancel</Button>
          <Button onClick={saveGlobalDefaults}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

