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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export default function Benchmark() {
  const { status: benchmarkStatus, refreshStatus } = useBenchmark();
  const { applySafetyCaps } = useSettings();
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
    if (!selectedDevice) {
      toast.error('Select a device first');
      return;
    }

    try {
      const benchmarkConfig = {
        device: selectedDevice,
        ...config,
        strategy: 'adaptive_progression',
      };

      const { config: safeConfig, changed, capped } = applySafetyCaps(benchmarkConfig);
      await api.benchmark.start(safeConfig);
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

  const handleAutoTune = () => {
    if (!selectedDevice) {
      toast.error('Select a device first');
      return;
    }
    // Always show the dialog; preferences only prefill choices.
    setShowCelebration(true);
    setAutoTuneDialogOpen(true);
  };

  const startAutoTune = async ({ runNano, silent }: { runNano?: boolean; silent?: boolean } = {}) => {
    if (!selectedDevice || autoTuneStarting) return;
    const nanoPass = runNano ?? autoTuneNano;
    try {
      setAutoTuneStarting(true);
      setAutoTuneAck(true);
      setAutoTuneNano(nanoPass);
      if (autoTuneDontRemind) {
        setAutoTuneDontRemind(true);
      }

      const autoTuneConfig = {
        device: selectedDevice,
        ...config,
        auto_mode: true,
        goal: 'balanced',
        voltage_start: 1100,
        voltage_stop: 1200,
        voltage_step: 25,
        frequency_start: 400,
        frequency_stop: 700,
        frequency_step: 25,
        benchmark_duration: 60,
        strategy: 'adaptive_progression',
        mode: 'auto_tune',
        nano_after_profiles: nanoPass,
        run_nano: nanoPass,
        profile_set: ['AUTO_QUIET', 'AUTO_EFFICIENT', 'AUTO_BALANCED', 'AUTO_MAX'],
        banner_hint: nanoPass ? 'Full sweep + Nano finish' : 'Full sweep',
      };

      const { config: safeConfig, changed, capped } = applySafetyCaps(autoTuneConfig);
      localStorage.setItem('axebench:autoTune_stage_hint', 'Full sweep running');
      localStorage.setItem('axebench:autoTune_nano', nanoPass ? 'true' : 'false');
      await api.benchmark.start(safeConfig);
      await refreshStatus(); // Update global benchmark state
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Sidebar - Device Selection & Gauges */}
        <div className="lg:col-span-1 space-y-6">
          {/* Device Selection */}
          <div className="matrix-card">
            <h3 className="text-xl font-bold text-glow-cyan mb-4">DEVICE_SELECT</h3>
            <div className="space-y-4">
              <div>
                <Label className="text-[var(--text-secondary)]">Target Device</Label>
                <Select value={selectedDevice} onValueChange={setSelectedDevice}>
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
                <Select value={config.device_model} onValueChange={(v) => setConfig({...config, device_model: v})}>
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
                  className={toggleButtonClass(tuningMode === 'auto')}
                >
                  EASY (PRESET)
                </button>
                <button
                  onClick={() => setTuningMode('manual')}
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
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-[var(--text-secondary)]">Voltage Stop (mV)</Label>
                <Input
                  type="number"
                  value={config.voltage_stop}
                  onChange={(e) => setConfig({...config, voltage_stop: parseInt(e.target.value)})}
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
                  disabled={config.auto_mode}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-[var(--text-secondary)]">Frequency Start (MHz)</Label>
                <Input
                  type="number"
                  value={config.frequency_start}
                  onChange={(e) => setConfig({...config, frequency_start: parseInt(e.target.value)})}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-[var(--text-secondary)]">Frequency Stop (MHz)</Label>
                <Input
                  type="number"
                  value={config.frequency_stop}
                  onChange={(e) => setConfig({...config, frequency_stop: parseInt(e.target.value)})}
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
                  disabled={config.auto_mode}
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
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-[var(--text-secondary)]">Warmup Time (s)</Label>
                <Input
                  type="number"
                  value={config.warmup_time}
                  onChange={(e) => setConfig({...config, warmup_time: parseInt(e.target.value)})}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-[var(--text-secondary)]">Cooldown Time (s)</Label>
                <Input
                  type="number"
                  value={config.cooldown_time}
                  onChange={(e) => setConfig({...config, cooldown_time: parseInt(e.target.value)})}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-[var(--text-secondary)]">Cycles Per Test</Label>
                <Input
                  type="number"
                  value={config.cycles_per_test}
                  onChange={(e) => setConfig({...config, cycles_per_test: parseInt(e.target.value)})}
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
                <Select value={config.goal} onValueChange={(v) => setConfig({...config, goal: v})}>
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
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-[var(--text-secondary)]">Max VR Temp (°C)</Label>
                <Input
                  type="number"
                  value={config.max_vr_temp}
                  onChange={(e) => setConfig({...config, max_vr_temp: parseInt(e.target.value)})}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-[var(--text-secondary)]">Max Power (W)</Label>
                <Input
                  type="number"
                  value={config.max_power}
                  onChange={(e) => setConfig({...config, max_power: parseInt(e.target.value)})}
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
                onCheckedChange={(checked) => setConfig({...config, auto_recovery: checked})}
              />
            </div>

            {config.auto_recovery && (
              <div className="grid grid-cols-3 gap-4 mt-4">
                <div>
                  <Label className="text-[var(--text-secondary)]">Strategy</Label>
                  <Select value={config.recovery_strategy} onValueChange={(v) => setConfig({...config, recovery_strategy: v})}>
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
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[var(--text-secondary)]">Cooldown (s)</Label>
                  <Input
                    type="number"
                    value={config.recovery_cooldown}
                    onChange={(e) => setConfig({...config, recovery_cooldown: parseInt(e.target.value)})}
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
                  onCheckedChange={(checked) => setConfig({...config, restart_between_tests: checked})}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-[var(--text-secondary)]">Enable Plots</Label>
                <Switch
                  checked={config.enable_plots}
                  onCheckedChange={(checked) => setConfig({...config, enable_plots: checked})}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-[var(--text-secondary)]">Export CSV</Label>
                <Switch
                  checked={config.export_csv}
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
                      🪄 FULL_SWEEP_OPTIMIZER
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    Launches a full sweep, builds Quiet/Efficient/Balanced/Max profiles, optionally Nano tunes them, then applies Efficient.
                  </TooltipContent>
                </Tooltip>
              </div>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleStop}
                    variant="destructive"
                    className="w-full text-lg py-6 shadow-[0_0_22px_rgba(239,68,68,0.45)]"
                  >
                    ■ STOP_BENCHMARK
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  Signals the running benchmark to stop; current test may take a moment to exit.
                </TooltipContent>
              </Tooltip>
            )}
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

          <div className="grid lg:grid-cols-2 gap-4 mt-2">
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
                    onChange={(e) => setAutoTuneAck(e.target.checked)}
                  />
                  <span>I understand overclocking can damage hardware.</span>
                </label>
                <label className="flex items-start gap-2 text-sm text-[var(--text-primary)]">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={autoTuneDontRemind}
                    onChange={(e) => setAutoTuneDontRemind(e.target.checked)}
                  />
                  <span>Do not remind me again.</span>
                </label>
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-lg border border-[var(--grid-gray)] bg-[var(--dark-gray)]/70 p-3 space-y-2">
                <div className="font-bold text-[var(--text-primary)]">Nano tune after profiles?</div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant={autoTuneNano ? 'autoTune' : 'secondary'}
                    className="w-full"
                    onClick={() => setAutoTuneNano(true)}
                  >
                    Run Nano tune
                  </Button>
                  <Button
                    size="sm"
                    variant={!autoTuneNano ? 'accent' : 'secondary'}
                    className="w-full"
                    onClick={() => setAutoTuneNano(false)}
                  >
                    Skip Nano
                  </Button>
                </div>
                <p className="text-xs text-[var(--text-secondary)]">Turn off Nano to stop after profiles are created.</p>
              </div>

              <div className="rounded-lg border border-[var(--grid-gray)] bg-[var(--dark-gray)]/60 p-3">
                <div className="font-bold text-[var(--text-primary)] mb-2">Profiles created</div>
                <div className="grid grid-cols-2 gap-2 text-xs text-[var(--text-primary)]">
                  <div className="rounded border border-[var(--grid-gray)] bg-gradient-to-br from-amber-500/25 to-amber-700/15 p-2">
                    <div className="font-bold text-amber-200">QUIET</div>
                    <div className="text-[var(--text-secondary)]">Low noise priority.</div>
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
            <div className="text-xs text-[var(--text-secondary)]">
              Stage flow: Full sweep → Analyze → Generate profiles → {autoTuneNano ? 'Nano tune all' : 'Apply Efficient'} → Done.
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => { setAutoTuneDialogOpen(false); setShowCelebration(false); }}>
                Cancel (I got cold feet)
              </Button>
              <Button
                variant="autoTune"
                disabled={!autoTuneAck || autoTuneStarting}
                onClick={() => startAutoTune({ runNano: autoTuneNano })}
                className="min-w-[140px] text-lg"
              >
                {autoTuneStarting ? 'Starting...' : 'ENGAGE 🚀'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </>
  );
}


