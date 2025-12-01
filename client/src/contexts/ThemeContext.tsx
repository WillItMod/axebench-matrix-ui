import React, { createContext, useContext, useState, useEffect } from 'react';

export type ThemeName = 'matrix' | 'cyberpunk' | 'dark-blue' | 'neon-purple' | 'minimal';

export interface Theme {
  name: ThemeName;
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
}

export const themes: Record<ThemeName, Theme> = {
  matrix: {
    name: 'matrix',
    label: 'Matrix Green',
    colors: {
      primary: '#00ff41',
      secondary: '#00cc33',
      accent: '#00ffff',
      background: '#000000',
      surface: '#0a0a0a',
      text: '#00ff41',
      textSecondary: '#00cc33',
      border: '#00ff41',
      success: '#00ff41',
      warning: '#ffaa00',
      error: '#ff0040',
    },
  },
  cyberpunk: {
    name: 'cyberpunk',
    label: 'Cyberpunk',
    colors: {
      primary: '#ff00ff',
      secondary: '#ff0080',
      accent: '#00ffff',
      background: '#0a0014',
      surface: '#1a0a28',
      text: '#ff00ff',
      textSecondary: '#ff0080',
      border: '#ff00ff',
      success: '#00ffff',
      warning: '#ffaa00',
      error: '#ff0040',
    },
  },
  'dark-blue': {
    name: 'dark-blue',
    label: 'Dark Blue',
    colors: {
      primary: '#0099ff',
      secondary: '#0066cc',
      accent: '#00ccff',
      background: '#000814',
      surface: '#001d3d',
      text: '#0099ff',
      textSecondary: '#0066cc',
      border: '#0099ff',
      success: '#00cc66',
      warning: '#ffaa00',
      error: '#ff0040',
    },
  },
  'neon-purple': {
    name: 'neon-purple',
    label: 'Neon Purple',
    colors: {
      primary: '#bb00ff',
      secondary: '#8800cc',
      accent: '#ff00cc',
      background: '#0a000a',
      surface: '#1a001a',
      text: '#bb00ff',
      textSecondary: '#8800cc',
      border: '#bb00ff',
      success: '#00ff88',
      warning: '#ffaa00',
      error: '#ff0040',
    },
  },
  minimal: {
    name: 'minimal',
    label: 'Minimal Dark',
    colors: {
      primary: '#ffffff',
      secondary: '#cccccc',
      accent: '#888888',
      background: '#000000',
      surface: '#111111',
      text: '#ffffff',
      textSecondary: '#cccccc',
      border: '#333333',
      success: '#00cc66',
      warning: '#ffaa00',
      error: '#ff0040',
    },
  },
};

interface ThemeContextType {
  theme: Theme;
  themeName: ThemeName;
  setTheme: (name: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeName, setThemeName] = useState<ThemeName>(() => {
    const saved = localStorage.getItem('axebench-theme');
    return (saved as ThemeName) || 'matrix';
  });

  const theme = themes[themeName];

  useEffect(() => {
    // Apply theme colors to CSS variables
    const root = document.documentElement;
    Object.entries(theme.colors).forEach(([key, value]) => {
      root.style.setProperty(`--theme-${key}`, value);
    });

    // Also update existing color variables for backwards compatibility
    root.style.setProperty('--neon-cyan', theme.colors.primary);
    root.style.setProperty('--neon-pink', theme.colors.accent);
    root.style.setProperty('--text-primary', theme.colors.text);
    root.style.setProperty('--text-secondary', theme.colors.textSecondary);
    root.style.setProperty('--success-green', theme.colors.success);
    root.style.setProperty('--warning-yellow', theme.colors.warning);
    root.style.setProperty('--error-red', theme.colors.error);
  }, [theme]);

  const setTheme = (name: ThemeName) => {
    setThemeName(name);
    localStorage.setItem('axebench-theme', name);
  };

  return (
    <ThemeContext.Provider value={{ theme, themeName, setTheme }}>
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
