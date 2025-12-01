import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface LiveStats {
  voltage: number;
  frequency: number;
  hashrate: number;
  power: number;
  chipTemp: number;
  vrTemp: number;
}

interface LiveMonitoringPanelProps {
  deviceName: string;
}

export default function LiveMonitoringPanel({ deviceName }: LiveMonitoringPanelProps) {
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [history, setHistory] = useState<LiveStats[]>([]);

  useEffect(() => {
    if (!deviceName) return;

    const fetchStats = async () => {
      try {
        const status = await api.devices.status(deviceName);
        const newStats: LiveStats = {
          voltage: status.voltage || 0,
          frequency: status.frequency || 0,
          hashrate: status.hashrate || 0,
          power: status.power || 0,
          chipTemp: status.temp || 0,
          vrTemp: status.vrTemp || 0,
        };
        
        setStats(newStats);
        setHistory(prev => [...prev.slice(-29), newStats]); // Keep last 30 readings
      } catch (error) {
        console.error('Failed to fetch live stats:', error);
      }
    };

    // Initial fetch
    fetchStats();

    // Poll every 2 seconds
    const interval = setInterval(fetchStats, 2000);
    return () => clearInterval(interval);
  }, [deviceName]);

  if (!stats) {
    return (
      <div className="hud-panel">
        <h3 className="text-xl font-bold text-glow-cyan mb-4">LIVE_MONITORING</h3>
        <div className="text-center text-[var(--text-muted)] py-8">
          Loading device stats...
        </div>
      </div>
    );
  }

  const StatCard = ({ label, value, unit, color = 'var(--matrix-green)' }: { label: string; value: number; unit: string; color?: string }) => (
    <div className="matrix-card p-4">
      <div className="text-xs text-[var(--text-muted)] mb-1">{label}</div>
      <div className="text-2xl font-bold" style={{ color }}>
        {value.toFixed(2)} <span className="text-sm">{unit}</span>
      </div>
    </div>
  );

  const MiniChart = ({ data, label, color }: { data: number[]; label: string; color: string }) => {
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;

    return (
      <div className="matrix-card p-3">
        <div className="text-xs text-[var(--text-muted)] mb-2">{label}</div>
        <div className="h-16 flex items-end gap-0.5">
          {data.map((value, i) => {
            const height = ((value - min) / range) * 100;
            return (
              <div
                key={i}
                className="flex-1 transition-all duration-300"
                style={{
                  height: `${height}%`,
                  backgroundColor: color,
                  opacity: 0.3 + (i / data.length) * 0.7,
                  boxShadow: `0 0 4px ${color}`,
                }}
              />
            );
          })}
        </div>
        <div className="text-xs text-[var(--text-muted)] mt-1 flex justify-between">
          <span>{min.toFixed(1)}</span>
          <span>{max.toFixed(1)}</span>
        </div>
      </div>
    );
  };

  // Temperature color based on value
  const getTempColor = (temp: number) => {
    if (temp > 70) return 'var(--error-red)';
    if (temp > 60) return 'var(--warning-yellow)';
    return 'var(--matrix-green)';
  };

  return (
    <div className="hud-panel">
      <h3 className="text-xl font-bold text-glow-cyan mb-4">
        LIVE_MONITORING <span className="text-sm text-[var(--text-muted)]">({deviceName})</span>
      </h3>

      {/* Current Values Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <StatCard label="VOLTAGE" value={stats.voltage} unit="mV" />
        <StatCard label="FREQUENCY" value={stats.frequency} unit="MHz" />
        <StatCard label="HASHRATE" value={stats.hashrate} unit="GH/s" color="var(--neon-cyan)" />
        <StatCard label="POWER" value={stats.power} unit="W" color="var(--warning-yellow)" />
        <StatCard label="CHIP_TEMP" value={stats.chipTemp} unit="°C" color={getTempColor(stats.chipTemp)} />
        <StatCard label="VR_TEMP" value={stats.vrTemp} unit="°C" color={getTempColor(stats.vrTemp)} />
      </div>

      {/* Mini Charts */}
      {history.length > 5 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <MiniChart 
            data={history.map(h => h.hashrate)} 
            label="HASHRATE_TREND" 
            color="var(--neon-cyan)" 
          />
          <MiniChart 
            data={history.map(h => h.power)} 
            label="POWER_TREND" 
            color="var(--warning-yellow)" 
          />
          <MiniChart 
            data={history.map(h => h.chipTemp)} 
            label="CHIP_TEMP_TREND" 
            color="var(--matrix-green)" 
          />
          <MiniChart 
            data={history.map(h => h.vrTemp)} 
            label="VR_TEMP_TREND" 
            color="var(--matrix-green)" 
          />
        </div>
      )}

      <div className="text-xs text-[var(--text-muted)] text-center mt-3">
        Updates every 2 seconds • Showing last {history.length} readings
      </div>
    </div>
  );
}
