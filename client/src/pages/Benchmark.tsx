import { useEffect, useState } from 'react';
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

export default function Benchmark() {
  const { status: benchmarkStatus, refreshStatus } = useBenchmark();
  const [devices, setDevices] = useState<any[]>([]);
  const [selectedDevice, setSelectedDevice] = usePersistentState<string>('benchmark-selected-device', '');
  
  // Read device from URL params (for pre-selection from Dashboard)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const deviceParam = params.get('device');
    if (deviceParam) {
      setSelectedDevice(decodeURIComponent(deviceParam));
    }
  }, []);
  const [status, setStatus] = useState<any>(null);
  const [tuningMode, setTuningMode] = useState<'auto' | 'manual'>('auto'); // EASY vs ADVANCED
  const [preset, setPreset] = useState('standard'); // For EASY mode
  
  // Configuration state
  const [config, setConfig] = useState({
    // Device
    device_model: 'gamma',
    
    // Auto Mode
    auto_mode: true,
    
    // Voltage settings
    voltage_start: 1100,
    voltage_stop: 1300,
    voltage_step: 20,
    
    // Frequency settings
    frequency_start: 400,
    frequency_stop: 600,
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

      await api.benchmark.start(benchmarkConfig);
      await refreshStatus(); // Update global benchmark state
      toast.success('Benchmark started');
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

  const handleAutoTune = async () => {
    if (!selectedDevice) {
      toast.error('Select a device first');
      return;
    }

    const confirmed = window.confirm(
      'Start Full Auto Tune?\n\n' +
      'This will:\n' +
      '1. Run precision benchmark\n' +
      '2. Generate 4 profiles (Quiet, Efficient, Optimal, Max)\n' +
      '3. Fine-tune each profile\n' +
      '4. Apply Efficient profile\n\n' +
      'This may take 20-30 minutes.'
    );

    if (!confirmed) return;

    try {
      // Start precision benchmark with auto_mode enabled
      const autoTuneConfig = {
        device: selectedDevice,
        ...config,
        auto_mode: true,
        goal: 'balanced',
        voltage_start: 1100,
        voltage_stop: 1350,
        voltage_step: 25,
        frequency_start: 400,
        frequency_stop: 650,
        frequency_step: 25,
        benchmark_duration: 60,
        strategy: 'adaptive_progression',
      };

      await api.benchmark.start(autoTuneConfig);
      await refreshStatus(); // Update global benchmark state
      toast.success('Auto Tune started - Phase 1: Precision Benchmark');
    } catch (error: any) {
      toast.error(error.message || 'Failed to start Auto Tune');
    }
  };

  return (
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
              <div className="flex bg-[var(--dark-gray)] rounded p-1">
                <button
                  onClick={() => setTuningMode('auto')}
                  className={`px-4 py-2 text-sm font-bold rounded transition-colors ${
                    tuningMode === 'auto'
                      ? 'bg-[var(--matrix-green)] text-black'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  EASY (PRESET)
                </button>
                <button
                  onClick={() => setTuningMode('manual')}
                  className={`px-4 py-2 text-sm font-bold rounded transition-colors ${
                    tuningMode === 'manual'
                      ? 'bg-[var(--neon-cyan)] text-black'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  ADVANCED
                </button>
              </div>
            </div>
          </div>

          {/* EASY Mode: Preset Selection */}
          {tuningMode === 'auto' && (
            <div className="matrix-card space-y-4">
              <h3 className="text-xl font-bold text-glow-cyan">⚡ PRESET_PROFILE</h3>
              <div>
                <Label className="text-[var(--text-secondary)]">Select Preset</Label>
                <Select value={preset} onValueChange={setPreset}>
                  <SelectTrigger className="mt-1 bg-[var(--dark-gray)] border-[var(--grid-gray)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[var(--dark-gray)] border-[var(--matrix-green)]">
                    <SelectItem value="quick">⚡ Quick Scan (Fast)</SelectItem>
                    <SelectItem value="standard">⚖️ Standard (Balanced)</SelectItem>
                    <SelectItem value="deep">🔬 Deep Dive (Thorough)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[var(--text-secondary)]">Optimization Goal</Label>
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
                  Intelligent step adjustment (25→5mV, 50→10MHz)
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
                <Button
                  onClick={handleStart}
                  disabled={!selectedDevice}
                  className="w-full btn-matrix text-lg py-6"
                >
                  ▶ START_BENCHMARK
                </Button>
                <div className="relative flex items-center justify-center">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-[var(--grid-gray)]"></div>
                  </div>
                  <span className="relative bg-[var(--bg-primary)] px-2 text-xs text-[var(--text-muted)]">OR</span>
                </div>
                <Button
                  onClick={handleAutoTune}
                  disabled={!selectedDevice}
                  className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white text-lg py-6"
                >
                  🪄 AUTO_TUNE (FULL)
                </Button>
              </div>
            ) : (
              <Button
                onClick={handleStop}
                className="w-full bg-[var(--error-red)] hover:bg-[var(--error-red)]/80 text-white text-lg py-6"
              >
                ■ STOP_BENCHMARK
              </Button>
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
    </div>
  );
}
