import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useTheme,
  availableThemes,
  fonts as fontChoices,
  themePalettes,
  ThemeName,
} from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';

type FontAppearanceSplashProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const PREVIEW_TEXT = 'AxeBench - The Future of Mining';

export default function FontAppearanceSplash({ open, onOpenChange }: FontAppearanceSplashProps) {
  const {
    theme,
    setTheme,
    fontKey,
    setFontKey,
    fontScale,
    setFontScale,
    resetFontOverride,
    secretUnlocked,
  } = useTheme();

  const [pendingTheme, setPendingTheme] = useState<ThemeName>(theme);
  const [pendingFont, setPendingFont] = useState<string>(fontKey);
  const [pendingScale, setPendingScale] = useState<number>(fontScale);

  useEffect(() => {
    if (open) {
      setPendingTheme(theme);
      setPendingFont(fontKey);
      setPendingScale(fontScale);
    }
  }, [open, theme, fontKey, fontScale]);

  const palette = useMemo(() => themePalettes[pendingTheme], [pendingTheme]);
  const defaultFont = palette?.defaults.font || 'share-tech';
  const defaultFontLabel = fontChoices.find((f) => f.key === defaultFont)?.label || defaultFont;
  const pendingOverride = pendingFont !== defaultFont;
  const fontStack = fontChoices.find((f) => f.key === pendingFont)?.stack || 'var(--app-font)';

  const handleApply = () => {
    if (pendingTheme === 'forge' && !secretUnlocked) {
      onOpenChange(false);
      return;
    }
    if (pendingFont === defaultFont) {
      resetFontOverride();
      setTheme(pendingTheme);
    } else {
      setTheme(pendingTheme);
      setFontKey(pendingFont);
    }
    setFontScale(pendingScale);
    onOpenChange(false);
  };

  const handleUseDefaultFont = () => {
    setPendingFont(defaultFont);
  };

  const renderThemeSwatch = (name: ThemeName) => {
    const p = themePalettes[name];
    if (!p) return null;
    const c = p.colors;
    return (
      <div className="mt-3 flex gap-1">
        {[c.primary, c.secondary, c.surface, c.hover].map((color, idx) => (
          <span key={`${color}-${idx}`} className="h-4 w-4 rounded border border-border" style={{ background: color }} />
        ))}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[82vh] appearance-modal space-y-5 p-6 sm:p-7 overflow-hidden flex flex-col">
        <div className="flex items-start justify-between gap-3">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-xl">Fonts & Appearance</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Choose your cockpit skin and typography. Theme defaults apply automatically until you override a font.
            </DialogDescription>
          </DialogHeader>
          <Badge variant="outline" className="floating-badge">
            Forge unlocks via Bitcoin challenges
          </Badge>
        </div>
        <div className="flex-1 overflow-auto pr-1 space-y-5">
          <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr] min-h-[360px]">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">Themes</div>
                <div className="text-xs text-muted-foreground">Pick a shell; fonts follow unless overridden</div>
              </div>
              <ScrollArea className="gridrunner-surface h-[380px] border border-transparent shadow-chrome appearance-scroll">
                <div className="grid gap-3 p-4 sm:grid-cols-2">
                  {availableThemes.map((t) => {
                    const locked = t.name === 'forge' && !secretUnlocked;
                    const active = pendingTheme === t.name;
                    const paletteColors = themePalettes[t.name as ThemeName]?.colors;
                    return (
                      <button
                        key={t.name}
                        type="button"
                        disabled={locked}
                        onClick={() => setPendingTheme(t.name as ThemeName)}
                        className={cn(
                          'relative overflow-hidden gridrunner-surface border border-transparent px-4 py-3 text-left transition-all shadow-soft min-h-[130px]',
                          'before:absolute before:inset-0 before:pointer-events-none before:bg-gradient-to-br before:from-[hsl(var(--primary))/10] before:via-transparent before:to-[hsl(var(--secondary))/10]',
                          locked && 'opacity-50 cursor-not-allowed',
                          active
                            ? 'border-[hsl(var(--primary))] shadow-[0_0_0_1px_hsla(var(--primary),0.35),0_0_28px_hsla(var(--primary),0.25)]'
                            : 'border-border hover:border-[hsl(var(--primary))]/70 hover:shadow-[0_0_22px_hsla(var(--primary),0.18)]'
                        )}
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
                        {renderThemeSwatch(t.name as ThemeName)}
                        <div className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                          <span>Default font:</span>
                          <Badge variant="outline" className="text-[11px]">
                            {fontChoices.find((f) => f.key === themePalettes[t.name as ThemeName]?.defaults.font)?.label ??
                              themePalettes[t.name as ThemeName]?.defaults.font}
                          </Badge>
                        </div>
                        {paletteColors && (
                          <div
                            className="absolute inset-x-2 bottom-2 h-[1px] opacity-60"
                            style={{
                              background: `linear-gradient(90deg, ${paletteColors.primary}, ${paletteColors.secondary})`,
                            }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">Fonts</div>
                <Button variant="outline" size="sm" onClick={handleUseDefaultFont}>
                  Use theme default
                </Button>
              </div>
              <ScrollArea className="gridrunner-surface h-[380px] border border-transparent shadow-chrome appearance-scroll">
                <div className="grid gap-2 p-3">
                  {fontChoices.map((font) => {
                    const active = pendingFont === font.key;
                    const isDefault = font.key === defaultFont;
                    return (
                      <button
                        key={font.key}
                        type="button"
                        onClick={() => setPendingFont(font.key)}
                        className={cn(
                          'relative overflow-hidden gridrunner-surface border border-transparent px-3 py-2 text-left transition-all shadow-soft',
                          active
                            ? 'border-[hsl(var(--primary))] shadow-[0_0_0_1px_hsla(var(--primary),0.3),0_0_18px_hsla(var(--primary),0.2)]'
                            : 'border-border hover:border-[hsl(var(--primary))]/60 hover:shadow-[0_0_16px_hsla(var(--primary),0.12)]'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium text-sm" style={{ fontFamily: font.stack }}>
                            {font.label}
                          </div>
                          <div className="flex gap-2 items-center">
                            {isDefault && <Badge variant="outline">Theme default</Badge>}
                            {active && <Badge variant="secondary">Selected</Badge>}
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground" style={{ fontFamily: font.stack }}>
                          {PREVIEW_TEXT}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
              <div className="space-y-2 gridrunner-surface border border-transparent p-3 shadow-soft">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Font scale</Label>
                  <div className="text-xs text-muted-foreground">Scale: {pendingScale.toFixed(2)}x</div>
                </div>
                <div className="slider-accent">
                  <input
                    type="range"
                    min="0.9"
                    max="1.2"
                    step="0.02"
                    value={pendingScale}
                    onChange={(e) => setPendingScale(parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <div className="gridrunner-surface border border-transparent p-4 shadow-chrome min-h-[260px]">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">Live preview</div>
                <Badge variant="outline" className="text-xs">
                  {palette?.label ?? pendingTheme}
                </Badge>
              </div>
              <div
                className="mt-3 rounded-xl border border-border p-4 shadow-[0_0_35px_rgba(0,0,0,0.25)] backdrop-blur-sm live-preview-panel"
                style={{
                  background:
                    'linear-gradient(135deg, hsla(var(--primary),0.16), hsla(var(--secondary),0.12))',
                  color: palette?.colors.text,
                  fontFamily: fontStack,
                }}
              >
                <div className="text-lg font-semibold leading-tight">{PREVIEW_TEXT}</div>
                <div className="mt-2 text-sm opacity-90 leading-snug">
                  Theme defaults: {defaultFontLabel} | Override: {pendingOverride ? 'On' : 'Off'}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  {['primary', 'secondary'].map((slot) => {
                    const val = slot === 'primary' ? palette?.colors.primary : palette?.colors.secondary;
                    return (
                      <div
                        key={slot}
                        className="rounded-md border border-border bg-background/70 p-3 flex items-center gap-3"
                      >
                        <span
                          className="inline-flex h-8 w-8 rounded-md border border-border shadow-[0_0_14px_rgba(0,0,0,0.35)]"
                          style={{ background: val }}
                        />
                        <div className="flex flex-col leading-tight">
                          <span className="text-[11px] text-muted-foreground uppercase tracking-wide">{slot}</span>
                          <span className="text-foreground font-medium" style={{ color: val }}>
                            Tone swatch
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-end justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setPendingTheme(theme);
                  setPendingFont(defaultFont);
                  setPendingScale(1);
                }}
              >
                Reset to theme default
              </Button>
              <Button onClick={handleApply} className="min-w-[140px] shadow-[0_0_20px_hsla(var(--primary),0.3)]">
                Apply
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
