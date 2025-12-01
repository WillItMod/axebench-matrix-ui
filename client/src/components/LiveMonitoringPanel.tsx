import { useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
} from 'chart.js';
import { api } from '@/lib/api';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface LiveStats {
  voltage: number;
  frequency: number;
  hashrate: number;
  power: number;
  chipTemp: number;
  vrTemp: number;
  asicErrors: number;
  efficiency: number; // J/TH
  timestamp: string;
}

interface LiveMonitoringPanelProps {
  deviceName: string;
  colorPalette?: string[];
}

const MAX_HISTORY = 60; // Keep last 60 readings

const DEFAULT_COLORS = ['#ff0000', '#0000ff', '#ff8800', '#00ff00', '#ffff00', '#0088ff'];

export default function LiveMonitoringPanel({ deviceName, colorPalette = DEFAULT_COLORS }: LiveMonitoringPanelProps) {
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [history, setHistory] = useState<LiveStats[]>([]);

  useEffect(() => {
    if (!deviceName) return;

    const fetchStats = async () => {
      try {
        const status = await api.devices.status(deviceName);
        const hashrate = status.hashrate || 0;
        const power = status.power || 0;
        const efficiency = hashrate > 0 ? (power / hashrate) * 1000 : 0; // J/TH = (W / GH/s) * 1000
        
        const newStats: LiveStats = {
          voltage: status.voltage || 0,
          frequency: status.frequency || 0,
          hashrate,
          power,
          chipTemp: status.temp || status.chipTemp || 0,
          vrTemp: status.vrTemp || status.vr_temp || 0,
          asicErrors: status.asic_errors || status.errors || 0,
          efficiency,
          timestamp: new Date().toLocaleTimeString(),
        };
        
        setStats(newStats);
        setHistory(prev => {
          const updated = [...prev, newStats];
          return updated.slice(-MAX_HISTORY); // Keep last MAX_HISTORY readings
        });
      } catch (error) {
        console.error('Failed to fetch live stats:', error);
      }
    };

    // Initial fetch
    void fetchStats();

    // Poll every 2 seconds
    const interval = setInterval(() => void fetchStats(), 2000);
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

  // Temperature color based on value
  const getTempColor = (temp: number) => {
    if (temp > 70) return 'var(--error-red)';
    if (temp > 60) return 'var(--warning-yellow)';
    return 'var(--matrix-green)';
  };

  // Common chart options
  const commonOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        borderColor: 'rgba(0, 255, 65, 0.5)',
        borderWidth: 1,
        titleColor: '#00ff41',
        bodyColor: '#fff',
      },
    },
    scales: {
      x: {
        grid: {
          color: 'rgba(0, 255, 65, 0.1)',
        },
        ticks: {
          color: 'rgba(0, 255, 65, 0.6)',
          maxTicksLimit: 10,
          font: {
            family: "'Courier New', monospace",
            size: 10,
          },
        },
      },
      y: {
        grid: {
          color: 'rgba(0, 255, 65, 0.1)',
        },
        ticks: {
          color: 'rgba(0, 255, 65, 0.6)',
          font: {
            family: "'Courier New', monospace",
            size: 10,
          },
        },
      },
    },
  };

  const timestamps = history.map(h => h.timestamp);

  // Hashrate chart
  const hashrateData = {
    labels: timestamps,
    datasets: [
      {
        label: 'Hashrate (GH/s)',
        data: history.map(h => h.hashrate),
        borderColor: '#00d4ff',
        backgroundColor: 'rgba(0, 212, 255, 0.1)',
        borderWidth: 2,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: '#00d4ff',
      },
    ],
  };

  // Temperature chart (both chip and VR)
  const tempData = {
    labels: timestamps,
    datasets: [
      {
        label: 'Chip Temp (°C)',
        data: history.map(h => h.chipTemp),
        borderColor: '#ffaa00',
        backgroundColor: 'rgba(255, 170, 0, 0.1)',
        borderWidth: 2,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: '#ffaa00',
      },
      {
        label: 'VR Temp (°C)',
        data: history.map(h => h.vrTemp),
        borderColor: '#ff6600',
        backgroundColor: 'rgba(255, 102, 0, 0.1)',
        borderWidth: 2,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: '#ff6600',
      },
    ],
  };

  // Voltage chart
  const voltageData = {
    labels: timestamps,
    datasets: [
      {
        label: 'Voltage (mV)',
        data: history.map(h => h.voltage),
        borderColor: '#00ff41',
        backgroundColor: 'rgba(0, 255, 65, 0.1)',
        borderWidth: 2,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: '#00ff41',
      },
    ],
  };

  // Frequency chart
  const frequencyData = {
    labels: timestamps,
    datasets: [
      {
        label: 'Frequency (MHz)',
        data: history.map(h => h.frequency),
        borderColor: '#ff00ff',
        backgroundColor: 'rgba(255, 0, 255, 0.1)',
        borderWidth: 2,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: '#ff00ff',
      },
    ],
  };

  // ASIC Errors chart
  const asicErrorsData = {
    labels: timestamps,
    datasets: [
      {
        label: 'ASIC Errors',
        data: history.map(h => h.asicErrors),
        borderColor: '#ff0000',
        backgroundColor: 'rgba(255, 0, 0, 0.1)',
        borderWidth: 2,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: '#ff0000',
      },
    ],
  };

  // Efficiency chart (J/TH)
  const efficiencyData = {
    labels: timestamps,
    datasets: [
      {
        label: 'Efficiency (J/TH)',
        data: history.map(h => h.efficiency),
        borderColor: '#00d4ff',
        backgroundColor: 'rgba(0, 212, 255, 0.1)',
        borderWidth: 2,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: '#00d4ff',
      },
    ],
  };

  // Power chart
  const powerData = {
    labels: timestamps,
    datasets: [
      {
        label: 'Power (W)',
        data: history.map(h => h.power),
        borderColor: '#ffff00',
        backgroundColor: 'rgba(255, 255, 0, 0.1)',
        borderWidth: 2,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: '#ffff00',
      },
    ],
  };

  return (
    <div className="hud-panel">
      <h3 className="text-xl font-bold text-glow-cyan mb-4">
        LIVE_MONITORING <span className="text-sm text-[var(--text-muted)]">({deviceName})</span>
      </h3>

      {/* Current Values Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <StatCard label="VOLTAGE" value={stats.voltage} unit="mV" />
        <StatCard label="FREQUENCY" value={stats.frequency} unit="MHz" color="var(--neon-magenta)" />
        <StatCard label="HASHRATE" value={stats.hashrate} unit="GH/s" color="var(--neon-cyan)" />
        <StatCard label="POWER" value={stats.power} unit="W" color="var(--warning-yellow)" />
        <StatCard label="CHIP_TEMP" value={stats.chipTemp} unit="°C" color={getTempColor(stats.chipTemp)} />
        <StatCard label="VR_TEMP" value={stats.vrTemp} unit="°C" color={getTempColor(stats.vrTemp)} />
      </div>

      {/* Real-time Charts */}
      {history.length > 5 && (
        <div className="space-y-4">
          {/* Graph 1: ASIC Errors + Hashrate */}
          <div className="matrix-card p-4">
            <h4 className="text-sm font-bold text-[var(--neon-cyan)] mb-3">ASIC_ERRORS & HASHRATE</h4>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="h-48">
                <div className="text-xs text-[var(--error-red)] mb-2">ASIC Errors</div>
                <Line data={asicErrorsData} options={commonOptions} />
              </div>
              <div className="h-48">
                <div className="text-xs text-[var(--neon-cyan)] mb-2">Hashrate (GH/s)</div>
                <Line data={hashrateData} options={commonOptions} />
              </div>
            </div>
          </div>

          {/* Graph 2: VR Temp + ASIC Temp */}
          <div className="matrix-card p-4">
            <h4 className="text-sm font-bold text-[var(--warning-amber)] mb-3">VR_TEMP & ASIC_TEMP</h4>
            <div className="h-48">
              <Line data={tempData} options={{
                ...commonOptions,
                plugins: {
                  ...commonOptions.plugins,
                  legend: {
                    display: true,
                    position: 'top' as const,
                    labels: {
                      color: 'rgba(0, 255, 65, 0.8)',
                      font: {
                        family: "'Courier New', monospace",
                        size: 10,
                      },
                      boxWidth: 12,
                      boxHeight: 2,
                    },
                  },
                },
              }} />
            </div>
          </div>

          {/* Graph 3: Power + Efficiency (J/TH) */}
          <div className="matrix-card p-4">
            <h4 className="text-sm font-bold text-[var(--warning-yellow)] mb-3">POWER & EFFICIENCY</h4>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="h-48">
                <div className="text-xs text-[var(--warning-yellow)] mb-2">Power (W)</div>
                <Line data={powerData} options={commonOptions} />
              </div>
              <div className="h-48">
                <div className="text-xs text-[var(--neon-cyan)] mb-2">Efficiency (J/TH)</div>
                <Line data={efficiencyData} options={commonOptions} />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="text-xs text-[var(--text-muted)] text-center mt-4">
        Updates every 2 seconds • Showing last {history.length} readings
      </div>
    </div>
  );
}
