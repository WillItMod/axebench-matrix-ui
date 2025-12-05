import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import BenchmarkConsole from '@/components/BenchmarkConsole';
import { useBenchmark } from '@/contexts/BenchmarkContext';
import LiveMonitoringPanel from '@/components/LiveMonitoringPanel';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { usePersistentState } from '@/hooks/usePersistentState';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useSettings } from '@/contexts/SettingsContext';
import BitcoinCelebrationOverlay from '@/components/BitcoinCelebrationOverlay';
import FireworksOverlay from '@/components/FireworksOverlay';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { autoTuneTracer } from '@/lib/autoTuneTracer';

export default function Benchmark() {
  const { status: benchmarkStatus, refreshStatus } = useBenchmark();
  const { applySafetyCaps, getModelBenchmarkDefaults, globalBenchmarkDefaults } = useSettings();
  const [devices, setDevices] = useState<any[]>([]);
  const [selectedDevice, setSelectedDevice] = usePersistentState<string>('benchmark-selected-device', '');
  
  // Read device from URL params (for pre-selection from Dashboard)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const deviceParam = params.get('device');
    if (deviceParam) {
      setSelectedDevice(decodeURIComponent(deviceParam));
    }
    if (params.get('autotune') === '1') {
      autoTuneIntentRef.current = true;
    }
  }, []);
  const [status, setStatus] = useState<any>(null);
  const [autoTuneDialogOpen, setAutoTuneDialogOpen] = useState(false);
  const [autoTuneStarting, setAutoTuneStarting] = useState(false);
  const [autoTuneAck, setAutoTuneAck] = usePersistentState<boolean>('autotune:acknowledged', false);
  const [autoTuneDontRemind, setAutoTuneDontRemind] = usePersistentState<boolean>('autotune:dont_remind', false);
  const [autoTuneNano, setAutoTuneNano] = usePersistentState<boolean>('autotune:nano_enabled', true);
  const [showCelebration, setShowCelebration] = useState(false);
  const autoTuneIntentRef = useRef(false);
  const [tuningMode, setTuningMode] = useState<'auto' | 'manual'>('auto'); // EASY vs ADVANCED
  const [preset, setPreset] = useState('standard'); // For EASY mode
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);
  const [engineDetail, setEngineDetail] = useState<{ open: boolean; title: string; lines: string[] }>({
    open: false,
    title: '',
    lines: [],
  });
  const presetOptions = [
    { key: 'quick', label: 'QUICK', detail: 'Fast scan' },
    { key: 'standard', label: 'STANDARD', detail: 'Balanced pass' },
    { key: 'deep', label: 'DEEP', detail: 'Thorough sweep' },
  ];
  const goalOptions = [
    { key: 'quiet', label: 'QUIET' },
    { key: 'efficient', label: 'EFFICIENT' },
    { key: 'balanced', label: 'BALANCED' },
    { key: 'max', label: 'MAX' },
  ];
  const toggleButtonClass = (active: boolean, tone: 'accent' | 'green' = 'green') =>
    `px-4 py-2 text-sm font-bold rounded transition-colors border ${
      active
        ? tone === 'accent'
          ? 'bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] border-[hsl(var(--accent))] shadow-[0_0_16px_hsla(var(--accent),0.45)]'
          : 'bg-[var(--matrix-green)] text-black border-[var(--matrix-green)] shadow-[0_0_14px_rgba(34,197,94,0.45)]'
        : 'text-[var(--text-secondary)] border-[var(--grid-gray)] hover:text-[var(--text-primary)] hover:border-[hsl(var(--accent))]'
    }`;
  
  // Configuration state
  const [config, setConfig] = useState({
    // Device
    device_model: 'gamma',
    
    // Auto Mode
    auto_mode: true,
    
    // Voltage settings
    voltage_start: 1100,
    voltage_stop: 1200,
    voltage_step: 20,
    
    // Frequency settings
    frequency_start: 400,
    frequency_stop: 700,
    frequency_step: 25,
    
    // Test parameters
    benchmark_duration: 120,
    warmup_time: 10,
    cooldown_time: 5,
    cycles_per_test: 1,
    target_error: 0.25,
    
    // Optimization goal
    goal: 'balanced',
    fan_target: null as number | null,
    
    // Safety limits
    max_chip_temp: 65,
    max_vr_temp: 85,
    max_power: 25,
    
    // Advanced options
    restart_between_tests: false,
    enable_plots: true,
    export_csv: true,
    
    // Auto-recovery
    auto_recovery: true,
    recovery_strategy: 'conservative',
    recovery_max_retries: 2,
    recovery_cooldown: 10,
  });
  const [graphsLoading, setGraphsLoading] = useState(false);
  const settingsLocked = benchmarkStatus.running;

  // Utility helpers for derived gauges
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v || 0));
  const safeDiv = (a: number, b: number) => (b ? a / b : 0);

  // Load devices
  useEffect(() => {
    loadDevices();
  }, []);

  // Auto-select device model when device is selected
  useEffect(() => {
    if (selectedDevice && devices.length > 0) {
      const device = devices.find(d => d.name === selectedDevice);
      if (device && device.model) {
        setConfig(prev => ({ ...prev, device_model: device.model.toLowerCase() }));
      }
    }
  }, [selectedDevice, devices]);

  useEffect(() => {
    const model = config.device_model || '';
    const defaults = getModelBenchmarkDefaults(model) || null;
    const globalDefaults = globalBenchmarkDefaults;
    const base = defaults || {
      auto_mode: config.auto_mode,
      voltage_start: config.voltage_start,
      voltage_stop: config.voltage_stop,
      voltage_step: config.voltage_step,
      frequency_start: config.frequency_start,
      frequency_stop: config.frequency_stop,
      frequency_step: config.frequency_step,
      benchmark_duration: globalDefaults.benchmark_duration,
      warmup_time: globalDefaults.warmup_time,
      cooldown_time: globalDefaults.cooldown_time,
      cycles_per_test: globalDefaults.cycles_per_test,
      goal: config.goal,
      fan_target: config.fan_target,
    };
    setConfig(prev => ({
      ...prev,
      auto_mode: base.auto_mode,
      voltage_start: base.voltage_start,
      voltage_stop: base.voltage_stop,
      voltage_step: base.voltage_step,
      frequency_start: base.frequency_start,
      frequency_stop: base.frequency_stop,
      frequency_step: base.frequency_step,
      benchmark_duration: base.benchmark_duration,
      warmup_time: base.warmup_time,
      cooldown_time: base.cooldown_time,
      cycles_per_test: base.cycles_per_test,
      goal: base.goal,
      fan_target: base.fan_target ?? null,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.device_model]);

  useEffect(() => {
    if (autoTuneIntentRef.current && selectedDevice) {
      autoTuneIntentRef.current = false;
      handleAutoTune();
    }
  }, [selectedDevice]);

   // Poll benchmark status
  useEffect(() => {
    if (!benchmarkStatus.running) return;
    
    const interval = setInterval(async () => {
      try {
        const statusData = await api.benchmark.status();
        setStatus(statusData);
        setGraphsLoading(false);
        
        // BenchmarkContext will handle state updates
        await refreshStatus();
      } catch (error) {
        console.error('Failed to fetch status:', error);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [benchmarkStatus.running, refreshStatus]);

  const loadDevices = async () => {
    try {
      const data = await api.devices.list();
      setDevices(data);
      
      // If device was pre-selected from URL but not yet in state, set it now
      const params = new URLSearchParams(window.location.search);
      const deviceParam = params.get('device');
      if (deviceParam && !selectedDevice) {
        const deviceName = decodeURIComponent(deviceParam);
        if (data.some((d: any) => d.name === deviceName)) {
          setSelectedDevice(deviceName);
        }
      }
    } catch (error) {
      console.error('Failed to load devices:', error);
    }
  };

  useEffect(() => {
    if (benchmarkStatus.running && selectedDevice) {
      setGraphsLoading(true);
    }
  }, [benchmarkStatus.running, selectedDevice]);

  const handleStart = async () => {
    if (settingsLocked) {
      toast.error('Stop the running benchmark before starting a new one');
      return;
    }
    if (!selectedDevice) {
      toast.error('Select a device first');
      return;
    }

    try {
      const presetId = tuningMode === 'auto'
        ? { quick: 'fast', standard: 'balanced', deep: 'nerd' }[preset] || 'balanced'
        : undefined;
      const goalKey = (config.goal || 'balanced').toLowerCase();
      const optimization_goal =
        goalKey === 'max' ? 'max_hashrate' :
        goalKey === 'performance' ? 'max_hashrate' :
        goalKey === 'efficient' ? 'efficient' :
        goalKey === 'quiet' ? 'quiet' :
        'balanced';

      const benchmarkConfig = {
        device: selectedDevice,
        ...config,
        strategy: 'adaptive_progression',
        preset: presetId,
        goal: goalKey,
        optimization_goal,
      };

      const { config: safeConfig, changed, capped } = applySafetyCaps(benchmarkConfig);
      const payload = {
        ...safeConfig,
        device: selectedDevice,
        mode: 'benchmark',
        preset: presetId,
        goal: goalKey,
        optimization_goal,
        duration: safeConfig.benchmark_duration,
        warmup: safeConfig.warmup_time,
        cooldown: safeConfig.cooldown_time,
        restart: safeConfig.restart_between_tests,
        enable_plotting: safeConfig.enable_plots,
        max_temp: safeConfig.max_chip_temp,
      };
      await api.benchmark.start(payload);
      await refreshStatus(); // Update global benchmark state
      toast.success('Benchmark started');
      if (changed) {
        toast.info(`Safety caps enforced (${capped.join(', ')})`);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to start benchmark');
    }
  };

  const handleStop = async () => {
    try {
      await api.benchmark.stop();
      await refreshStatus(); // Update global benchmark state
      toast.success('Benchmark stopped');
    } catch (error: any) {
      toast.error(error.message || 'Failed to stop benchmark');
    }
  };

  // Derived engine metrics for visual "stress" panel
  const liveData = status?.live_data || {};
  const numeric = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  // Estimate total tests when backend doesn't provide (or sends bad) counts.
  const estimateTestsTotal = () => {
    const src = (status as any)?.config || config;
    const vStart = numeric(src?.voltage_start);
    const vStop = numeric(src?.voltage_stop);
    const vStep = Math.max(1, numeric(src?.voltage_step) || 1);
    const fStart = numeric(src?.frequency_start);
    const fStop = numeric(src?.frequency_stop);
    const fStep = Math.max(1, numeric(src?.frequency_step) || 1);
    const cycles = Math.max(1, numeric(src?.cycles_per_test) || 1);

    const vCount = vStop > vStart ? Math.floor((vStop - vStart) / vStep) + 1 : 1;
    const fCount = fStop > fStart ? Math.floor((fStop - fStart) / fStep) + 1 : 1;
    const total = vCount * fCount * cycles;
    return Number.isFinite(total) && total > 0 ? total : 0;
  };

  const rawCompleted = numeric(status?.tests_completed ?? status?.tests_complete ?? benchmarkStatus.tests_completed);
  const rawTotal = numeric(status?.tests_total ?? benchmarkStatus.tests_total);
  const derivedTotal = rawTotal > 0 ? rawTotal : estimateTestsTotal();
  const clampedCompleted = Math.min(rawCompleted, derivedTotal || rawCompleted);
  const percentFromCounts =
    derivedTotal > 0 ? Math.min(100, Math.max(0, (clampedCompleted / derivedTotal) * 100)) : null;
  const baseProgress =
    Number.isFinite(status?.progress) && status?.progress !== null && status?.progress !== undefined
      ? numeric(status?.progress)
      : Number.isFinite(benchmarkStatus.progress)
      ? numeric(benchmarkStatus.progress)
      : percentFromCounts ?? 0;
  const progressVal =
    derivedTotal > 0 && percentFromCounts !== null
      ? Math.max(0, Math.min(100, percentFromCounts))
      : Math.max(0, Math.min(100, baseProgress));
  const testsCompleted = clampedCompleted;
  const testsTotal = derivedTotal;
  const maxChip = config.max_chip_temp || status?.safety_limits?.max_chip_temp || 70;
  const maxPower = config.max_power || status?.safety_limits?.max_power || 25;
  const maxVoltage = (config as any).max_voltage || 1400;
  const targetError = config.target_error || status?.config?.target_error || 0.25;
  const temp = Number(liveData.temp ?? liveData.temperature ?? 0);
  const power = Number(liveData.power ?? 0);
  const voltage = Number(liveData.voltage ?? config.voltage_start ?? 0);
  const frequency = Number(liveData.frequency ?? config.frequency_start ?? 0);
  const fanSpeed = Number(liveData.fan_speed ?? 0);
  const errorPct = Number(
    liveData.error_percentage ??
      liveData.errorPercent ??
      liveData.error_percent ??
      0
  );
  const hashrateGh = Number(liveData.hashrate ?? 0);
  const tempRatio = clamp01(temp / maxChip);
  const powerRatio = clamp01(power / maxPower);
  const voltageRatio = clamp01(voltage / maxVoltage);
  const tempHeadroom = maxChip - temp;
  const powerHeadroom = maxPower - power;
  const errorMargin = targetError - errorPct;
  const thermalStress = Math.min(
    100,
    tempRatio * 70 +
      (tempRatio > 0.85 ? 15 : 0) +
      (fanSpeed > 85 ? 10 : 0)
  );
  const powerStress = Math.min(
    100,
    Math.max(powerRatio, voltageRatio) * 80 + (powerRatio > 0.95 ? 10 : 0)
  );
  const errRatio = targetError ? clamp01(errorPct / targetError) : 0;
  const stabilityStress = Math.min(
    100,
    errRatio * 80 +
      ((status?.failed_combos?.length || 0) * 2) +
      ((status?.recovery_attempts || 0) * 5)
  );
  const vNorm = clamp01(
    safeDiv(
      voltage - config.voltage_start,
      Math.max(1, config.voltage_stop - config.voltage_start)
    )
  );
  const fNorm = clamp01(
    safeDiv(
      frequency - config.frequency_start,
      Math.max(1, config.frequency_stop - config.frequency_start)
    )
  );
  const push = (vNorm + fNorm + Math.max(powerRatio, voltageRatio)) / 3;
  const instability = clamp01(errRatio + (stabilityStress / 100) * 0.3);
  const balanceDelta = Math.max(-1, Math.min(1, push - instability));
  const efficiencyJth = hashrateGh > 0 ? power / (hashrateGh / 1000) : 0;

  const StressBar = ({
    label,
    value,
    color,
    tooltip,
    onClick,
  }: {
    label: string;
    value: number;
    color: string;
    tooltip: string;
    onClick?: () => void;
  }) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="space-y-1 cursor-help"
          onClick={onClick}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onClick?.();
            }
          }}
        >
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
            <span>{label}</span>
            <span className="text-[var(--text-primary)] font-semibold">{value.toFixed(0)}%</span>
          </div>
          <div className="w-full h-2 rounded bg-[var(--grid-gray)] overflow-hidden">
            <div
              className={`h-full transition-all`}
              style={{
                width: `${Math.min(100, Math.max(0, value))}%`,
                background: color,
                boxShadow: `0 0 8px ${color}`,
              }}
            />
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top">
        <div className="max-w-xs text-xs space-y-1">{tooltip}</div>
      </TooltipContent>
    </Tooltip>
  );

  const MiniSlider = ({
    label,
    ratio,
    display,
  }: {
    label: string;
    ratio: number;
    display: string;
  }) => (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
        <span>{label}</span>
        <span className="text-[var(--text-primary)] font-semibold">{display}</span>
      </div>
      <div className="w-full h-1.5 rounded bg-[var(--grid-gray)] overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[#22c55e] via-[#eab308] to-[#ef4444]"
          style={{ width: `${clamp01(ratio) * 100}%` }}
        />
      </div>
    </div>
  );

  const handleAutoTune = () => {
    if (settingsLocked) {
      toast.error('Stop the running benchmark before adjusting Autopilot');
      return;
    }
    if (!selectedDevice) {
      toast.error('Select a device first');
      return;
    }
    // Always show the dialog; preferences only prefill choices.
    setShowCelebration(true);
    setAutoTuneDialogOpen(true);
  };

  const startAutoTune = async ({ runNano, silent }: { runNano?: boolean; silent?: boolean } = {}) => {
    if (settingsLocked) {
      toast.error('Stop the running benchmark before starting Autopilot');
      return;
    }
    if (!selectedDevice || autoTuneStarting) return;
    const nanoPass = runNano ?? autoTuneNano;
    try {
      setAutoTuneStarting(true);
      setAutoTuneAck(true);
      setAutoTuneNano(nanoPass);
      if (autoTuneDontRemind) {
        setAutoTuneDontRemind(true);
      }

      const presetId = tuningMode === 'auto'
        ? { quick: 'fast', standard: 'balanced', deep: 'nerd' }[preset] || 'balanced'
        : undefined;
      const goalKey = (config.goal || 'balanced').toLowerCase();
      const optimization_goal =
        goalKey === 'max' ? 'max_hashrate' :
        goalKey === 'performance' ? 'max_hashrate' :
        goalKey === 'efficient' ? 'efficient' :
        goalKey === 'quiet' ? 'quiet' :
        'balanced';

      const runId = autoTuneTracer.startRun({
        device: selectedDevice,
        nano: nanoPass,
        goal: goalKey,
        optimization_goal,
        preset: presetId,
        mode: 'auto_tune',
      });

      const autoTuneConfig = {
        device: selectedDevice,
        ...config,
        auto_mode: true,
        goal: goalKey,
        optimization_goal,
        preset: presetId,
        benchmark_duration: config.benchmark_duration,
        duration: config.benchmark_duration, // alias expected by backend
        warmup: config.warmup_time,
        cooldown: config.cooldown_time,
        cycles_per_test: config.cycles_per_test,
        target_error: config.target_error,
        strategy: 'adaptive_progression',
        mode: 'auto_tune',
        nano_after_profiles: nanoPass,
        run_nano: nanoPass,
        profile_set: ['AUTO_QUIET', 'AUTO_EFFICIENT', 'AUTO_BALANCED', 'AUTO_MAX'],
        banner_hint: nanoPass ? 'Full sweep + Nano finish' : 'Full sweep',
        restart: config.restart_between_tests,
        enable_plotting: config.enable_plots,
        max_temp: config.max_chip_temp,
      };

      const { config: safeConfig, changed, capped } = applySafetyCaps(autoTuneConfig);
      autoTuneTracer.recordStartPayload(
        {
          device: selectedDevice,
          nano_after_profiles: nanoPass,
          goal: goalKey,
          preset: presetId,
          capped,
          changed,
          payload: {
            voltage_start: safeConfig.voltage_start,
            voltage_stop: safeConfig.voltage_stop,
            frequency_start: safeConfig.frequency_start,
            frequency_stop: safeConfig.frequency_stop,
            duration: safeConfig.benchmark_duration,
            warmup: safeConfig.warmup_time,
            cooldown: safeConfig.cooldown_time,
            auto_mode: safeConfig.auto_mode,
          },
        },
        runId
      );
      localStorage.setItem('axebench:autoTune_stage_hint', 'Full sweep running');
      localStorage.setItem('axebench:autoTune_nano', nanoPass ? 'true' : 'false');
      autoTuneTracer.recordStatus({
        mode: 'auto_tune',
        running: true,
        device: selectedDevice,
        progress: 0,
        phase: 'starting',
        goal: goalKey,
      });
      await api.benchmark.start({
        ...safeConfig,
        device: selectedDevice,
        mode: 'auto_tune',
        preset: presetId,
        optimization_goal,
        goal: goalKey,
        duration: safeConfig.benchmark_duration,
        warmup: safeConfig.warmup_time,
        cooldown: safeConfig.cooldown_time,
        restart: safeConfig.restart_between_tests,
        enable_plotting: safeConfig.enable_plots,
        max_temp: safeConfig.max_chip_temp,
      });
      await refreshStatus(); // Update global benchmark state
      autoTuneTracer.recordStatus({
        mode: 'auto_tune',
        running: true,
        device: selectedDevice,
        progress: 0,
        phase: 'started',
        goal: goalKey,
      });
      if (!silent) {
        toast.success(
          `AUTOPILOT engaged${nanoPass ? ' with Nano finish' : ''} - Stage 1: Full sweep`
        );
        if (changed) {
          toast.info(`Safety caps enforced (${capped.join(', ')})`);
        }
      }
      setAutoTuneDialogOpen(false);
      setShowCelebration(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to start Auto Tune');
      autoTuneTracer.recordError('Auto Tune start failed', { error: error?.message });
    } finally {
      setAutoTuneStarting(false);
    }
  };

  return (
    <>
    <div className="space-y-6">
      <div className="hud-panel">
        <h1 className="text-3xl font-bold text-glow-green mb-2">BENCHMARK</h1>
        <p className="text-[var(--text-secondary)] text-sm">
          Configure and execute voltage/frequency optimization benchmarks
        </p>
      </div>

      {settingsLocked && (
        <div className="matrix-card border-[var(--warning-amber)] text-[var(--warning-amber)] text-sm bg-[var(--dark-gray)]/70">
          Settings are locked while a benchmark is running. Press STOP_BENCHMARK to make changes.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Sidebar - Device Selection & Gauges */}
        <div className="lg:col-span-1 space-y-6">
          {/* Device Selection */}
          <div className="matrix-card">
            <h3 className="text-xl font-bold text-glow-cyan mb-4">DEVICE_SELECT</h3>
            <div className="space-y-4">
              <div>
                <Label className="text-[var(--text-secondary)]">Target Device</Label>
                <Select disabled={settingsLocked} value={selectedDevice} onValueChange={setSelectedDevice}>
                  <SelectTrigger className="mt-1 bg-[var(--dark-gray)] border-[var(--grid-gray)]">
                    <SelectValue placeholder="Select device..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[var(--dark-gray)] border-[var(--matrix-green)]">
                    {devices.map((device) => (
                      <SelectItem key={device.name} value={device.name} className="text-[var(--text-primary)]">
                        {device.name} ({device.model})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-[var(--text-secondary)]">Device Model</Label>
                <Select disabled={settingsLocked} value={config.device_model} onValueChange={(v) => setConfig({...config, device_model: v})}>
                  <SelectTrigger className="mt-1 bg-[var(--dark-gray)] border-[var(--grid-gray)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[var(--dark-gray)] border-[var(--matrix-green)]">
                    <SelectItem value="gamma">Gamma (BM1370)</SelectItem>
                    <SelectItem value="supra">Supra (BM1368)</SelectItem>
                    <SelectItem value="ultra">Ultra (BM1366)</SelectItem>
                    <SelectItem value="hex">Hex (BM1366 x6)</SelectItem>
                    <SelectItem value="max">Max (BM1397)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* EASY/ADVANCED Mode Toggle */}
          <div className="matrix-card">
            <div className="flex items-center justify-between">
              <Label className="text-[var(--text-secondary)]">TUNING MODE</Label>
              <div className="flex bg-[var(--dark-gray)] border border-[var(--grid-gray)] rounded-lg p-1 shadow-[0_0_12px_rgba(0,0,0,0.35)]">
                <button
                  onClick={() => setTuningMode('auto')}
                  disabled={settingsLocked}
                  className={toggleButtonClass(tuningMode === 'auto')}
                >
                  EASY (PRESET)
                </button>
                <button
                  onClick={() => setTuningMode('manual')}
                  disabled={settingsLocked}
                  className={toggleButtonClass(tuningMode === 'manual', 'accent')}
                >
                  ADVANCED
                </button>
              </div>
            </div>
          </div>

          {/* EASY Mode: Preset Selection */}
          {tuningMode === 'auto' && (
            <div className="matrix-card space-y-4">
              <h3 className="text-xl font-bold text-glow-cyan">PRESET_PROFILE</h3>
              <div className="space-y-2">
                <Label className="text-[var(--text-secondary)]">Select Preset</Label>
                <div className="grid sm:grid-cols-3 gap-2">
                  {presetOptions.map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setPreset(opt.key)}
                      disabled={settingsLocked}
                      className={`${toggleButtonClass(preset === opt.key, 'accent')} text-left px-3 py-3 h-full`}
                    >
                      <div>{opt.label}</div>
                      <div className="text-[11px] text-[var(--text-muted)]">{opt.detail}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[var(--text-secondary)]">Optimization Goal</Label>
                <div className="grid sm:grid-cols-2 gap-2">
                  {goalOptions.map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setConfig((prev) => ({ ...prev, goal: opt.key }))}
                      disabled={settingsLocked}
                      className={`${toggleButtonClass(config.goal === opt.key)} py-3`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        {/* ADVANCED Mode: Full Configuration */}
          {tuningMode === 'manual' && (
            <>
              {/* Auto Mode */}
              <div className="matrix-card">
                    <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xl font-bold text-glow-cyan">AUTO_STEP</h3>
                <p className="text-[var(--text-muted)] text-sm mt-1">
                  Intelligent step adjustment (25→5 mV, 50→10 MHz)
                </p>
              </div>
              <Switch
                    checked={config.auto_mode}
                    disabled={settingsLocked}
                    onCheckedChange={(checked) => setConfig({...config, auto_mode: checked})}
                  />
                </div>
              </div>

          {/* Voltage/Frequency Settings */}
          <div className="matrix-card">
            <h3 className="text-xl font-bold text-glow-cyan mb-4">VOLTAGE_&_FREQUENCY</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-[var(--text-secondary)]">Voltage Start (mV)</Label>
                <Input
                  type="number"
                  value={config.voltage_start}
                  onChange={(e) => setConfig({...config, voltage_start: parseInt(e.target.value)})}
                  disabled={settingsLocked}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-[var(--text-secondary)]">Voltage Stop (mV)</Label>
                <Input
                  type="number"
                  value={config.voltage_stop}
                  onChange={(e) => setConfig({...config, voltage_stop: parseInt(e.target.value)})}
                  disabled={settingsLocked}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-[var(--text-secondary)]">
                  Voltage Step (mV) {config.auto_mode && <span className="text-[var(--success-green)] text-xs">(Auto: 25→5)</span>}
                </Label>
                <Input
                  type="number"
                  value={config.voltage_step}
                  onChange={(e) => setConfig({...config, voltage_step: parseInt(e.target.value)})}
                  disabled={settingsLocked || config.auto_mode}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-[var(--text-secondary)]">Frequency Start (MHz)</Label>
                <Input
                  type="number"
                  value={config.frequency_start}
                  onChange={(e) => setConfig({...config, frequency_start: parseInt(e.target.value)})}
                  disabled={settingsLocked}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-[var(--text-secondary)]">Frequency Stop (MHz)</Label>
                <Input
                  type="number"
                  value={config.frequency_stop}
                  onChange={(e) => setConfig({...config, frequency_stop: parseInt(e.target.value)})}
                  disabled={settingsLocked}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-[var(--text-secondary)]">
                  Frequency Step (MHz) {config.auto_mode && <span className="text-[var(--success-green)] text-xs">(Auto: 50→10)</span>}
                </Label>
                <Input
                  type="number"
                  value={config.frequency_step}
                  onChange={(e) => setConfig({...config, frequency_step: parseInt(e.target.value)})}
                  disabled={settingsLocked || config.auto_mode}
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          {/* Test Parameters */}
          <div className="matrix-card">
            <h3 className="text-xl font-bold text-glow-cyan mb-4">TEST_PARAMETERS</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-[var(--text-secondary)]">Test Duration (s)</Label>
                <Input
                  type="number"
                  value={config.benchmark_duration}
                  onChange={(e) => setConfig({...config, benchmark_duration: parseInt(e.target.value)})}
                  disabled={settingsLocked}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-[var(--text-secondary)]">Warmup Time (s)</Label>
                <Input
                  type="number"
                  value={config.warmup_time}
                  onChange={(e) => setConfig({...config, warmup_time: parseInt(e.target.value)})}
                  disabled={settingsLocked}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-[var(--text-secondary)]">Cooldown Time (s)</Label>
                <Input
                  type="number"
                  value={config.cooldown_time}
                  onChange={(e) => setConfig({...config, cooldown_time: parseInt(e.target.value)})}
                  disabled={settingsLocked}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-[var(--text-secondary)]">Cycles Per Test</Label>
                <Input
                  type="number"
                  value={config.cycles_per_test}
                  onChange={(e) => setConfig({...config, cycles_per_test: parseInt(e.target.value)})}
                  disabled={settingsLocked}
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          {/* Optimization Goal */}
          <div className="matrix-card">
            <h3 className="text-xl font-bold text-glow-cyan mb-4">OPTIMIZATION_GOAL</h3>
            <div className="space-y-4">
              <div>
                <Label className="text-[var(--text-secondary)]">Goal</Label>
                <Select disabled={settingsLocked} value={config.goal} onValueChange={(v) => setConfig({...config, goal: v})}>
                  <SelectTrigger className="mt-1 bg-[var(--dark-gray)] border-[var(--grid-gray)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[var(--dark-gray)] border-[var(--matrix-green)]">
                    <SelectItem value="quiet">Quiet</SelectItem>
                    <SelectItem value="efficient">Efficient</SelectItem>
                    <SelectItem value="balanced">Balanced</SelectItem>
                    <SelectItem value="max">Max</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {config.goal === 'quiet' && (
                <div>
                  <Label className="text-[var(--text-secondary)]">Fan Target (%)</Label>
                  <Input
                    type="number"
                    value={config.fan_target || 40}
                    onChange={(e) => setConfig({...config, fan_target: parseInt(e.target.value)})}
                    disabled={settingsLocked}
                    className="mt-1"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Safety Limits */}
          <div className="matrix-card">
            <h3 className="text-xl font-bold text-glow-cyan mb-4">SAFETY_LIMITS</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-[var(--text-secondary)]">Max Chip Temp (°C)</Label>
                <Input
                  type="number"
                  value={config.max_chip_temp}
                  onChange={(e) => setConfig({...config, max_chip_temp: parseInt(e.target.value)})}
                  disabled={settingsLocked}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-[var(--text-secondary)]">Max VR Temp (°C)</Label>
                <Input
                  type="number"
                  value={config.max_vr_temp}
                  onChange={(e) => setConfig({...config, max_vr_temp: parseInt(e.target.value)})}
                  disabled={settingsLocked}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-[var(--text-secondary)]">Max Power (W)</Label>
                <Input
                  type="number"
                  value={config.max_power}
                  onChange={(e) => setConfig({...config, max_power: parseInt(e.target.value)})}
                  disabled={settingsLocked}
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          {/* Auto-Recovery */}
          <div className="matrix-card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xl font-bold text-glow-cyan">🔄 AUTO_RECOVERY</h3>
                <p className="text-[var(--text-muted)] text-sm mt-1">
                  Automatically try alternatives instead of stopping on errors
                </p>
              </div>
              <Switch
                checked={config.auto_recovery}
                disabled={settingsLocked}
                onCheckedChange={(checked) => setConfig({...config, auto_recovery: checked})}
              />
            </div>

            {config.auto_recovery && (
              <div className="grid grid-cols-3 gap-4 mt-4">
                <div>
                  <Label className="text-[var(--text-secondary)]">Strategy</Label>
                  <Select
                    disabled={settingsLocked}
                    value={config.recovery_strategy}
                    onValueChange={(v) => setConfig({...config, recovery_strategy: v})}
                  >
                    <SelectTrigger className="mt-1 bg-[var(--dark-gray)] border-[var(--grid-gray)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[var(--dark-gray)] border-[var(--matrix-green)]">
                      <SelectItem value="conservative">Conservative</SelectItem>
                      <SelectItem value="aggressive">Aggressive</SelectItem>
                      <SelectItem value="balanced">Balanced</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[var(--text-secondary)]">Max Retries</Label>
                  <Input
                    type="number"
                    value={config.recovery_max_retries}
                    onChange={(e) => setConfig({...config, recovery_max_retries: parseInt(e.target.value)})}
                    disabled={settingsLocked}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[var(--text-secondary)]">Cooldown (s)</Label>
                  <Input
                    type="number"
                    value={config.recovery_cooldown}
                    onChange={(e) => setConfig({...config, recovery_cooldown: parseInt(e.target.value)})}
                    disabled={settingsLocked}
                    className="mt-1"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Advanced Options */}
          <div className="matrix-card">
            <h3 className="text-xl font-bold text-glow-cyan mb-4">ADVANCED_OPTIONS</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-[var(--text-secondary)]">Restart Between Tests</Label>
                <Switch
                  checked={config.restart_between_tests}
                  disabled={settingsLocked}
                  onCheckedChange={(checked) => setConfig({...config, restart_between_tests: checked})}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-[var(--text-secondary)]">Enable Plots</Label>
                <Switch
                  checked={config.enable_plots}
                  disabled={settingsLocked}
                  onCheckedChange={(checked) => setConfig({...config, enable_plots: checked})}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-[var(--text-secondary)]">Export CSV</Label>
                <Switch
                  checked={config.export_csv}
                  disabled={settingsLocked}
                  onCheckedChange={(checked) => setConfig({...config, export_csv: checked})}
                />
              </div>
            </div>
          </div>
            </>
          )}
        </div>

        {/* Right Panel - Control + Live Monitoring (70% width) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Control Panel */}
          <div className="hud-panel">
            <h3 className="text-xl font-bold text-glow-green mb-4">CONTROL_PANEL</h3>
            {!benchmarkStatus.running ? (
              <div className="space-y-3">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={handleStart}
                      disabled={!selectedDevice}
                      variant="default"
                      className="w-full text-lg py-6 shadow-[0_0_22px_hsla(var(--primary),0.3)]"
                    >
                      ▶ START_BENCHMARK
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    Runs a benchmark on the selected device (only one benchmark can run at a time).
                  </TooltipContent>
                </Tooltip>
                <div className="relative flex items-center justify-center">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-[var(--grid-gray)]"></div>
                  </div>
                  <span className="relative bg-[var(--bg-primary)] px-2 text-xs text-[var(--text-muted)]">OR</span>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={handleAutoTune}
                      disabled={!selectedDevice || autoTuneStarting}
                      variant="autoTune"
                      className="w-full text-lg py-6 shadow-[0_0_28px_rgba(168,85,247,0.4),0_0_36px_rgba(109,40,217,0.28)]"
                    >
                      🪄 AXEBENCH AUTOPILOT
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    Launches a full sweep, builds Quiet/Efficient/Balanced/Max profiles, optionally Nano tunes them, then applies Efficient.
                  </TooltipContent>
                </Tooltip>
              </div>
            ) : (
              <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={() => setStopConfirmOpen(true)}
                    variant="destructive"
                    className="w-full text-lg py-6 bg-[#ef4444] hover:bg-[#dc2626] border border-[#ef4444] text-white shadow-[0_0_26px_rgba(239,68,68,0.6)]"
                  >
                    ■ STOP_BENCHMARK
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  Signals the running benchmark to stop; current test may take a moment to exit.
                </TooltipContent>
              </Tooltip>
              <ConfirmDialog
                open={stopConfirmOpen}
                title="Stop running benchmark?"
                description="Stopping now will end the current run and discard any partially collected samples."
                tone="warning"
                confirmLabel="Stop benchmark"
                onConfirm={() => {
                  setStopConfirmOpen(false);
                  handleStop();
                }}
                onCancel={() => setStopConfirmOpen(false)}
              />
              </>
            )}
          </div>

          {/* Engine Panel */}
          <div className="matrix-card">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-lg font-bold text-glow-cyan">ENGINE_PANEL</h3>
                <p className="text-[var(--text-muted)] text-xs">
                  Visual snapshot of tuning load: thermal, power, stability, balance, and V/F position.
                </p>
              </div>
              <div className="text-xs text-[var(--text-secondary)]">
                {benchmarkStatus.running ? 'RUNNING' : 'IDLE'}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Progress & Sweep */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                  <span>SWEEP_PROGRESS</span>
                  <span className="text-[var(--text-primary)] font-semibold">
                    {testsCompleted} / {testsTotal || '?'} ({progressVal || 0}%)
                  </span>
                </div>
                <div className="w-full h-2 rounded bg-[var(--grid-gray)] overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#22c55e] via-[#eab308] to-[#ef4444] transition-all"
                    style={{ width: `${Math.min(100, Math.max(0, progressVal || 0))}%` }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-[var(--text-secondary)]">
                  <div>Current: {voltage} mV / {frequency} MHz</div>
                  <div>Goal: {config.goal?.toString().toUpperCase()}</div>
                </div>
              </div>

              {/* Stress trio */}
              <div className="space-y-2">
                <StressBar
                  label="THERMAL STRESS"
                  value={thermalStress}
                  color="linear-gradient(90deg, #22c55e, #eab308, #ef4444)"
                  tooltip={`Temp ${temp.toFixed(1)} / ${maxChip}°C (headroom ${tempHeadroom.toFixed(1)}°C). Fan ${fanSpeed ? `${fanSpeed.toFixed(0)}%` : 'n/a'}. Higher when near cap or climbing fast.`}
                  onClick={() =>
                    setEngineDetail({
                      open: true,
                      title: 'Thermal Stress',
                      lines: [
                        `Temp ${temp.toFixed(1)} / ${maxChip}°C (headroom ${tempHeadroom.toFixed(1)}°C)`,
                        `Temp ratio ${(tempRatio * 100).toFixed(1)}%`,
                        `Fan ${fanSpeed ? `${fanSpeed.toFixed(0)}%` : 'n/a'}`,
                        'Score = temp_ratio*70 + proximity/fan boosts',
                      ],
                    })
                  }
                />
                <StressBar
                  label="POWER STRESS"
                  value={powerStress}
                  color="linear-gradient(90deg, #22c55e, #eab308, #ef4444)"
                  tooltip={`Power ${power.toFixed(1)} / ${maxPower}W (headroom ${powerHeadroom.toFixed(1)}W), Voltage ${voltage} / ${maxVoltage}mV. Higher when near power/volt limits.`}
                  onClick={() =>
                    setEngineDetail({
                      open: true,
                      title: 'Power Stress',
                      lines: [
                        `Power ${power.toFixed(1)} / ${maxPower}W (headroom ${powerHeadroom.toFixed(1)}W)`,
                        `Voltage ${voltage} / ${maxVoltage}mV`,
                        `Ratios: power ${(powerRatio * 100).toFixed(1)}%, voltage ${(voltageRatio * 100).toFixed(1)}%`,
                        'Score = max(power, voltage) ratio * 80 (+limit boosts)',
                      ],
                    })
                  }
                />
                <StressBar
                  label="STABILITY STRESS"
                  value={stabilityStress}
                  color="linear-gradient(90deg, #22c55e, #eab308, #ef4444)"
                  tooltip={`ASIC error ${errorPct.toFixed(2)}% vs target ${targetError}% (margin ${errorMargin.toFixed(2)}%). Recovery and failed combos add stress.`}
                  onClick={() =>
                    setEngineDetail({
                      open: true,
                      title: 'Stability Stress',
                      lines: [
                        `ASIC error ${errorPct.toFixed(2)}% vs target ${targetError}% (margin ${errorMargin.toFixed(2)}%)`,
                        `Error ratio ${(errRatio * 100).toFixed(1)}%`,
                        `Recoveries ${status?.recovery_attempts || 0}, failed combos ${(status?.failed_combos || []).length}`,
                        'Score = err_ratio*80 + recovery/failed boosts',
                      ],
                    })
                  }
                />

                <div className="grid grid-cols-3 gap-2 text-[11px] text-[var(--text-secondary)]">
                  <div className="rounded border border-[var(--grid-gray)] bg-[var(--dark-gray)]/60 px-2 py-1">
                    Headroom: {tempHeadroom.toFixed(1)}°C
                  </div>
                  <div className="rounded border border-[var(--grid-gray)] bg-[var(--dark-gray)]/60 px-2 py-1">
                    Power: {powerHeadroom.toFixed(1)} W
                  </div>
                  <div className="rounded border border-[var(--grid-gray)] bg-[var(--dark-gray)]/60 px-2 py-1">
                    Error margin: {errorMargin.toFixed(2)}%
                  </div>
                </div>
              </div>

              {/* Balance & V/F sliders */}
              <div className="space-y-3">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className="space-y-1 cursor-help"
                      onClick={() =>
                        setEngineDetail({
                          open: true,
                          title: 'Balance',
                          lines: [
                            `Push (avg V/F/power ratios): ${push.toFixed(2)}`,
                            `Instability (error/recovery): ${instability.toFixed(2)}`,
                            'Right = more headroom, Left = instability/overdrive.',
                          ],
                        })
                      }
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setEngineDetail({
                            open: true,
                            title: 'Balance',
                            lines: [
                              `Push (avg V/F/power ratios): ${push.toFixed(2)}`,
                              `Instability (error/recovery): ${instability.toFixed(2)}`,
                              'Right = more headroom, Left = instability/overdrive.',
                            ],
                          });
                        }
                      }}
                    >
                      <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                        <span>BALANCE</span>
                        <span className="text-[var(--text-primary)] font-semibold">
                          {balanceDelta >= 0 ? 'PUSH' : 'RISK'}
                        </span>
                      </div>
                      <div className="w-full h-3 rounded bg-[var(--grid-gray)] relative overflow-hidden">
                        <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-[var(--text-muted)]" />
                        <div
                          className="absolute top-0 bottom-0 w-1.5 rounded bg-gradient-to-r from-[#ef4444] via-[#eab308] to-[#22c55e] transition-transform"
                          style={{ transform: `translateX(${balanceDelta * 50}%)` }}
                        />
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <div className="max-w-xs text-xs space-y-1">
                      <div>Push: avg(V/F/power ratios) = {push.toFixed(2)}</div>
                      <div>Instability: error/recovery weighting = {instability.toFixed(2)}</div>
                      <div>Right = headroom, Left = instability/overdrive.</div>
                    </div>
                  </TooltipContent>
                </Tooltip>

                <MiniSlider
                  label="VOLTAGE POSITION"
                  ratio={vNorm}
                  display={`${voltage} mV`}
                />
                <MiniSlider
                  label="FREQUENCY POSITION"
                  ratio={fNorm}
                  display={`${frequency} MHz`}
                />

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded border border-[var(--grid-gray)] bg-[var(--dark-gray)]/60 p-2">
                    <div className="text-[var(--text-secondary)]">EFFICIENCY</div>
                    <div className="text-[var(--success-green)] font-semibold">{efficiencyJth > 0 ? `${efficiencyJth.toFixed(2)} J/TH` : '—'}</div>
                  </div>
                  <div className="rounded border border-[var(--grid-gray)] bg-[var(--dark-gray)]/60 p-2">
                    <div className="text-[var(--text-secondary)]">HASHRATE</div>
                    <div className="text-[var(--neon-cyan)] font-semibold">{hashrateGh ? `${hashrateGh.toFixed(1)} GH/s` : '—'}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Live Monitoring Panel */}
          {(() => {
            const deviceName = benchmarkStatus.device || selectedDevice;
            console.log('[Benchmark] LiveMonitoring check:', { 
              running: benchmarkStatus.running, 
              contextDevice: benchmarkStatus.device,
              selectedDevice, 
              deviceName,
              willShow: benchmarkStatus.running && deviceName 
            });
            return benchmarkStatus.running && deviceName ? (
              <LiveMonitoringPanel deviceName={deviceName} />
            ) : null;
          })()}

          {/* Live Status */}
          {benchmarkStatus.running && status && (
            <>
              <div className="matrix-card">
                <h3 className="text-lg font-bold text-glow-cyan mb-3">PROGRESS</h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--text-secondary)]">Tests</span>
                    <span className="text-[var(--text-primary)]">
                      {status.tests_completed || 0} / {status.tests_total || 0}
                    </span>
                  </div>
                  <div className="w-full bg-[var(--grid-gray)] h-2 rounded">
                    <div
                      className="bg-[var(--matrix-green)] h-2 rounded transition-all"
                      style={{ width: `${status.progress || 0}%` }}
                    />
                  </div>
                  <div className="text-center text-[var(--matrix-green)] font-bold">
                    {status.progress || 0}%
                  </div>
                </div>
              </div>

              {graphsLoading && (
                <div className="matrix-card flex items-center justify-center text-[var(--text-secondary)]">
                  Loading live graphs...
                </div>
              )}

              {status.live_data && !graphsLoading && (
                <div className="matrix-card">
                  <h3 className="text-lg font-bold text-glow-cyan mb-3">LIVE_DATA</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">Voltage</span>
                      <span className="text-[var(--text-primary)]">{status.live_data.voltage} mV</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">Frequency</span>
                      <span className="text-[var(--text-primary)]">{status.live_data.frequency} MHz</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">Hashrate</span>
                      <span className="text-[var(--success-green)]">{status.live_data.hashrate?.toFixed(1)} GH/s</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">Temperature</span>
                      <span className="text-[var(--warning-amber)]">{status.live_data.temp?.toFixed(1)}°C</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">Power</span>
                      <span className="text-[var(--neon-cyan)]">{status.live_data.power?.toFixed(1)} W</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Benchmark Console */}
      <div className="mt-6">
        <BenchmarkConsole />
      </div>

      <FireworksOverlay active={autoTuneDialogOpen && showCelebration} />
      <BitcoinCelebrationOverlay
        active={autoTuneDialogOpen && showCelebration}
        onDismiss={() => setShowCelebration(false)}
        onFinished={() => setShowCelebration(false)}
      />

      <Dialog
        open={autoTuneDialogOpen}
        onOpenChange={(open) => {
          if (!open && !autoTuneStarting) {
            setAutoTuneDialogOpen(false);
            setShowCelebration(false);
          }
        }}
      >
        <DialogContent className="w-[min(95vw,1200px)] max-h-[85vh] overflow-y-auto bg-[var(--bg-primary)] border-[rgba(168,85,247,0.5)] shadow-[0_0_36px_rgba(168,85,247,0.35)]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-glow-green">AUTOPILOT</DialogTitle>
            <DialogDescription className="text-[var(--text-secondary)] text-sm space-y-1">
              <p>
                Autopilot runs a full sweep, captures session data, and builds four profiles: QUIET, EFFICIENT, BALANCED, MAX. Optional Nano tune refines them.
              </p>
              <p className="text-[var(--text-muted)]">Run time depends on ranges; keep airflow clear and within PSU/thermal limits.</p>
            </DialogDescription>
          </DialogHeader>

          <div className="grid lg:grid-cols-2 gap-4 lg:gap-6 mt-2">
            <div className="space-y-3 text-sm text-[var(--text-secondary)]">
              <div className="rounded-lg border border-[var(--grid-gray)] bg-[var(--dark-gray)]/70 p-4">
                <div className="font-bold text-[var(--text-primary)] mb-2">Workflow</div>
                <ol className="list-decimal pl-5 space-y-1">
                  <li>Full sweep (Easy uses optimized defaults).</li>
                  <li>Analyze data; generate QUIET / EFFICIENT / BALANCED / MAX.</li>
                  <li>Optional Nano tune each profile; then apply EFFICIENT.</li>
                </ol>
              </div>

              <div className="space-y-2">
                <label className="flex items-start gap-2 text-sm text-[var(--text-primary)]">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={autoTuneAck}
                    disabled={settingsLocked}
                    onChange={(e) => setAutoTuneAck(e.target.checked)}
                  />
                  <span>I understand overclocking can damage hardware.</span>
                </label>
                <label className="flex items-start gap-2 text-sm text-[var(--text-primary)]">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={autoTuneDontRemind}
                    disabled={settingsLocked}
                    onChange={(e) => setAutoTuneDontRemind(e.target.checked)}
                  />
                  <span>Do not remind me again.</span>
                </label>
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-lg border border-[var(--grid-gray)] bg-[var(--dark-gray)]/70 p-4 space-y-3">
                <div className="font-bold text-[var(--text-primary)] text-base">Nano tune after profiles?</div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant={autoTuneNano ? 'autoTune' : 'secondary'}
                    className="w-full whitespace-normal text-sm py-2"
                    disabled={settingsLocked}
                    onClick={() => setAutoTuneNano(true)}
                  >
                    NANO
                  </Button>
                  <Button
                    size="sm"
                    variant={!autoTuneNano ? 'accent' : 'secondary'}
                    className="w-full whitespace-normal text-sm py-2"
                    disabled={settingsLocked}
                    onClick={() => setAutoTuneNano(false)}
                  >
                    SKIP
                  </Button>
                </div>
                <p className="text-xs text-[var(--text-secondary)]">Turn off Nano to stop after profiles are created.</p>
              </div>

              <div className="rounded-lg border border-[var(--grid-gray)] bg-[var(--dark-gray)]/60 p-3">
                <div className="font-bold text-[var(--text-primary)] mb-2">Profiles created</div>
                <div className="grid grid-cols-2 gap-2 text-xs text-[var(--text-primary)]">
                  <div className="rounded border border-[var(--grid-gray)] bg-gradient-to-br from-amber-500/25 to-amber-700/15 p-2 space-y-1">
                    <div className="font-bold text-amber-200">QUIET</div>
                    <div className="text-[var(--text-secondary)]">Low noise priority.</div>
                    {config.goal === 'quiet' && (
                      <div className="space-y-1">
                        <div className="text-[10px] text-[var(--text-secondary)]">Quiet fan target (%)</div>
                        <input
                          type="range"
                          min={30}
                          max={100}
                          step={5}
                          value={(config.fan_target ?? 60).toString()}
                          onChange={(e) => setConfig({ ...config, fan_target: parseInt(e.target.value) })}
                          disabled={settingsLocked}
                          className="w-full accent-[hsl(var(--accent))]"
                        />
                        <div className="text-[10px] text-[var(--text-primary)] text-right">{config.fan_target ?? 60}%</div>
                      </div>
                    )}
                  </div>
                  <div className="rounded border border-[var(--grid-gray)] bg-gradient-to-br from-emerald-500/25 to-emerald-700/15 p-2">
                    <div className="font-bold text-emerald-200">EFFICIENT</div>
                    <div className="text-[var(--text-secondary)]">Best J/TH target.</div>
                  </div>
                  <div className="rounded border border-[var(--grid-gray)] bg-gradient-to-br from-sky-500/20 to-sky-700/15 p-2">
                    <div className="font-bold text-sky-200">BALANCED</div>
                    <div className="text-[var(--text-secondary)]">Middle ground.</div>
                  </div>
                  <div className="rounded border border-[var(--grid-gray)] bg-gradient-to-br from-fuchsia-500/25 to-fuchsia-700/15 p-2">
                    <div className="font-bold text-fuchsia-200">MAX</div>
                    <div className="text-[var(--text-secondary)]">Hashrate focus.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between gap-3 mt-4">
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => { setAutoTuneDialogOpen(false); setShowCelebration(false); }}>
                Cancel (I got cold feet)
              </Button>
              <Button
                variant="autoTune"
                disabled={settingsLocked || !autoTuneAck || autoTuneStarting}
                onClick={() => startAutoTune({ runNano: autoTuneNano })}
                className="min-w-[140px] text-lg"
              >
                {autoTuneStarting ? 'Starting...' : 'ENGAGE 🚀'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Engine detail modal */}
      <Dialog
        open={engineDetail.open}
        onOpenChange={(open) => setEngineDetail((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{engineDetail.title || 'Detail'}</DialogTitle>
            <DialogDescription>How this indicator is calculated.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm text-[var(--text-primary)]">
            {engineDetail.lines.map((line, idx) => (
              <div key={idx} className="leading-relaxed">
                • {line}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEngineDetail((prev) => ({ ...prev, open: false }))}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </>
  );
}





