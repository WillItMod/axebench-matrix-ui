import { useEffect, useRef, useState } from 'react';
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

interface LiveMonitorGraphsProps {
  device: string;
  refreshInterval?: number; // milliseconds
}

interface DataPoint {
  timestamp: string;
  hashrate: number;
  temp: number;
  voltage: number;
  frequency: number;
}

const MAX_DATA_POINTS = 60; // Keep last 60 data points

export default function LiveMonitorGraphs({ device, refreshInterval = 5000 }: LiveMonitorGraphsProps) {
  const [dataHistory, setDataHistory] = useState<DataPoint[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Fetch initial data
    void fetchData();

    // Set up polling
    intervalRef.current = setInterval(() => void fetchData(), refreshInterval) as any;

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [device, refreshInterval]);

  const fetchData = async () => {
    try {
      const response = await fetch(`/api/devices/${device}`);
      const data = await response.json();
      
      const newPoint: DataPoint = {
        timestamp: new Date().toLocaleTimeString(),
        hashrate: data.hashrate || 0,
        temp: data.temp || 0,
        voltage: data.voltage || 0,
        frequency: data.frequency || 0,
      };

      setDataHistory(prev => {
        const updated = [...prev, newPoint];
        // Keep only last MAX_DATA_POINTS
        return updated.slice(-MAX_DATA_POINTS);
      });
    } catch (error) {
      console.error('Failed to fetch device data:', error);
    }
  };

  const timestamps = dataHistory.map(d => d.timestamp);

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
    },
    scales: {
      x: {
        grid: {
          color: 'rgba(0, 255, 65, 0.1)',
        },
        ticks: {
          color: 'rgba(0, 255, 65, 0.6)',
          maxTicksLimit: 10,
        },
      },
      y: {
        grid: {
          color: 'rgba(0, 255, 65, 0.1)',
        },
        ticks: {
          color: 'rgba(0, 255, 65, 0.6)',
        },
      },
    },
  };

  // Hashrate chart
  const hashrateData = {
    labels: timestamps,
    datasets: [
      {
        label: 'Hashrate (GH/s)',
        data: dataHistory.map(d => d.hashrate),
        borderColor: '#00ff41',
        backgroundColor: 'rgba(0, 255, 65, 0.1)',
        borderWidth: 2,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
      },
    ],
  };

  // Temperature chart
  const tempData = {
    labels: timestamps,
    datasets: [
      {
        label: 'Temperature (°C)',
        data: dataHistory.map(d => d.temp),
        borderColor: '#ffaa00',
        backgroundColor: 'rgba(255, 170, 0, 0.1)',
        borderWidth: 2,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
      },
    ],
  };

  // Voltage chart
  const voltageData = {
    labels: timestamps,
    datasets: [
      {
        label: 'Voltage (mV)',
        data: dataHistory.map(d => d.voltage),
        borderColor: '#00d4ff',
        backgroundColor: 'rgba(0, 212, 255, 0.1)',
        borderWidth: 2,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
      },
    ],
  };

  // Frequency chart
  const frequencyData = {
    labels: timestamps,
    datasets: [
      {
        label: 'Frequency (MHz)',
        data: dataHistory.map(d => d.frequency),
        borderColor: '#ff00ff',
        backgroundColor: 'rgba(255, 0, 255, 0.1)',
        borderWidth: 2,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
      },
    ],
  };

  if (dataHistory.length === 0) {
    return (
      <div className="text-center py-12 text-[var(--text-muted)]">
        Loading data...
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Hashrate Graph */}
      <div className="matrix-card">
        <h3 className="text-lg font-bold text-[var(--matrix-green)] mb-4">HASHRATE</h3>
        <div className="h-64">
          <Line data={hashrateData} options={commonOptions} />
        </div>
      </div>

      {/* Temperature Graph */}
      <div className="matrix-card">
        <h3 className="text-lg font-bold text-[var(--warning-amber)] mb-4">TEMPERATURE</h3>
        <div className="h-64">
          <Line data={tempData} options={commonOptions} />
        </div>
      </div>

      {/* Voltage Graph */}
      <div className="matrix-card">
        <h3 className="text-lg font-bold text-[var(--neon-cyan)] mb-4">VOLTAGE</h3>
        <div className="h-64">
          <Line data={voltageData} options={commonOptions} />
        </div>
      </div>

      {/* Frequency Graph */}
      <div className="matrix-card">
        <h3 className="text-lg font-bold text-[var(--neon-magenta)] mb-4">FREQUENCY</h3>
        <div className="h-64">
          <Line data={frequencyData} options={commonOptions} />
        </div>
      </div>
    </div>
  );
}
