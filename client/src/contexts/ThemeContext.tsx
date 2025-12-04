import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

// Theme identifiers (exactly 10)
export type ThemeName =
  | 'matrix'
  | 'neonCore'
  | 'terminalAmber'
  | 'steelOps'
  | 'quantumOcean'
  | 'voidPurple'
  | 'radialTech'
  | 'solarSynth'
  | 'ghostCarbon'
  | 'forge';

// Persistence keys
const THEME_KEY = 'axebench_theme';
const FONT_KEY = 'axebench_font';
const FONT_SCALE_KEY = 'axebench_font_scale';
const FONT_OVERRIDE_KEY = 'axebench_font_override';
const SECRET_UNLOCK_KEY = 'axebench_secret_unlocked';
const SECRET_THEME_KEY = 'axebench_secret_theme';
const MATRIX_BRIGHTNESS_KEY = 'axebench-matrix-brightness';
const MATRIX_CODE_COLOR_KEY = 'axebench-matrix-code-color';
const MATRIX_COLOR_OVERRIDE_KEY = 'axebench-matrix-code-override';
const MATRIX_RAINBOW_KEY = 'axebench-matrix-rainbow';

const defaultFontForTheme = (theme: ThemeName) => palettes[theme]?.defaults.font || 'share-tech';

export interface Palette {
  name: ThemeName;
  label: string;
  defaults: {
    font: string;
  };
  colors: {
    background: string;
    surface: string;
    elevated: string;
    hover: string;
    nav: string;
    modal: string;
    borderSubtle: string;
    borderStrong: string;
    text: string;
    textSecondary: string;
    textMuted: string;
    textDisabled: string;
    primary: string;
    primarySoft: string;
    secondary: string;
    secondarySoft: string;
    success: string;
    warning: string;
    error: string;
    info: string;
    glowPrimary?: string;
    glowSecondary?: string;
  };
}

export interface FontChoice {
  key: string;
  label: string;
  stack: string;
}

const fontChoices: FontChoice[] = [
  { key: 'share-tech', label: 'Share Tech Mono', stack: "'Share Tech Mono', 'Consolas', 'Menlo', monospace" },
  { key: 'fira-code', label: 'Fira Code', stack: "'Fira Code', 'Consolas', monospace" },
  { key: 'jetbrains-mono', label: 'JetBrains Mono', stack: "'JetBrains Mono', 'Consolas', monospace" },
  { key: 'inter', label: 'Inter', stack: "'Inter', system-ui, sans-serif" },
  { key: 'archivo', label: 'Archivo', stack: "'Archivo', 'Inter', sans-serif" },
  { key: 'chakra', label: 'Chakra Petch', stack: "'Chakra Petch', 'Inter', sans-serif" },
  { key: 'oxanium', label: 'Oxanium', stack: "'Oxanium', 'Inter', sans-serif" },
  { key: 'ibm-plex', label: 'IBM Plex Mono', stack: "'IBM Plex Mono', 'Consolas', monospace" },
  { key: 'orbitron', label: 'Orbitron', stack: "'Orbitron', 'Inter', sans-serif" },
  { key: 'space-grotesk', label: 'Space Grotesk', stack: "'Space Grotesk', 'Inter', sans-serif" },
];

const palettes: Record<ThemeName, Palette> = {
  matrix: {
    name: 'matrix',
    label: 'Matrix Dark',
    defaults: { font: 'share-tech' },
    colors: {
      background: '#020617',
      surface: '#020617',
      elevated: '#030712',
      hover: '#111827',
      nav: '#020617',
      modal: '#020617',
      borderSubtle: '#1F2937',
      borderStrong: '#334155',
      text: '#E5E7EB',
      textSecondary: '#9CA3AF',
      textMuted: '#6B7280',
      textDisabled: '#4B5563',
      primary: '#22C55E',
      primarySoft: '#16A34A',
      secondary: '#22D3EE',
      secondarySoft: '#0EA5E9',
      success: '#22C55E',
      warning: '#FBBF24',
      error: '#EF4444',
      info: '#38BDF8',
      glowPrimary: '0 0 15px rgba(34,197,94,0.45), 0 0 30px rgba(34,197,94,0.25)',
      glowSecondary: '0 0 15px rgba(34,211,238,0.45), 0 0 30px rgba(34,211,238,0.25)',
    },
  },
  neonCore: {
    name: 'neonCore',
    label: 'Neon Core',
    defaults: { font: 'oxanium' },
    colors: {
      background: '#05010A',
      surface: '#0B0712',
      elevated: '#120A1B',
      hover: '#1E1330',
      nav: '#0B0712',
      modal: '#120A1B',
      borderSubtle: '#2E1F4F',
      borderStrong: '#4C337A',
      text: '#F0F9FF',
      textSecondary: '#C7D2FE',
      textMuted: '#94A3B8',
      textDisabled: '#64748B',
      primary: '#A855F7',
      primarySoft: '#9333EA',
      secondary: '#22D3EE',
      secondarySoft: '#06B6D4',
      success: '#4ADE80',
      warning: '#FBBF24',
      error: '#FB7185',
      info: '#38BDF8',
      glowPrimary: '0 0 25px rgba(168,85,247,0.5)',
      glowSecondary: '0 0 20px rgba(34,211,238,0.45)',
    },
  },
  terminalAmber: {
    name: 'terminalAmber',
    label: 'Terminal Amber',
    defaults: { font: 'ibm-plex' },
    colors: {
      background: '#0B0A08',
      surface: '#110F0A',
      elevated: '#1A1810',
      hover: '#262317',
      nav: '#110F0A',
      modal: '#1A1810',
      borderSubtle: '#3B2F13',
      borderStrong: '#6B5A25',
      text: '#FCECC0',
      textSecondary: '#EFD9A6',
      textMuted: '#D7C38D',
      textDisabled: '#A5976F',
      primary: '#FBBF24',
      primarySoft: '#F59E0B',
      secondary: '#FB923C',
      secondarySoft: '#F97316',
      success: '#84CC16',
      warning: '#FACC15',
      error: '#F87171',
      info: '#FDE68A',
      glowPrimary: '0 0 15px rgba(251,191,36,0.4)',
    },
  },
  steelOps: {
    name: 'steelOps',
    label: 'Steel Ops',
    defaults: { font: 'inter' },
    colors: {
      background: '#0F1115',
      surface: '#16181D',
      elevated: '#1E2127',
      hover: '#2A2D33',
      nav: '#16181D',
      modal: '#1E2127',
      borderSubtle: '#353841',
      borderStrong: '#4B4F58',
      text: '#F8FAFC',
      textSecondary: '#CBD5E1',
      textMuted: '#94A3B8',
      textDisabled: '#64748B',
      primary: '#64748B',
      primarySoft: '#475569',
      secondary: '#0EA5E9',
      secondarySoft: '#0284C7',
      success: '#22CC77',
      warning: '#FFD166',
      error: '#EF4444',
      info: '#38BDF8',
      glowPrimary: '0 0 18px rgba(100,116,139,0.35)',
    },
  },
  quantumOcean: {
    name: 'quantumOcean',
    label: 'Quantum Ocean',
    defaults: { font: 'archivo' },
    colors: {
      background: '#011627',
      surface: '#022340',
      elevated: '#073B64',
      hover: '#0D527F',
      nav: '#022340',
      modal: '#073B64',
      borderSubtle: '#0B2C4A',
      borderStrong: '#14456B',
      text: '#E2F3FF',
      textSecondary: '#A8D2EE',
      textMuted: '#7BA6C5',
      textDisabled: '#527995',
      primary: '#1DAEFF',
      primarySoft: '#0B87D0',
      secondary: '#70E0FF',
      secondarySoft: '#4AC3E1',
      success: '#46E29D',
      warning: '#FFD166',
      error: '#FF6B6B',
      info: '#70E0FF',
      glowPrimary: '0 0 20px rgba(29,174,255,0.4)',
    },
  },
  voidPurple: {
    name: 'voidPurple',
    label: 'Void Purple',
    defaults: { font: 'orbitron' },
    colors: {
      background: '#0A0212',
      surface: '#140323',
      elevated: '#1C0430',
      hover: '#2A0850',
      nav: '#140323',
      modal: '#1C0430',
      borderSubtle: '#3C0B62',
      borderStrong: '#5A0E94',
      text: '#F5EFFF',
      textSecondary: '#E0CFFC',
      textMuted: '#C5B3E0',
      textDisabled: '#8F7EB5',
      primary: '#A855F7',
      primarySoft: '#9333EA',
      secondary: '#D946EF',
      secondarySoft: '#C026D3',
      success: '#4ADE80',
      warning: '#FACC15',
      error: '#FB7185',
      info: '#A5B4FC',
      glowPrimary: '0 0 28px rgba(148,30,233,0.55)',
    },
  },
  radialTech: {
    name: 'radialTech',
    label: 'Radial Tech',
    defaults: { font: 'chakra' },
    colors: {
      background: '#001A1A',
      surface: '#012626',
      elevated: '#023333',
      hover: '#035050',
      nav: '#012626',
      modal: '#023333',
      borderSubtle: '#046666',
      borderStrong: '#0C8A8A',
      text: '#E0FFFA',
      textSecondary: '#B6FFF5',
      textMuted: '#7CE7DB',
      textDisabled: '#52C7BB',
      primary: '#22E3C1',
      primarySoft: '#14B89A',
      secondary: '#3BEAFF',
      secondarySoft: '#16A5C5',
      success: '#22C55E',
      warning: '#FBBF24',
      error: '#EF4444',
      info: '#3BEAFF',
      glowPrimary: '0 0 25px rgba(34,227,193,0.5)',
    },
  },
  solarSynth: {
    name: 'solarSynth',
    label: 'Solar Synth',
    defaults: { font: 'oxanium' },
    colors: {
      background: '#1A0B1F',
      surface: '#24052E',
      elevated: '#31063F',
      hover: '#47145C',
      nav: '#24052E',
      modal: '#31063F',
      borderSubtle: '#5B1A75',
      borderStrong: '#7E28A5',
      text: '#FCE7FF',
      textSecondary: '#F7C3FF',
      textMuted: '#E0A4E5',
      textDisabled: '#B274BD',
      primary: '#FF00AA',
      primarySoft: '#E60098',
      secondary: '#FF8500',
      secondarySoft: '#FFB344',
      success: '#4ADE80',
      warning: '#FFDA45',
      error: '#FF6B85',
      info: '#A5B4FC',
      glowPrimary: '0 0 25px rgba(255,0,170,0.6)',
    },
  },
  ghostCarbon: {
    name: 'ghostCarbon',
    label: 'Ghost Carbon',
    defaults: { font: 'space-grotesk' },
    colors: {
      background: '#0C0D0F',
      surface: '#131518',
      elevated: '#1D2024',
      hover: '#292D33',
      nav: '#131518',
      modal: '#1D2024',
      borderSubtle: '#3A3F47',
      borderStrong: '#4B515B',
      text: '#EEF1F5',
      textSecondary: '#C8CDD4',
      textMuted: '#99A0AA',
      textDisabled: '#5E646D',
      primary: '#98A1AA',
      primarySoft: '#707880',
      secondary: '#C9D1D9',
      secondarySoft: '#AEB6BF',
      success: '#22C55E',
      warning: '#EAB308',
      error: '#EF4444',
      info: '#60A5FA',
      glowPrimary: '0 0 16px rgba(152,161,170,0.3)',
    },
  },
  forge: {
    name: 'forge',
    label: "Satoshi's Forge",
    defaults: { font: 'archivo' },
    colors: {
      background: '#05070D',
      surface: '#0A0D15',
      elevated: '#111827',
      hover: '#1F2937',
      nav: '#05070D',
      modal: '#0A0D15',
      borderSubtle: '#1E2533',
      borderStrong: '#2D3748',
      text: '#F8FAFC',
      textSecondary: '#CBD5E1',
      textMuted: '#94A3B8',
      textDisabled: '#64748B',
      primary: '#F97316',
      primarySoft: '#EA580C',
      secondary: '#FACC15',
      secondarySoft: '#FB923C',
      success: '#22C55E',
      warning: '#FBBF24',
      error: '#EF4444',
      info: '#38BDF8',
      glowPrimary: '0 0 18px rgba(249,115,22,0.55)',
      glowSecondary: '0 0 18px rgba(250,204,21,0.45)',
    },
  },
};

interface ThemeContextType {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  resetMatrixVisuals: () => void;
  palette: Palette;
  fontKey: string;
  setFontKey: (key: string) => void;
  fontOverride: boolean;
  resetFontOverride: () => void;
  fontScale: number;
  setFontScale: (val: number) => void;
  fonts: FontChoice[];
  matrixBrightness: number;
  setMatrixBrightness: (val: number) => void;
  matrixCodeColor: string;
  setMatrixCodeColor: (val: string) => void;
  matrixRainbow: boolean;
  setMatrixRainbow: (val: boolean) => void;
  secretUnlocked: boolean;
  setSecretUnlocked: (val: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const initialSecretUnlocked = localStorage.getItem(SECRET_UNLOCK_KEY) === 'true';
  const savedTheme = localStorage.getItem(THEME_KEY) as ThemeName | null;
  const savedSecretTheme = localStorage.getItem(SECRET_THEME_KEY) as ThemeName | null;
  const initialTheme: ThemeName =
    savedSecretTheme === 'forge' && initialSecretUnlocked
      ? 'forge'
      : savedTheme && palettes[savedTheme]
        ? savedTheme
        : 'matrix';

  const savedFont = localStorage.getItem(FONT_KEY);
  const initialDefaultFont = defaultFontForTheme(initialTheme);
  const storedOverride = localStorage.getItem(FONT_OVERRIDE_KEY);
  const initialFontOverride =
    storedOverride !== null
      ? storedOverride === 'true'
      : !!(savedFont && savedFont !== initialDefaultFont);
  const initialFontKey = savedFont || initialDefaultFont;

  const [secretUnlocked, setSecretUnlocked] = useState<boolean>(initialSecretUnlocked);
  const [theme, setThemeState] = useState<ThemeName>(initialTheme);
  const [fontKey, setFontKeyState] = useState<string>(initialFontKey);
  const [fontOverride, setFontOverride] = useState<boolean>(initialFontOverride);

  const [fontScale, setFontScale] = useState<number>(() => {
    const saved = localStorage.getItem(FONT_SCALE_KEY);
    const parsed = saved ? Number(saved) : 1;
    return Number.isFinite(parsed) ? parsed : 1;
  });

  const [matrixBrightness, setMatrixBrightness] = useState<number>(() => {
    const stored = localStorage.getItem(MATRIX_BRIGHTNESS_KEY);
    const parsed = stored ? Number(stored) : 1;
    return Number.isFinite(parsed) ? parsed : 1;
  });

  const [matrixCodeColorOverride, setMatrixCodeColorOverride] = useState<boolean>(() => {
    return localStorage.getItem(MATRIX_COLOR_OVERRIDE_KEY) === 'true';
  });

  const [matrixCodeColor, setMatrixCodeColor] = useState<string>(() => {
    return localStorage.getItem(MATRIX_CODE_COLOR_KEY) || palettes.matrix.colors.primary;
  });

  const [matrixRainbow, setMatrixRainbow] = useState<boolean>(() => {
    return localStorage.getItem(MATRIX_RAINBOW_KEY) === 'true';
  });

  const palette = useMemo(() => palettes[theme] || palettes.matrix, [theme]);

  const applyFont = (key: string, override = true) => {
    setFontKeyState(key);
    setFontOverride(override);
    localStorage.setItem(FONT_KEY, key);
    localStorage.setItem(FONT_OVERRIDE_KEY, override ? 'true' : 'false');
  };

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', palette.name);
    const c = palette.colors;
    const set = (k: string, v: string) => root.style.setProperty(k, v);

    set('--theme-bg-base', c.background);
    set('--theme-bg-surface', c.surface);
    set('--theme-bg-elevated', c.elevated);
    set('--theme-bg-hover', c.hover);
    set('--theme-bg-nav', c.nav);
    set('--theme-bg-modal', c.modal);
    set('--theme-border-subtle', c.borderSubtle);
    set('--theme-border-strong', c.borderStrong);
    set('--theme-text', c.text);
    set('--theme-text-secondary', c.textSecondary);
    set('--theme-text-muted', c.textMuted);
    set('--theme-text-disabled', c.textDisabled);
    set('--theme-primary', c.primary);
    set('--theme-primary-soft', c.primarySoft);
    set('--theme-secondary', c.secondary);
    set('--theme-secondary-soft', c.secondarySoft);
    set('--theme-success', c.success);
    set('--theme-warning', c.warning);
    set('--theme-error', c.error);
    set('--theme-info', c.info);
    // legacy names used across styles
    set('--theme-background', c.background);
    set('--theme-surface', c.surface);
    set('--theme-border', c.borderSubtle);
    set('--theme-text', c.text);
    set('--theme-textSecondary', c.textSecondary);
    set('--theme-accent', c.secondary);
    set('--theme-secondary', c.secondary);
    set('--theme-primary-soft', c.primarySoft);
    set('--theme-success', c.success);
    set('--theme-warning', c.warning);
    set('--theme-error', c.error);
    set('--theme-glow-primary', c.glowPrimary || '0 0 0 rgba(0,0,0,0)');
    set('--theme-glow-secondary', c.glowSecondary || '0 0 0 rgba(0,0,0,0)');

    // shadcn tokens (HSL values)
    const toHsl = (hex: string) => {
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h = 0;
      let s = 0;
      const l = (max + min) / 2;
      const d = max - min;
      if (d !== 0) {
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r:
            h = (g - b) / d + (g < b ? 6 : 0);
            break;
          case g:
            h = (b - r) / d + 2;
            break;
          case b:
            h = (r - g) / d + 4;
            break;
        }
        h /= 6;
      }
      return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
    };

    root.style.setProperty('--background', toHsl(c.background));
    root.style.setProperty('--foreground', toHsl(c.text));
    root.style.setProperty('--card', toHsl(c.surface));
    root.style.setProperty('--card-foreground', toHsl(c.text));
    root.style.setProperty('--popover', toHsl(c.modal));
    root.style.setProperty('--popover-foreground', toHsl(c.text));
    root.style.setProperty('--primary', toHsl(c.primary));
    root.style.setProperty('--primary-foreground', toHsl(c.background));
    root.style.setProperty('--secondary', toHsl(c.secondary));
    root.style.setProperty('--secondary-foreground', toHsl(c.background));
    root.style.setProperty('--muted', toHsl(c.borderSubtle));
    root.style.setProperty('--muted-foreground', toHsl(c.textSecondary));
    root.style.setProperty('--accent', toHsl(c.secondary));
    root.style.setProperty('--accent-foreground', toHsl(c.background));
    root.style.setProperty('--destructive', toHsl(c.error));
    root.style.setProperty('--destructive-foreground', toHsl(c.text));
    root.style.setProperty('--border', toHsl(c.borderSubtle));
    root.style.setProperty('--input', toHsl(c.borderSubtle));
    root.style.setProperty('--ring', toHsl(c.primary));
    root.style.setProperty('--radius', '0.75rem');
  }, [palette]);

  useEffect(() => {
    const font = fontChoices.find((f) => f.key === fontKey) || fontChoices[0];
    document.body.style.fontFamily = font.stack;
    document.documentElement.style.setProperty('--app-font', font.stack);
    localStorage.setItem(FONT_KEY, font.key);
  }, [fontKey]);

  useEffect(() => {
    if (!fontOverride) {
      const themeDefault = defaultFontForTheme(theme);
      if (fontKey !== themeDefault) {
        setFontKeyState(themeDefault);
      }
      localStorage.setItem(FONT_KEY, themeDefault);
      localStorage.setItem(FONT_OVERRIDE_KEY, 'false');
    }
  }, [theme, fontOverride, fontKey]);

  useEffect(() => {
    localStorage.setItem(FONT_OVERRIDE_KEY, fontOverride ? 'true' : 'false');
  }, [fontOverride]);

  useEffect(() => {
    const clamped = Math.min(Math.max(fontScale, 0.9), 1.2);
    document.documentElement.style.fontSize = `${clamped * 16}px`;
    localStorage.setItem(FONT_SCALE_KEY, String(clamped));
  }, [fontScale]);

  useEffect(() => {
    const clamped = Math.min(Math.max(matrixBrightness, 0.2), 1.2);
    document.documentElement.style.setProperty('--matrix-brightness', String(clamped));
    localStorage.setItem(MATRIX_BRIGHTNESS_KEY, String(clamped));
  }, [matrixBrightness]);

  useEffect(() => {
    if (matrixCodeColor) {
      document.documentElement.style.setProperty('--matrix-green', matrixCodeColor);
      localStorage.setItem(MATRIX_CODE_COLOR_KEY, matrixCodeColor);
    }
  }, [matrixCodeColor]);

  useEffect(() => {
    if (matrixCodeColorOverride) return;
    const next = palette.colors.primary;
    setMatrixCodeColor((current) => (current === next ? current : next));
  }, [palette, matrixCodeColorOverride, setMatrixCodeColor]);

  useEffect(() => {
    localStorage.setItem(MATRIX_COLOR_OVERRIDE_KEY, matrixCodeColorOverride ? 'true' : 'false');
  }, [matrixCodeColorOverride]);

  useEffect(() => {
    localStorage.setItem(MATRIX_RAINBOW_KEY, matrixRainbow ? 'true' : 'false');
  }, [matrixRainbow]);

  const setTheme = (name: ThemeName) => {
    setThemeState(name);
    localStorage.setItem(THEME_KEY, name);
    const paletteForTheme = palettes[name] || palettes.matrix;
    const nextMatrixColor = paletteForTheme.colors.primary;
    setMatrixCodeColorOverride(false);
    localStorage.setItem(MATRIX_COLOR_OVERRIDE_KEY, 'false');
    setMatrixCodeColor(nextMatrixColor);
    localStorage.setItem(MATRIX_CODE_COLOR_KEY, nextMatrixColor);
    if (name === 'forge') {
      localStorage.setItem(SECRET_THEME_KEY, 'forge');
      localStorage.setItem(SECRET_UNLOCK_KEY, 'true');
      setSecretUnlocked(true);
    }
  };

  const resetMatrixVisuals = () => {
    setTheme('matrix');
    setMatrixBrightness(1);
    localStorage.setItem(MATRIX_BRIGHTNESS_KEY, '1');
    setMatrixCodeColorOverride(false);
    localStorage.setItem(MATRIX_COLOR_OVERRIDE_KEY, 'false');
    setMatrixCodeColor(palettes.matrix.colors.primary);
    localStorage.setItem(MATRIX_CODE_COLOR_KEY, palettes.matrix.colors.primary);
    setMatrixRainbow(false);
    localStorage.setItem(MATRIX_RAINBOW_KEY, 'false');
  };

  const setFont = (key: string) => {
    applyFont(key, true);
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        resetMatrixVisuals,
        palette,
        fontKey,
        setFontKey: setFont,
        fontOverride,
        resetFontOverride: () => applyFont(defaultFontForTheme(theme), false),
        fontScale,
        setFontScale,
        fonts: fontChoices,
        matrixBrightness,
        setMatrixBrightness,
        matrixCodeColor,
        setMatrixCodeColor: (val) => {
          setMatrixCodeColorOverride(true);
          localStorage.setItem(MATRIX_COLOR_OVERRIDE_KEY, 'true');
          setMatrixCodeColor(val);
        },
        matrixRainbow,
        setMatrixRainbow,
        secretUnlocked,
        setSecretUnlocked: (val) => {
          setSecretUnlocked(val);
          localStorage.setItem(SECRET_UNLOCK_KEY, val ? 'true' : 'false');
        },
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

export const availableThemes = Object.values(palettes).map(({ name, label }) => ({ name, label }));

export const fonts = fontChoices;
export const themePalettes: Readonly<Record<ThemeName, Palette>> = palettes;
