import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTheme, availableThemes, fonts as fontChoices, themePalettes, ThemeName } from '@/contexts/ThemeContext';
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
      <DialogContent className="max-w-5xl bg-card border border-border text-foreground">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-xl">Fonts & Appearance</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Choose your cockpit skin and typography. Theme defaults apply automatically until you override a font.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Themes</div>
              <div className="text-xs text-muted-foreground">Forge unlocks via Bitcoin challenges</div>
            </div>
            <ScrollArea className="h-[280px] rounded-lg border border-border bg-background/70">
              <div className="grid gap-2 p-3 sm:grid-cols-2">
                {availableThemes.map((t) => {
                  const locked = t.name === 'forge' && !secretUnlocked;
                  const active = pendingTheme === t.name;
                  return (
                    <button
                      key={t.name}
                      type="button"
                      disabled={locked}
                      onClick={() => setPendingTheme(t.name as ThemeName)}
                      className={cn(
                        'rounded-lg border p-3 text-left transition-all bg-card/80',
                        locked && 'opacity-50 cursor-not-allowed',
                        active
                          ? 'border-[hsl(var(--primary))] shadow-[0_0_12px_rgba(34,197,94,0.3)]'
                          : 'border-border hover:border-[hsl(var(--primary))]/70 hover:shadow-[0_0_12px_rgba(34,211,238,0.15)]'
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
                      <div className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                        Default font: {fontChoices.find((f) => f.key === themePalettes[t.name as ThemeName]?.defaults.font)?.label ?? themePalettes[t.name as ThemeName]?.defaults.font}
                      </div>
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
            <ScrollArea className="h-[280px] rounded-lg border border-border bg-background/70">
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
                        'rounded-lg border px-3 py-2 text-left transition-all bg-card/80',
                        active
                          ? 'border-[hsl(var(--primary))] shadow-[0_0_12px_rgba(34,197,94,0.3)]'
                          : 'border-border hover:border-[hsl(var(--primary))]/70 hover:shadow-[0_0_12px_rgba(34,211,238,0.12)]'
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
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Font scale</Label>
              <input
                type="range"
                min="0.9"
                max="1.2"
                step="0.02"
                value={pendingScale}
                onChange={(e) => setPendingScale(parseFloat(e.target.value))}
                className="w-full accent-[hsl(var(--primary))]"
              />
              <div className="text-xs text-muted-foreground">Scale: {pendingScale.toFixed(2)}x</div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
          <div className="rounded-lg border border-border bg-card/80 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Live preview</div>
              <Badge variant="outline" className="text-xs">
                {palette?.label ?? pendingTheme}
              </Badge>
            </div>
            <div
              className="mt-3 rounded-lg border border-border p-4 shadow-inner"
              style={{
                background: palette?.colors.surface,
                color: palette?.colors.text,
                fontFamily: fontStack,
              }}
            >
              <div className="text-lg font-semibold">{PREVIEW_TEXT}</div>
              <div className="mt-2 text-sm opacity-80">
                Theme defaults: {defaultFontLabel} | Override: {pendingOverride ? 'On' : 'Off'}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md border border-border bg-background/70 p-2">
                  <div className="text-muted-foreground">Primary</div>
                  <div style={{ color: palette?.colors.primary }}>{palette?.colors.primary}</div>
                </div>
                <div className="rounded-md border border-border bg-background/70 p-2">
                  <div className="text-muted-foreground">Secondary</div>
                  <div style={{ color: palette?.colors.secondary }}>{palette?.colors.secondary}</div>
                </div>
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
            <Button onClick={handleApply} className="min-w-[120px]">
              Apply
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
