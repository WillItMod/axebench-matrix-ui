import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type ThemeName = 'matrix' | 'cyberpunk' | 'dark-blue' | 'neon-purple' | 'minimal';

export interface Theme {
  name: ThemeName;
  label: string;
}

export type PaletteName =
  | 'matrix-green'
  | 'contrast-cyan-red'
  | 'solar-flare'
  | 'arctic'
  | 'amber-ice'
  | 'ultraviolet'
  | 'stealth'
  | 'emerald-sand'
  | 'signal'
  | 'neon-blast'
  | 'cyberpunk-core'
  | 'arcade-neon'
  | 'terminal-green'
  | 'blackout'
  | 'vaporwave-dream'
  | 'tron-grid'
  | 'ember-forge'
  | 'midnight-gold'
  | 'oceanic-blue'
  | 'neon-teal'
  | 'boring-grey'
  | 'custom';

export interface Palette {
  name: PaletteName;
  label: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    border: string;
    success: string;
    warning: string;
    error: string;
  };
  userEditable?: boolean;
}

export interface FontChoice {
  key: string;
  label: string;
  stack: string;
}

export const themes: Record<ThemeName, Theme> = {
  matrix: { name: 'matrix', label: 'Matrix Classic' },
  cyberpunk: { name: 'cyberpunk', label: 'Cyberpunk' },
  'dark-blue': { name: 'dark-blue', label: 'Dark Blue' },
  'neon-purple': { name: 'neon-purple', label: 'Neon Purple' },
  minimal: { name: 'minimal', label: 'Minimal Dark' },
};

const basePalettes: Record<PaletteName, Palette> = {
  'matrix-green': {
    name: 'matrix-green',
    label: 'Matrix Green',
    colors: {
      primary: '#00ff41',
      secondary: '#00cc33',
      accent: '#00e5ff',
      background: '#000000',
      surface: '#0a0a0a',
      text: '#e5ffe5',
      textSecondary: '#8bf18b',
      border: '#1f5f2f',
      success: '#00ff41',
      warning: '#f1c40f',
      error: '#ff3366',
    },
  },
  'contrast-cyan-red': {
    name: 'contrast-cyan-red',
    label: 'Cyan / Signal Red',
    colors: {
      primary: '#00e7ff',
      secondary: '#ff1744',
      accent: '#ffd300',
      background: '#0b1018',
      surface: '#111927',
      text: '#e9f4ff',
      textSecondary: '#9fb5c7',
      border: '#223147',
      success: '#3de18a',
      warning: '#f6b73c',
      error: '#ff4c4c',
    },
  },
  'solar-flare': {
    name: 'solar-flare',
    label: 'Solar Flare',
    colors: {
      primary: '#ff9100',
      secondary: '#ff3d00',
      accent: '#ffe100',
      background: '#0d0a0f',
      surface: '#1b141c',
      text: '#fff4e6',
      textSecondary: '#f5c07b',
      border: '#3a1f1c',
      success: '#8bc34a',
      warning: '#ffb300',
      error: '#ff5252',
    },
  },
  arctic: {
    name: 'arctic',
    label: 'Arctic Glow',
    colors: {
      primary: '#33d6ff',
      secondary: '#0a84ff',
      accent: '#9af7ff',
      background: '#050915',
      surface: '#0d1324',
      text: '#e7f5ff',
      textSecondary: '#9eb8d6',
      border: '#1c2c4b',
      success: '#3ad29f',
      warning: '#ffdd57',
      error: '#ff5c8d',
    },
  },
  'amber-ice': {
    name: 'amber-ice',
    label: 'Amber Ice',
    colors: {
      primary: '#ffb300',
      secondary: '#0ed09d',
      accent: '#6aa7ff',
      background: '#0a0e14',
      surface: '#111827',
      text: '#f9fafb',
      textSecondary: '#d1d5db',
      border: '#1f2937',
      success: '#34d399',
      warning: '#f59e0b',
      error: '#ef4444',
    },
  },
  ultraviolet: {
    name: 'ultraviolet',
    label: 'Ultraviolet',
    colors: {
      primary: '#c084fc',
      secondary: '#7c3aed',
      accent: '#06b6d4',
      background: '#0b0b14',
      surface: '#141426',
      text: '#ede9fe',
      textSecondary: '#c4b5fd',
      border: '#312e81',
      success: '#22c55e',
      warning: '#fbbf24',
      error: '#f43f5e',
    },
  },
  stealth: {
    name: 'stealth',
    label: 'Stealth',
    colors: {
      primary: '#c7cdd6',
      secondary: '#4b5563',
      accent: '#22d3ee',
      background: '#050607',
      surface: '#0f1115',
      text: '#e5e7eb',
      textSecondary: '#9ca3af',
      border: '#1f2937',
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444',
    },
  },
  'emerald-sand': {
    name: 'emerald-sand',
    label: 'Emerald Sand',
    colors: {
      primary: '#19d18f',
      secondary: '#ffad33',
      accent: '#ff6fb5',
      background: '#0b0f0a',
      surface: '#111810',
      text: '#e6f4ea',
      textSecondary: '#b7c7b8',
      border: '#1f2a1f',
      success: '#22c55e',
      warning: '#f59e0b',
      error: '#ef4444',
    },
  },
  signal: {
    name: 'signal',
    label: 'Signal High-Contrast',
    colors: {
      primary: '#00f5d4',
      secondary: '#ff006e',
      accent: '#ffe600',
      background: '#040507',
      surface: '#0d0f14',
      text: '#f8fafc',
      textSecondary: '#cbd5e1',
      border: '#1f2933',
      success: '#2dd4bf',
      warning: '#fbbf24',
      error: '#f43f5e',
    },
  },
  'neon-blast': {
    name: 'neon-blast',
    label: 'Neon Blast',
    colors: {
      primary: '#ff00ff',
      secondary: '#00ffd5',
      accent: '#ffe600',
      background: '#01000f',
      surface: '#19002a',
      text: '#fff4ff',
      textSecondary: '#e5b4ff',
      border: '#3c0c52',
      success: '#56ffb8',
      warning: '#ffcb00',
      error: '#ff2270',
    },
  },
  'cyberpunk-core': {
    name: 'cyberpunk-core',
    label: 'Cyberpunk Core',
    colors: {
      primary: '#ff007a',
      secondary: '#00f8ff',
      accent: '#faff00',
      background: '#0c001c',
      surface: '#21003f',
      text: '#fdf3ff',
      textSecondary: '#a8ddff',
      border: '#43186c',
      success: '#2dfacf',
      warning: '#ffe04f',
      error: '#ff0f70',
    },
  },
  'arcade-neon': {
    name: 'arcade-neon',
    label: 'Arcade Neon',
    colors: {
      primary: '#39ff14',
      secondary: '#ff5e00',
      accent: '#00b3ff',
      background: '#010405',
      surface: '#0a0f14',
      text: '#eaffea',
      textSecondary: '#96f5c0',
      border: '#1a2a2f',
      success: '#3bff8f',
      warning: '#ffa500',
      error: '#ff2a6d',
    },
  },
  'terminal-green': {
    name: 'terminal-green',
    label: 'Terminal Green',
    colors: {
      primary: '#00ff66',
      secondary: '#00c853',
      accent: '#00e5ff',
      background: '#010302',
      surface: '#0a0f0a',
      text: '#e5ffe5',
      textSecondary: '#8bf18b',
      border: '#1a2b1a',
      success: '#00ff66',
      warning: '#ffca28',
      error: '#ff5252',
    },
  },
  blackout: {
    name: 'blackout',
    label: 'Dark Matter (Blackout)',
    colors: {
      primary: '#0c0c0c',
      secondary: '#121212',
      accent: '#1a1a1a',
      background: '#000000',
      surface: '#050505',
      text: '#b0b0b0',
      textSecondary: '#6a6a6a',
      border: '#0a0a0a',
      success: '#3f3f3f',
      warning: '#4a4a4a',
      error: '#5a5a5a',
    },
  },
  'vaporwave-dream': {
    name: 'vaporwave-dream',
    label: 'Vaporwave Dream',
    colors: {
      primary: '#ff8ad6',
      secondary: '#2dd6ff',
      accent: '#9dffb0',
      background: '#24103a',
      surface: '#301b4d',
      text: '#fff6ff',
      textSecondary: '#d6c2ff',
      border: '#3c2b68',
      success: '#4fffb0',
      warning: '#ffd46b',
      error: '#ff5fa9',
    },
  },
  'tron-grid': {
    name: 'tron-grid',
    label: 'TRON Grid',
    colors: {
      primary: '#00f0ff',
      secondary: '#ff007a',
      accent: '#00ff9c',
      background: '#050910',
      surface: '#0a121f',
      text: '#e6f9ff',
      textSecondary: '#9fd5ff',
      border: '#133049',
      success: '#1de9b6',
      warning: '#ffd54f',
      error: '#ff4081',
    },
  },
  'ember-forge': {
    name: 'ember-forge',
    label: 'Ember Forge',
    colors: {
      primary: '#ff5c1b',
      secondary: '#ffd75e',
      accent: '#1ec8ff',
      background: '#0c0502',
      surface: '#1b0e07',
      text: '#fff1e0',
      textSecondary: '#f3c9a0',
      border: '#3c1e12',
      success: '#89f08a',
      warning: '#ffb547',
      error: '#ff3f3f',
    },
  },
  'midnight-gold': {
    name: 'midnight-gold',
    label: 'Midnight Gold',
    colors: {
      primary: '#ffd447',
      secondary: '#00d9c5',
      accent: '#a78bfa',
      background: '#040509',
      surface: '#0d0f17',
      text: '#fff9e6',
      textSecondary: '#d9cfa0',
      border: '#25283a',
      success: '#26dfc6',
      warning: '#ffd166',
      error: '#ef4444',
    },
  },
  'oceanic-blue': {
    name: 'oceanic-blue',
    label: 'Oceanic Blue',
    colors: {
      primary: '#00d8ff',
      secondary: '#0050ff',
      accent: '#7cf0ff',
      background: '#041018',
      surface: '#0b1f2b',
      text: '#e6f6ff',
      textSecondary: '#a5c9e0',
      border: '#163245',
      success: '#34d399',
      warning: '#fbbf24',
      error: '#f43f5e',
    },
  },
  'neon-teal': {
    name: 'neon-teal',
    label: 'Neon Teal',
    colors: {
      primary: '#00ffcf',
      secondary: '#00c2ff',
      accent: '#ff6bd6',
      background: '#02090c',
      surface: '#0a1419',
      text: '#e9fffb',
      textSecondary: '#b8f0e6',
      border: '#12343a',
      success: '#26ebb5',
      warning: '#ffc94a',
      error: '#ff3f72',
    },
  },
  'boring-grey': {
    name: 'boring-grey',
    label: 'BORING (All Grey)',
    colors: {
      primary: '#7a7a7a',
      secondary: '#6b6b6b',
      accent: '#5c5c5c',
      background: '#111111',
      surface: '#1a1a1a',
      text: '#c0c0c0',
      textSecondary: '#8f8f8f',
      border: '#2a2a2a',
      success: '#8c8c8c',
      warning: '#999999',
      error: '#a6a6a6',
    },
  },
  custom: {
    name: 'custom',
    label: 'Custom Palette',
    userEditable: true,
    colors: {
      primary: '#00ff41',
      secondary: '#00b894',
      accent: '#ffd166',
      background: '#000000',
      surface: '#0a0a0a',
      text: '#e5ffe5',
      textSecondary: '#9fb5c7',
      border: '#1f3a55',
      success: '#3de18a',
      warning: '#f6b73c',
      error: '#ff4c4c',
    },
  },
};

export const fonts: FontChoice[] = [
  { key: 'default', label: 'System Default', stack: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif' },
  { key: 'share-tech', label: 'Share Tech Mono (Teal Terminal)', stack: '\"Share Tech Mono\", \"IBM Plex Mono\", monospace' },
  { key: 'space-grotesk', label: 'Space Grotesk (Modern)', stack: '\"Space Grotesk\", \"Inter\", system-ui, sans-serif' },
  { key: 'exo2', label: 'Exo 2 (Sci-Fi)', stack: '\"Exo 2\", \"Inter\", system-ui, sans-serif' },
  { key: 'sora', label: 'Sora (Clean Tech)', stack: '\"Sora\", \"Inter\", system-ui, sans-serif' },
  { key: 'audiowide', label: 'Audiowide (Arcade)', stack: '\"Audiowide\", \"Inter\", system-ui, sans-serif' },
  { key: 'vt323', label: 'VT323 (Retro Terminal)', stack: '\"VT323\", monospace' },
  { key: 'plex-mono', label: 'IBM Plex Mono', stack: '\"IBM Plex Mono\", \"Inter\", monospace' },
];

interface ThemeContextType {
  themeName: ThemeName;
  setTheme: (name: ThemeName) => void;
  paletteName: PaletteName;
  setPalette: (name: PaletteName, custom?: Partial<Palette['colors']>) => void;
  palette: Palette;
  fonts: FontChoice[];
  fontKey: string;
  setFontKey: (key: string) => void;
  fontScale: number;
  setFontScale: (scale: number) => void;
  matrixCodeColor: string;
  setMatrixCodeColor: (color: string) => void;
  matrixBrightness: number;
  setMatrixBrightness: (val: number) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const PALETTE_KEY = 'axebench-palette';
const CUSTOM_PALETTE_KEY = 'axebench-custom-palette';
const FONT_KEY = 'axebench-font';
const THEME_KEY = 'axebench-theme';
const FONT_SCALE_KEY = 'axebench-font-scale';
const MATRIX_CODE_COLOR_KEY = 'axebench-matrix-code-color';
const MATRIX_BRIGHTNESS_KEY = 'axebench-matrix-brightness';

function loadCustomPalette(): Partial<Palette['colors']> | null {
  try {
    const raw = localStorage.getItem(CUSTOM_PALETTE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeName, setThemeName] = useState<ThemeName>(() => {
    const saved = localStorage.getItem(THEME_KEY);
    return (saved as ThemeName) || 'matrix';
  });

  const [paletteName, setPaletteName] = useState<PaletteName>(() => {
    const saved = localStorage.getItem(PALETTE_KEY) as PaletteName | null;
    return saved || 'matrix-green';
  });

  const [customPalette, setCustomPalette] = useState<Partial<Palette['colors']> | null>(() => loadCustomPalette());

  const [fontKey, setFontKey] = useState<string>(() => localStorage.getItem(FONT_KEY) || 'share-tech');
  const [fontScale, setFontScale] = useState<number>(() => {
    const saved = localStorage.getItem(FONT_SCALE_KEY);
    return saved ? Number(saved) || 1 : 1;
  });
  const [matrixCodeColor, setMatrixCodeColor] = useState<string>(() => {
    return localStorage.getItem(MATRIX_CODE_COLOR_KEY) || basePalettes['matrix-green'].colors.primary;
  });
  const [matrixBrightness, setMatrixBrightness] = useState<number>(() => {
    const saved = localStorage.getItem(MATRIX_BRIGHTNESS_KEY);
    const parsed = saved ? Number(saved) : 1;
    if (!Number.isFinite(parsed)) return 1;
    return Math.min(Math.max(parsed, 0.2), 1.2);
  });

  const palette = useMemo(() => {
    if (paletteName === 'custom' && customPalette) {
      return {
        ...basePalettes.custom,
        colors: { ...basePalettes.custom.colors, ...customPalette },
      };
    }
    return basePalettes[paletteName] || basePalettes['matrix-green'];
  }, [paletteName, customPalette]);

  useEffect(() => {
    const root = document.documentElement;
    Object.entries(palette.colors).forEach(([key, value]) => {
      root.style.setProperty(`--theme-${key}`, value);
    });
    // convenient aliases
    root.style.setProperty('--theme-primary', palette.colors.primary);
    root.style.setProperty('--theme-secondary', palette.colors.secondary);
    root.style.setProperty('--theme-accent', palette.colors.accent);
    root.style.setProperty('--neon-cyan', palette.colors.primary);
    root.style.setProperty('--neon-pink', palette.colors.accent);
    root.style.setProperty('--text-primary', palette.colors.text);
    root.style.setProperty('--text-secondary', palette.colors.textSecondary);
    root.style.setProperty('--success-green', palette.colors.success);
    root.style.setProperty('--warning-amber', palette.colors.warning);
    root.style.setProperty('--error-red', palette.colors.error);
    root.style.setProperty('--grid-gray', palette.colors.border);
  }, [palette]);

  useEffect(() => {
    const font = fonts.find((f) => f.key === fontKey) || fonts[0];
    document.body.style.fontFamily = font.stack;
    document.documentElement.style.setProperty('--app-font', font.stack);
  }, [fontKey]);

  useEffect(() => {
    const clamped = Math.min(Math.max(fontScale, 0.85), 1.25);
    document.documentElement.style.fontSize = `${clamped * 16}px`;
    localStorage.setItem(FONT_SCALE_KEY, String(clamped));
  }, [fontScale]);

  useEffect(() => {
    if (matrixCodeColor) {
      document.documentElement.style.setProperty('--matrix-green', matrixCodeColor);
      localStorage.setItem(MATRIX_CODE_COLOR_KEY, matrixCodeColor);
    }
  }, [matrixCodeColor]);

  useEffect(() => {
    const clamped = Math.min(Math.max(matrixBrightness, 0.2), 1.2);
    document.documentElement.style.setProperty('--matrix-brightness', String(clamped));
    localStorage.setItem(MATRIX_BRIGHTNESS_KEY, String(clamped));
  }, [matrixBrightness]);

  useEffect(() => {
    // Sync rain color to palette unless user is on custom; blackout uses deep grey
    if (paletteName === 'custom') return;
    if (paletteName === 'blackout') {
      setMatrixCodeColor('#555555');
      return;
    }
    setMatrixCodeColor(palette.colors.primary);
  }, [paletteName, palette.colors]);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    if (paletteName === 'blackout') {
      root.classList.add('blackout-mode');
      body.classList.add('blackout-mode');
    } else {
      root.classList.remove('blackout-mode');
      body.classList.remove('blackout-mode');
    }
  }, [paletteName]);

  const setTheme = (name: ThemeName) => {
    setThemeName(name);
    localStorage.setItem(THEME_KEY, name);
  };

  const setPalette = (name: PaletteName, custom?: Partial<Palette['colors']>) => {
    setPaletteName(name);
    localStorage.setItem(PALETTE_KEY, name);
    if (name === 'custom' && custom) {
      setCustomPalette(custom);
      localStorage.setItem(CUSTOM_PALETTE_KEY, JSON.stringify(custom));
    }
  };

  return (
    <ThemeContext.Provider
      value={{
        themeName,
        setTheme,
        paletteName,
        setPalette,
        palette,
        fonts,
        fontKey,
        setFontKey,
        fontScale,
        setFontScale,
        matrixCodeColor,
        setMatrixCodeColor,
        matrixBrightness,
        setMatrixBrightness,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}

export const palettes = basePalettes;
