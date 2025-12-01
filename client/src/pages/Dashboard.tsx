import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { api, formatHashrate, formatPower, formatTemp, MODEL_COLORS, MODEL_NAMES } from '@/lib/api';
import { formatDifficulty } from '@/lib/formatDifficulty';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import AddDeviceModal from '@/components/AddDeviceModal';
import ConfigModal from '@/components/ConfigModal';
import PsuModal from '@/components/PsuModal';
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
  
  console.log('[Dashboard] Render - devices:', devices.length, 'loading:', loading);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [showPsuModal, setShowPsuModal] = useState(false);
  const [psus, setPsus] = useState<any[]>([]);

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
            
            // Fetch device info for bestSessionDiff and bestDiff
            let deviceInfo = null;
            try {
              deviceInfo = await api.devices.info(device.name);
              logger.info('Dashboard', `Device info received for ${device.name}`, { deviceInfo });
            } catch (infoError) {
              logger.warn('Dashboard', `Failed to fetch device info for ${device.name}`, { infoError });
            }
            
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
                difficulty: status.difficulty || deviceInfo?.poolDifficulty || 0,
                bestDiff: deviceInfo?.bestDiff || 0,
                bestSessionDiff: deviceInfo?.bestSessionDiff || 0,
                efficiency: status.power > 0 ? (status.power / (status.hashrate / 1000)) : 0,
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

  const handleConfig = (device: Device) => {
    setSelectedDevice(device);
    setShowConfigModal(true);
  };
  
  // Load PSUs and check for warnings
  const loadPsus = async () => {
    try {
      const psuList = await api.psus.list();
      setPsus(psuList);
      
      // Calculate total fleet power and PSU warnings
      const totalPower = devices.reduce((sum, d) => sum + (d.status?.power || 0), 0);
      
      // Check each PSU for load warnings
      psuList.forEach((psu: any) => {
        const psuLoad = psu.type === 'shared' 
          ? devices.filter(d => psu.devices?.includes(d.name)).reduce((sum, d) => sum + (d.status?.power || 0), 0)
          : totalPower / devices.length; // Average for independent
        
        const loadPercent = (psuLoad / psu.wattage) * 100;
        
        if (loadPercent >= 80) {
          toast.error(`PSU "${psu.name}" at ${loadPercent.toFixed(0)}% load (DANGER)`, { duration: 10000 });
        } else if (loadPercent >= 70) {
          toast.warning(`PSU "${psu.name}" at ${loadPercent.toFixed(0)}% load (WARNING)`, { duration: 5000 });
        }
      });
    } catch (error) {
      logger.warn('Dashboard', 'Failed to load PSUs', { error });
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
  
  // Load PSUs when devices change
  useEffect(() => {
    if (devices.length > 0) {
      loadPsus();
    }
  }, [devices]);

  // Calculate fleet stats
  const onlineDevices = devices.filter(d => d.online && d.status);
  const totalHashrate = onlineDevices.reduce((sum, d) => sum + (d.status?.hashrate || 0), 0);
  const totalPower = onlineDevices.reduce((sum, d) => sum + (d.status?.power || 0), 0);
  
  // Calculate fleet efficiency (J/TH = W / (GH/s / 1000))
  const fleetEfficiency = totalHashrate > 0 ? (totalPower / (totalHashrate / 1000)) : 0;
  
  // Parse difficulty string (e.g., "4.29G" -> 4290000000)
  const parseDifficulty = (diffStr: string | number): number => {
    if (typeof diffStr === 'number') return diffStr;
    if (!diffStr || diffStr === '0') return 0;
    
    const str = String(diffStr).toUpperCase();
    const multipliers: Record<string, number> = {
      'K': 1000,
      'M': 1000000,
      'G': 1000000000,
      'T': 1000000000000,
    };
    
    const match = str.match(/^([0-9.]+)([KMGT])?$/);
    if (!match) return 0;
    
    const value = parseFloat(match[1]);
    const suffix = match[2];
    return suffix ? value * multipliers[suffix] : value;
  };
  
  // Find device with highest difficulty
  const highestDiffDevice = onlineDevices.reduce((max, d) => {
    const diff = parseDifficulty(d.status?.difficulty || 0);
    const maxDiff = max ? parseDifficulty(max.status?.difficulty || 0) : 0;
    console.log('[Dashboard] Difficulty check:', { device: d.name, raw: d.status?.difficulty, parsed: diff });
    return diff > maxDiff ? d : max;
  }, onlineDevices[0] || null);
  
  console.log('[Dashboard] Highest difficulty device:', { 
    name: highestDiffDevice?.name, 
    difficulty: highestDiffDevice?.status?.difficulty 
  });
  
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
              <div className="data-label">BEST DIFFICULTY</div>
              <div className="text-[var(--text-secondary)] text-sm mt-1">
                {fleetStats.highestDiffDevice.name}
              </div>
            </div>
            <div className="data-value text-[var(--matrix-green)]">
              {formatDifficulty(fleetStats.highestDiffDevice.status?.difficulty || 0)}
            </div>
          </div>
        </div>
      )}

      {/* Best Since Boot */}
      {fleetStats.highestDiffDevice && (
        <div className="hud-panel">
          <div className="flex items-center justify-between">
            <div>
              <div className="data-label">BEST SINCE BOOT</div>
              <div className="text-[var(--text-secondary)] text-sm mt-1">
                {fleetStats.highestDiffDevice.name}
              </div>
            </div>
            <div className="data-value text-[var(--neon-cyan)]">
              {formatDifficulty((fleetStats.highestDiffDevice.status as any)?.bestSessionDiff || 0)}
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
          <Button onClick={() => setShowPsuModal(true)} className="bg-yellow-600 hover:bg-yellow-700 text-white">
            ⚡ PSU_CONFIG
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
            <DeviceCard key={device.name} device={device} onRefresh={loadDevices} onConfig={handleConfig} />
          ))}
        </div>
      )}

      {/* Add Device Modal */}
      <AddDeviceModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={loadDevices}
      />
      
      {selectedDevice && (
        <ConfigModal
          open={showConfigModal}
          onClose={() => setShowConfigModal(false)}
          device={selectedDevice}
          onSuccess={loadDevices}
        />
      )}
      
      {/* PSU Modal */}
      <PsuModal
        open={showPsuModal}
        onClose={() => setShowPsuModal(false)}
        onSave={loadPsus}
      />
    </div>
  );
}

function DeviceCard({ device, onRefresh, onConfig }: { device: Device; onRefresh: () => void; onConfig: (device: Device) => void }) {
  const [, setLocation] = useLocation();
  const modelColor = MODEL_COLORS[device.model?.toLowerCase()] || '#666';
  const modelName = MODEL_NAMES[device.model?.toLowerCase()] || device.model?.toUpperCase() || 'UNKNOWN';

  const handleBenchmark = () => {
    // Navigate to benchmark page with device pre-selected
    setLocation('/benchmark?device=' + encodeURIComponent(device.name));
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
        <>
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
            <div>
              <div className="text-[var(--text-secondary)]">RV Temp</div>
              <div className="font-bold text-[var(--warning-amber)]">
                {formatTemp((device.status as any).vrTemp || 0)}
              </div>
            </div>
            <div>
              <div className="text-[var(--text-secondary)]">Efficiency</div>
              <div className="font-bold text-[var(--neon-cyan)]">
                {((device.status as any).efficiency || 0).toFixed(2)} J/TH
              </div>
            </div>
            <div>
              <div className="text-[var(--text-secondary)]">Best Diff</div>
              <div className="font-bold text-[var(--matrix-green)]">
                {formatDifficulty((device.status as any).bestDiff || 0)}
              </div>
            </div>
            <div>
              <div className="text-[var(--text-secondary)]">Best Since Boot</div>
              <div className="font-bold text-[var(--neon-cyan)]">
                {formatDifficulty((device.status as any).bestSessionDiff || 0)}
              </div>
            </div>
          </div>
          
          {/* Profile and Pool Info */}
          <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
            <div>
              <div className="text-[var(--text-secondary)]">Profile</div>
              <div className="font-bold text-[var(--text-primary)] truncate">
                {(device.status as any).profile || 'N/A'}
              </div>
            </div>
            <div>
              <div className="text-[var(--text-secondary)]">Pool</div>
              <div className="font-bold text-[var(--text-primary)] truncate">
                {(device.status as any).poolName || 'N/A'}
              </div>
            </div>
          </div>
        </>
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
          onClick={() => onConfig(device)}
          disabled={!device.online}
        >
          ⚙️ CONFIG
        </Button>
      </div>
    </div>
  );
}
