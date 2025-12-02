import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import LiveMonitoringPanel from '@/components/LiveMonitoringPanel';
import { RefreshCw } from 'lucide-react';

const DEVICE_COLOR_PALETTES = [
  ['#ff0000', '#0000ff', '#ff8800', '#00ff00', '#ffff00', '#0088ff'], // Device 1: RED BLUE ORANGE GREEN YELLOW LIGHTBLUE
  ['#ff00ff', '#00ffff', '#ff0088', '#88ff00', '#8800ff', '#ffaa00'], // Device 2: MAGENTA CYAN PINK LIME PURPLE ORANGE
  ['#ff6666', '#6666ff', '#ffaa66', '#66ff66', '#ffff66', '#66aaff'], // Device 3: Lighter variants
  ['#aa0000', '#0000aa', '#aa5500', '#00aa00', '#aaaa00', '#0055aa'], // Device 4: Darker variants
];

export default function Monitoring() {
  const [devices, setDevices] = useState<any[]>([]);
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDevices();
  }, []);

  const loadDevices = async () => {
    try {
      setLoading(true);
      const deviceList = await api.devices.list();
      setDevices(deviceList || []);
      
      // Auto-select first device if none selected
      if (deviceList && deviceList.length > 0 && selectedDevices.length === 0) {
        setSelectedDevices([deviceList[0].name]);
      }
    } catch (error) {
      console.error('Failed to load devices:', error);
      setDevices([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleDevice = (deviceName: string) => {
    setSelectedDevices(prev => 
      prev.includes(deviceName)
        ? prev.filter(d => d !== deviceName)
        : [...prev, deviceName]
    );
  };

  const selectAll = () => {
    setSelectedDevices(devices.map(d => d.name));
  };

  const clearAll = () => {
    setSelectedDevices([]);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-matrix-green text-xl animate-pulse">LOADING_MONITORING_MATRIX...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="hud-panel">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-glow-green mb-2">📊 LIVE_MONITORING</h1>
            <p className="text-[var(--text-secondary)]">
              Real-time fleet monitoring with multi-device support
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={loadDevices} variant="outline" className="gap-2">
              <RefreshCw className="w-4 h-4" />
              REFRESH
            </Button>
          </div>
        </div>
      </div>

      {/* Device Selection */}
      <div className="hud-panel">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-glow-cyan">SELECT_DEVICES</h2>
          <div className="flex gap-2">
            <Button onClick={selectAll} size="sm" className="btn-matrix text-xs">
              SELECT_ALL
            </Button>
            <Button onClick={clearAll} size="sm" variant="outline" className="text-xs">
              CLEAR
            </Button>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {devices.map((device, idx) => {
            const colorPalette = DEVICE_COLOR_PALETTES[idx % DEVICE_COLOR_PALETTES.length];
            return (
              <Button
                key={device.name}
                onClick={() => toggleDevice(device.name)}
                variant={selectedDevices.includes(device.name) ? 'default' : 'outline'}
                className={selectedDevices.includes(device.name)
                  ? 'bg-[var(--neon-cyan)] text-black hover:bg-[var(--neon-cyan)]/80 border-[var(--neon-cyan)] flex items-center gap-2'
                  : 'border-[var(--grid-gray)] text-[var(--text-secondary)] hover:border-[var(--neon-cyan)] hover:text-[var(--neon-cyan)] flex items-center gap-2'
                }
              >
                {device.name}
                <span className="ml-1 text-xs opacity-60">({device.model})</span>
              </Button>
            );
          })}
        </div>

        {selectedDevices.length === 0 && (
          <div className="text-center text-[var(--text-muted)] py-8">
            Select at least one device to start monitoring
          </div>
        )}
      </div>

      {/* Monitoring Panels */}
      {selectedDevices.length > 0 && (
        <div className="space-y-6">
          {selectedDevices.map((deviceName) => {
            const deviceIdx = devices.findIndex(d => d.name === deviceName);
            const colorPalette = DEVICE_COLOR_PALETTES[deviceIdx % DEVICE_COLOR_PALETTES.length];
            return (
              <LiveMonitoringPanel 
                key={deviceName} 
                deviceName={deviceName}
                colorPalette={colorPalette}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
