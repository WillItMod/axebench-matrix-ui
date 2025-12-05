import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

type TemperatureUnit = 'C' | 'F';
type HashrateDisplay = 'auto' | 'gh' | 'th';
type TimeFormat = '24h' | '12h';

const SETTINGS_KEY = 'axebench:user-settings';

export interface SettingsState {
  temperatureUnit: TemperatureUnit;
  hashrateDisplay: HashrateDisplay;
  timeFormat: TimeFormat;
  dashboardRefreshMs: number;
  monitoringRefreshMs: number;
  reduceMotion: boolean;
  pauseMatrix: boolean;
  alertChipTemp: number; // stored in Celsius
  alertVrTemp: number; // stored in Celsius
  enforceSafetyLimits: boolean;
  safetyMaxChipTemp: number; // stored in Celsius
  safetyMaxVrTemp: number; // stored in Celsius
  safetyMaxPower: number; // stored in Watts
  modelBenchmarkDefaults: Record<string, BenchmarkDefaults>;
  globalBenchmarkDefaults: GlobalBenchmarkDefaults;
}

export interface BenchmarkDefaults {
  auto_mode: boolean;
  voltage_start: number;
  voltage_stop: number;
  voltage_step: number;
  frequency_start: number;
  frequency_stop: number;
  frequency_step: number;
  benchmark_duration: number;
  warmup_time: number;
  cooldown_time: number;
  cycles_per_test: number;
  goal: 'quiet' | 'efficient' | 'balanced' | 'max';
  fan_target?: number | null;
}

export interface GlobalBenchmarkDefaults {
  benchmark_duration: number;
  warmup_time: number;
  cooldown_time: number;
  cycles_per_test: number;
}

type SettingsContextValue = SettingsState & {
  updateSettings: (patch: Partial<SettingsState>) => void;
  getModelBenchmarkDefaults: (model: string | undefined | null) => BenchmarkDefaults | null;
  setModelBenchmarkDefaults: (model: string, defaults: BenchmarkDefaults | null) => void;
  setGlobalBenchmarkDefaults: (defaults: GlobalBenchmarkDefaults) => void;
  formatTemp: (tempC: number) => string;
  toDisplayTemp: (tempC: number) => number;
  fromDisplayTemp: (displayValue: number) => number;
  formatHashrate: (hashrateGh: number) => string;
  formatPower: (powerW: number) => string;
  formatTime: (value: number | string | Date) => string;
  applySafetyCaps: (config: any) => { config: any; changed: boolean; capped: string[] };
};

const defaultState: SettingsState = {
  temperatureUnit: 'C',
  hashrateDisplay: 'auto',
  timeFormat: '24h',
  dashboardRefreshMs: 5000,
  monitoringRefreshMs: 1000,
  reduceMotion: false,
  pauseMatrix: false,
  alertChipTemp: 70,
  alertVrTemp: 85,
  enforceSafetyLimits: true,
  safetyMaxChipTemp: 75,
  safetyMaxVrTemp: 95,
  safetyMaxPower: 35,
  modelBenchmarkDefaults: {},
  globalBenchmarkDefaults: {
    benchmark_duration: 120,
    warmup_time: 10,
    cooldown_time: 5,
    cycles_per_test: 1,
  },
};

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SettingsState>(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return { ...defaultState, ...parsed };
      }
    } catch {
      /* ignore */
    }
    return defaultState;
  });

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  }, [settings]);

  const toDisplayTemp = (tempC: number) => {
    if (!Number.isFinite(tempC)) return 0;
    return settings.temperatureUnit === 'F' ? tempC * 1.8 + 32 : tempC;
  };

  const fromDisplayTemp = (displayValue: number) => {
    if (!Number.isFinite(displayValue)) return 0;
    return settings.temperatureUnit === 'F' ? (displayValue - 32) / 1.8 : displayValue;
  };

  const formatTemp = (tempC: number) => {
    const val = toDisplayTemp(tempC);
    const unit = settings.temperatureUnit === 'F' ? '°F' : '°C';
    return `${val.toFixed(1)}${unit}`;
  };

  const formatHashrate = (hashrateGh: number) => {
    const val = Number(hashrateGh) || 0;
    if (settings.hashrateDisplay === 'th') {
      return `${(val / 1000).toFixed(2)} TH/s`;
    }
    if (settings.hashrateDisplay === 'gh') {
      return `${val.toFixed(1)} GH/s`;
    }
    // auto
    if (val >= 1000) {
      return `${(val / 1000).toFixed(2)} TH/s`;
    }
    return `${val.toFixed(1)} GH/s`;
  };

  const formatPower = (powerW: number) => {
    const val = Number(powerW) || 0;
    return `${val.toFixed(1)} W`;
  };

  const formatTime = (value: number | string | Date) => {
    const date = value instanceof Date ? value : new Date(value);
    const options: Intl.DateTimeFormatOptions = {
      hour12: settings.timeFormat === '12h',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    };
    return date.toLocaleTimeString([], options);
  };

  const applySafetyCaps = (config: any) => {
    if (!settings.enforceSafetyLimits || !config) return { config, changed: false, capped: [] };
    const capped: string[] = [];
    const next = { ...config } as any;
    if (Number.isFinite(settings.safetyMaxChipTemp) && next.max_chip_temp > settings.safetyMaxChipTemp) {
      next.max_chip_temp = settings.safetyMaxChipTemp;
      capped.push('chip temp');
    }
    if (Number.isFinite(settings.safetyMaxVrTemp) && next.max_vr_temp > settings.safetyMaxVrTemp) {
      next.max_vr_temp = settings.safetyMaxVrTemp;
      capped.push('VR temp');
    }
    if (Number.isFinite(settings.safetyMaxPower) && next.max_power > settings.safetyMaxPower) {
      next.max_power = settings.safetyMaxPower;
      capped.push('power');
    }
    return { config: next, changed: capped.length > 0, capped };
  };

  const getModelBenchmarkDefaults = (model: string | undefined | null): BenchmarkDefaults | null => {
    if (!model) return null;
    const key = String(model).toLowerCase();
    return settings.modelBenchmarkDefaults[key] || null;
  };

  const setModelBenchmarkDefaults = (model: string, defaults: BenchmarkDefaults | null) => {
    const key = String(model || '').toLowerCase();
    setSettings((prev) => {
      const next = { ...prev.modelBenchmarkDefaults };
      if (!defaults) {
        delete next[key];
      } else {
        next[key] = defaults;
      }
      return { ...prev, modelBenchmarkDefaults: next };
    });
  };

  const setGlobalBenchmarkDefaults = (defaults: GlobalBenchmarkDefaults) => {
    setSettings((prev) => ({ ...prev, globalBenchmarkDefaults: { ...prev.globalBenchmarkDefaults, ...defaults } }));
  };

  const updateSettings = (patch: Partial<SettingsState>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  };

  const value = useMemo<SettingsContextValue>(() => ({
    ...settings,
    updateSettings,
    formatTemp,
    toDisplayTemp,
    fromDisplayTemp,
    formatHashrate,
    formatPower,
    formatTime,
    applySafetyCaps,
    getModelBenchmarkDefaults,
    setModelBenchmarkDefaults,
    setGlobalBenchmarkDefaults,
  }), [settings]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}

