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
      secondary: '#00e5ff',
      accent: '#ffea00',
      background: '#05000c',
      surface: '#0f0a1a',
      text: '#fdf4ff',
      textSecondary: '#c7b7ff',
      border: '#291f45',
      success: '#32ffa3',
      warning: '#ffd166',
      error: '#ff4f81',
    },
  },
  'cyberpunk-core': {
    name: 'cyberpunk-core',
    label: 'Cyberpunk Core',
    colors: {
      primary: '#ff2bc2',
      secondary: '#00f0ff',
      accent: '#f9ff00',
      background: '#080013',
      surface: '#120024',
      text: '#fef2ff',
      textSecondary: '#b8c7ff',
      border: '#2d1f4f',
      success: '#36ffb5',
      warning: '#ffd54f',
      error: '#ff4d6d',
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
  { key: 'oxanium', label: 'Oxanium', stack: '\"Oxanium\", \"Inter\", system-ui, sans-serif' },
  { key: 'orbitron', label: 'Orbitron', stack: '\"Orbitron\", \"Inter\", system-ui, sans-serif' },
  { key: 'rajdhani', label: 'Rajdhani', stack: '\"Rajdhani\", \"Inter\", system-ui, sans-serif' },
  { key: 'press-start', label: 'Press Start 2P', stack: '\"Press Start 2P\", \"Inter\", system-ui, sans-serif' },
  { key: 'vt323', label: 'VT323', stack: '\"VT323\", monospace' },
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
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const PALETTE_KEY = 'axebench-palette';
const CUSTOM_PALETTE_KEY = 'axebench-custom-palette';
const FONT_KEY = 'axebench-font';
const THEME_KEY = 'axebench-theme';

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

  const [fontKey, setFontKey] = useState<string>(() => localStorage.getItem(FONT_KEY) || 'oxanium');

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
