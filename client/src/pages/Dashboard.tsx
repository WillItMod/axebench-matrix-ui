import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { api, formatHashrate, formatPower, formatTemp, MODEL_COLORS, MODEL_NAMES } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import AddDeviceModal from '@/components/AddDeviceModal';
import { logger } from '@/lib/logger';

interface Device {
  name: string;
  ip: string;
  model: string;
  online: boolean;
  status?: {
    hashrate: number;
    temp: number;
    power: number;
    voltage: number;
    frequency: number;
    fan_speed: number;
    difficulty?: number;
  };
}

export default function Dashboard() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  // Load devices with status
  const loadDevices = async () => {
    logger.info('Dashboard', 'Starting loadDevices');
    try {
      setRefreshing(true);
      logger.debug('Dashboard', 'Fetching device list from API');
      const deviceList = await api.devices.list();
      logger.info('Dashboard', 'Device list received', { count: deviceList?.length, deviceList });
      
      // Fetch status for each device
      logger.debug('Dashboard', 'Fetching status for each device');
      const devicesWithStatus = await Promise.all(
        deviceList.map(async (device: any) => {
          logger.debug('Dashboard', `Fetching status for device: ${device.name}`);
          try {
            const status = await api.devices.status(device.name);
            logger.info('Dashboard', `Status received for ${device.name}`, { status });
            return {
              ...device,
              online: true, // If we got status, device is online
              status: {
                hashrate: status.hashrate || 0,
                temp: status.temperature || 0,
                power: status.power || 0,
                voltage: status.voltage || 0,
                frequency: status.frequency || 0,
                fan_speed: status.fan_speed || 0,
                difficulty: status.difficulty || 0,
              },
            };
          } catch (error) {
            // Device offline or error fetching status
            logger.warn('Dashboard', `Failed to get status for ${device.name}`, { error });
            return { ...device, online: false, status: null };
          }
        })
      );
      
      logger.info('Dashboard', 'All device statuses fetched, updating state', { 
        count: devicesWithStatus.length, 
        devicesWithStatus 
      });
      setDevices(devicesWithStatus);
      logger.info('Dashboard', 'State updated with devices');
    } catch (error) {
      logger.error('Dashboard', 'Failed to load devices', { error });
      toast.error('Failed to load devices');
      console.error(error);
    } finally {
      logger.debug('Dashboard', 'loadDevices complete, setting loading=false');
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    logger.info('Dashboard', 'Component mounted, starting initial load');
    loadDevices();
    // Auto-refresh every 5 seconds
    const interval = setInterval(loadDevices, 5000);
    return () => {
      logger.info('Dashboard', 'Component unmounting, clearing interval');
      clearInterval(interval);
    };
  }, []);

  // Calculate fleet stats
  const onlineDevices = devices.filter(d => d.online && d.status);
  const totalHashrate = onlineDevices.reduce((sum, d) => sum + (d.status?.hashrate || 0), 0);
  const totalPower = onlineDevices.reduce((sum, d) => sum + (d.status?.power || 0), 0);
  
  // Calculate fleet efficiency (J/TH = W / (GH/s / 1000))
  const fleetEfficiency = totalHashrate > 0 ? (totalPower / (totalHashrate / 1000)) : 0;
  
  // Find device with highest difficulty
  const highestDiffDevice = onlineDevices.reduce((max, d) => {
    const diff = d.status?.difficulty || 0;
    return diff > (max.status?.difficulty || 0) ? d : max;
  }, onlineDevices[0] || null);
  
  const fleetStats = {
    total: devices.length,
    online: onlineDevices.length,
    totalHashrate,
    totalPower,
    fleetEfficiency,
    highestDiffDevice,
  };

  // Debug logging
  logger.debug('Dashboard', 'Render cycle', { 
    devicesCount: devices.length, 
    devices, 
    loading, 
    refreshing,
    devicesIsArray: Array.isArray(devices),
    devicesType: typeof devices
  });
  console.log('Dashboard render - devices:', devices, 'length:', devices.length, 'loading:', loading);
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-[var(--matrix-green)] text-2xl text-glow-green flicker">
          INITIALIZING_FLEET_MATRIX...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Fleet Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="hud-panel">
          <div className="data-label">DEVICES ONLINE</div>
          <div className="data-value text-[var(--success-green)]">
            {fleetStats.online}/{fleetStats.total}
          </div>
        </div>
        <div className="hud-panel">
          <div className="data-label">FLEET HASHRATE</div>
          <div className="data-value">{formatHashrate(fleetStats.totalHashrate)}</div>
        </div>
        <div className="hud-panel">
          <div className="data-label">TOTAL POWER</div>
          <div className="data-value text-[var(--warning-amber)]">{formatPower(fleetStats.totalPower)}</div>
        </div>
        <div className="hud-panel">
          <div className="data-label">FLEET EFFICIENCY</div>
          <div className="data-value text-[var(--neon-cyan)]">
            {fleetStats.fleetEfficiency > 0 ? `${fleetStats.fleetEfficiency.toFixed(2)} J/TH` : 'N/A'}
          </div>
        </div>
      </div>

      {/* Highest Difficulty */}
      {fleetStats.highestDiffDevice && (
        <div className="hud-panel">
          <div className="flex items-center justify-between">
            <div>
              <div className="data-label">HIGHEST DIFFICULTY</div>
              <div className="text-[var(--text-secondary)] text-sm mt-1">
                {fleetStats.highestDiffDevice.name}
              </div>
            </div>
            <div className="data-value text-[var(--matrix-green)]">
              {(fleetStats.highestDiffDevice.status?.difficulty || 0).toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* Actions Bar */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-glow-green">DEVICE_GRID</h2>
        <div className="flex gap-2">
          <Button
            onClick={loadDevices}
            disabled={refreshing}
            className="btn-cyan"
          >
            {refreshing ? '⟳ SYNCING...' : '🔄 REFRESH'}
          </Button>
          <Button onClick={() => setShowAddModal(true)} className="btn-matrix">
            ➕ ADD_DEVICE
          </Button>
        </div>
      </div>

      {/* Device Grid */}
      {devices.length === 0 ? (
        <div className="matrix-card text-center py-12">
          <div className="text-[var(--text-muted)] text-lg mb-4">
            NO_DEVICES_DETECTED
          </div>
          <Button onClick={() => setShowAddModal(true)} className="btn-matrix">
            ➕ ADD_YOUR_FIRST_DEVICE
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {devices.map((device) => (
            <DeviceCard key={device.name} device={device} onRefresh={loadDevices} />
          ))}
        </div>
      )}

      {/* Add Device Modal */}
      <AddDeviceModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={loadDevices}
      />
    </div>
  );
}

function DeviceCard({ device, onRefresh }: { device: Device; onRefresh: () => void }) {
  const [, setLocation] = useLocation();
  const modelColor = MODEL_COLORS[device.model?.toLowerCase()] || '#666';
  const modelName = MODEL_NAMES[device.model?.toLowerCase()] || device.model?.toUpperCase() || 'UNKNOWN';

  const handleBenchmark = () => {
    // Navigate to benchmark page with device pre-selected
    setLocation('/benchmark?device=' + encodeURIComponent(device.name));
  };

  const handleConfig = () => {
    // Show config toast for now (can be expanded to modal later)
    toast.info(`Config panel for ${device.name} - Coming soon!`);
  };

  return (
    <div className={`matrix-card ${!device.online ? 'opacity-60' : ''}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-xl font-bold text-[var(--text-primary)] text-glow-green">
            {device.name}
          </div>
          <div className="text-xs text-[var(--text-muted)]">{device.ip}</div>
        </div>
        <div
          className="px-3 py-1 rounded text-xs font-bold"
          style={{ backgroundColor: modelColor }}
        >
          {modelName}
        </div>
      </div>

      {/* Status */}
      <div className="flex items-center gap-2 mb-3">
        <div
          className={`w-2 h-2 rounded-full ${
            device.online ? 'bg-[var(--success-green)] pulse-green' : 'bg-[var(--error-red)]'
          }`}
        />
        <span className={device.online ? 'status-online' : 'status-error'}>
          {device.online ? 'ONLINE' : 'OFFLINE'}
        </span>
      </div>

      {/* Stats */}
      {device.online && device.status && (
        <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
          <div>
            <div className="text-[var(--text-secondary)]">Hashrate</div>
            <div className="font-bold text-[var(--matrix-green)]">
              {formatHashrate(device.status.hashrate)}
            </div>
          </div>
          <div>
            <div className="text-[var(--text-secondary)]">Temp</div>
            <div className="font-bold text-[var(--warning-amber)]">
              {formatTemp(device.status.temp)}
            </div>
          </div>
          <div>
            <div className="text-[var(--text-secondary)]">Power</div>
            <div className="font-bold text-[var(--neon-cyan)]">
              {formatPower(device.status.power)}
            </div>
          </div>
          <div>
            <div className="text-[var(--text-secondary)]">Fan</div>
            <div className="font-bold">{device.status.fan_speed}%</div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <Button 
          size="sm" 
          className="flex-1 btn-matrix text-xs"
          onClick={handleBenchmark}
          disabled={!device.online}
        >
          🔬 BENCHMARK
        </Button>
        <Button 
          size="sm" 
          className="flex-1 btn-cyan text-xs"
          onClick={handleConfig}
          disabled={!device.online}
        >
          ⚙️ CONFIG
        </Button>
      </div>
    </div>
  );
}
