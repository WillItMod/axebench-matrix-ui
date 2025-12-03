import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { api, formatHashrate, formatPower, formatTemp, MODEL_COLORS, MODEL_NAMES } from '@/lib/api';
import { formatDifficulty } from '@/lib/formatDifficulty';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import AddDeviceModal from '@/components/AddDeviceModal';
import ConfigModal from '@/components/ConfigModal';
import PsuModal from '@/components/PsuModal';
import { logger } from '@/lib/logger';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface Device {
  name: string;
  ip: string;
  model: string;
  online: boolean;
  psu_id?: string;
  status?: {
    hashrate: number;
    temp: number;
    power: number;
    voltage: number;
    frequency: number;
    fan_speed: number;
    difficulty?: number;
    bestDiff?: number;
    bestSessionDiff?: number;
  };
}

type WarningLevel = 'warning' | 'danger';

interface WarningItem {
  id: string;
  title: string;
  message: string;
  level: WarningLevel;
}

const normalizeNumber = (value: any, fallback: number | null = null) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const getDevicePsuId = (device: any) => {
  const fromNested = device?.psu?.id ?? device?.psu?.name ?? null;
  const shared = device?.psu?.shared_psu_id ?? device?.psu?.sharedPsuId ?? null;
  const statusPsu = device?.status?.psu_id ?? device?.status?.psuId ?? null;
  return (
    device?.psu_id ??
    device?.psuId ??
    device?.psu ??
    device?.psuName ??
    shared ??
    statusPsu ??
    fromNested ??
    null
  );
};

const deviceMatchesPsu = (device: any, psu: any) => {
  const devicePsu = getDevicePsuId(device);
  if (devicePsu == null) return false;
  const psuId = psu?.id != null ? String(psu.id) : null;
  const psuName = psu?.name ? String(psu.name).toLowerCase() : null;
  const deviceStr = String(devicePsu);
  return (psuId && deviceStr === psuId) || (psuName && deviceStr.toLowerCase() === psuName);
};

// Determine devices assigned to a PSU using multiple hints (id, name, backend-provided lists)
const resolveAssignedDevices = (psu: any, devices: Device[]) => {
  // Direct match by id/name on device
  let matches = devices.filter((d) => deviceMatchesPsu(d, psu));

  // Fallback: backend may provide device names under various keys
  const candidateLists = [
    psu?.devices,
    psu?.assigned_devices,
    psu?.assignedDevices,
    psu?.device_names,
    psu?.deviceNames,
  ].filter(Boolean);

  if (candidateLists.length > 0) {
    const names = new Set(
      candidateLists.flatMap((list: any) =>
        Array.isArray(list) ? list.map((n) => String(n).toLowerCase()) : []
      )
    );
    const listMatches = devices.filter((d) => names.has(String(d.name).toLowerCase()));
    // Merge unique devices
    const byName = new Set(matches.map((d) => d.name));
    listMatches.forEach((d) => {
      if (!byName.has(d.name)) {
        matches.push(d);
        byName.add(d.name);
      }
    });
  }

  return matches;
};

const getPsuMetrics = (psu: any) => {
  const voltage = normalizeNumber(psu?.voltage, null);
  const amperage = normalizeNumber(psu?.amperage, null);
  const wattage =
    normalizeNumber(psu?.wattage, null) ??
    (voltage && amperage ? Number((voltage * amperage).toFixed(1)) : null) ??
    0;
  return {
    voltage: voltage ?? undefined,
    amperage: amperage ?? undefined,
    wattage,
  };
};

export default function Dashboard() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  
  console.log('[Dashboard] Render - devices:', devices.length, 'loading:', loading);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [showPsuModal, setShowPsuModal] = useState(false);
  const [editingPsu, setEditingPsu] = useState<{id: string; name: string; wattage: number; voltage?: number; amperage?: number} | null>(null);
  const [psus, setPsus] = useState<any[]>([]);
  const [showScanModal, setShowScanModal] = useState(false);
  const [scanSubnet, setScanSubnet] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState<any[]>([]);
  const warningKeysRef = useRef<Set<string>>(new Set());
  const dismissedWarningsRef = useRef<Set<string>>(new Set());
  const [warningQueue, setWarningQueue] = useState<WarningItem[]>([]);
  const [activeWarning, setActiveWarning] = useState<WarningItem | null>(null);
  const [dontRemind, setDontRemind] = useState(false);
  const [confirmPsu, setConfirmPsu] = useState<{ id: string; name: string } | null>(null);

  // Load dismissed warning ids from localStorage once
  useEffect(() => {
    try {
      const stored = localStorage.getItem('axebench:dismissedWarnings');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          dismissedWarningsRef.current = new Set(parsed);
        }
      }
    } catch (error) {
      console.warn('Failed to load dismissed warnings', error);
    }
  }, []);

  const persistDismissed = () => {
    localStorage.setItem('axebench:dismissedWarnings', JSON.stringify(Array.from(dismissedWarningsRef.current)));
  };

  const enqueueWarning = (warning: WarningItem) => {
    if (dismissedWarningsRef.current.has(warning.id) || warningKeysRef.current.has(warning.id)) return;
    warningKeysRef.current.add(warning.id);
    setWarningQueue((prev) => [...prev, warning]);
  };

  // Drive a single active warning modal
  useEffect(() => {
    if (!activeWarning && warningQueue.length > 0) {
      const [next, ...rest] = warningQueue;
      setActiveWarning(next);
      setWarningQueue(rest);
      setDontRemind(false);
    }
  }, [warningQueue, activeWarning]);

  const dismissActiveWarning = () => {
    if (activeWarning && dontRemind) {
      dismissedWarningsRef.current.add(activeWarning.id);
      persistDismissed();
    }
    setActiveWarning(null);
  };

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
            const normalizedPsu = getDevicePsuId(device);
            
                    // Fetch device system info for bestSessionDiff and bestDiff
            let deviceInfo = null;
            try {
              deviceInfo = await api.devices.info(device.name);
              logger.info('Dashboard', `Device info received for ${device.name}`, { deviceInfo });
            } catch (infoError) {
              logger.warn('Dashboard', `Failed to fetch device info for ${device.name}`, { infoError });
            }
            
            return {
              ...device,
              psu_id: normalizedPsu ?? device.psu_id,
              psuName:
                device?.psuName ??
                device?.psu?.name ??
                (typeof normalizedPsu === 'string' ? normalizedPsu : null),
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
                psu_id: normalizedPsu ?? status.psu_id ?? status.psuId ?? null,
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
      checkWarnings(devicesWithStatus);
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
  const handleConfigClick = (device: Device) => {
    setSelectedDevice(device);
    setShowConfigModal(true);
  };
  
  const handleEditPsu = (psu: any) => {
    setEditingPsu(psu);
    setShowPsuModal(true);
  };
  
  const handleDeletePsu = async (psuId: string, psuName: string) => {
    try {
      await api.psus.delete(psuId);
      toast.success(`PSU "${psuName}" deleted`);
      loadPsus();
      loadDevices(); // Refresh to update device PSU assignments
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete PSU');
    }
  };  // Load PSUs and check for warnings
  const loadPsus = async () => {
    try {
      const psuList = await api.psus.list();
      const normalizedPsus = Array.isArray(psuList)
        ? psuList.map((p: any) => ({ ...p, ...getPsuMetrics(p) }))
        : [];
      setPsus(normalizedPsus);
      
      // Check each PSU for load warnings
      normalizedPsus.forEach((psu: any) => {
        const metrics = getPsuMetrics(psu);
        const assignedDevices = devices.filter((d) => deviceMatchesPsu(d, psu));
        const psuLoad = assignedDevices.reduce((sum, d) => sum + (d.status?.power || 0), 0);
        const loadPercent = metrics.wattage > 0 ? (psuLoad / metrics.wattage) * 100 : 0;
        
        if (metrics.wattage > 0 && loadPercent >= 80) {
          enqueueWarning({
            id: `psu-${psu.id}-danger`,
            title: `PSU "${psu.name}" load`,
            message: `PSU "${psu.name}" is at ${loadPercent.toFixed(0)}% load (${psuLoad.toFixed(1)}W / ${metrics.wattage}W). Consider reducing load or redistributing devices.`,
            level: 'danger',
          });
        } else if (metrics.wattage > 0 && loadPercent >= 70) {
          enqueueWarning({
            id: `psu-${psu.id}-warn`,
            title: `PSU "${psu.name}" load`,
            message: `PSU "${psu.name}" is at ${loadPercent.toFixed(0)}% load (${psuLoad.toFixed(1)}W / ${metrics.wattage}W).`,
            level: 'warning',
          });
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

  const checkWarnings = (deviceList: Device[]) => {
    const keyset = warningKeysRef.current;
    deviceList.forEach((d) => {
      const status: any = d.status;
      if (!status) return;
      const temp = status.temp;
      const vrTemp = status.vrTemp || status.vr_temp || 0;
      const asicErr = status.asic_errors || status.errors || 0;
      const poolFailover = status.poolFailover || status.pool_failover;

      if (temp >= 70) {
        const k = `${d.name}-temp`;
        if (!keyset.has(k)) {
          enqueueWarning({
            id: k,
            title: `${d.name} temperature`,
            message: `High ASIC temperature detected (${temp}C). Consider reducing load or improving cooling.`,
            level: 'warning',
          });
        }
      }
      if (vrTemp >= 85) {
        const k = `${d.name}-vr`;
        if (!keyset.has(k)) {
          enqueueWarning({
            id: k,
            title: `${d.name} VR temperature`,
            message: `Voltage regulator temperature is high (${vrTemp}C). Check airflow or reduce power.`,
            level: 'warning',
          });
        }
      }
      if (asicErr > 0) {
        const k = `${d.name}-err`;
        if (!keyset.has(k)) {
          enqueueWarning({
            id: k,
            title: `${d.name} ASIC errors`,
            message: `Device reported ${asicErr} ASIC errors. Consider applying a safer profile or inspecting the device.`,
            level: 'warning',
          });
        }
      }
      if (!d.online) {
        const k = `${d.name}-offline`;
        if (!keyset.has(k)) {
          enqueueWarning({
            id: k,
            title: `${d.name} offline`,
            message: `${d.name} is offline or unreachable.`,
            level: 'danger',
          });
        }
      }
      if (poolFailover) {
        const k = `${d.name}-failover`;
        if (!keyset.has(k)) {
          enqueueWarning({
            id: k,
            title: `${d.name} pool failover`,
            message: `${d.name} switched to fallback pool.`,
            level: 'warning',
          });
        }
      }
    });
  };

  const inferredSubnet = () => {
    if (devices.length > 0 && devices[0].ip) {
      const parts = devices[0].ip.split('.');
      if (parts.length === 4) {
        parts[3] = '0';
        return parts.join('.');
      }
    }
    return '';
  };

  const handleScan = async () => {
    const base = scanSubnet || inferredSubnet();
    if (!base || base.split('.').length !== 4) {
      toast.error('Enter a subnet like 192.168.1.0, 10.10.2.0, or 172.16.0.0');
      return;
    }
    setScanning(true);
    setScanResults([]);
    const prefix = base.split('.').slice(0, 3).join('.');
    const ips = Array.from({ length: 254 }, (_, i) => `${prefix}.${i + 1}`);
    const found: any[] = [];
    const chunkSize = 20;
    for (let i = 0; i < ips.length; i += chunkSize) {
      const slice = ips.slice(i, i + chunkSize);
      const results = await Promise.all(slice.map(async (ip) => {
        try {
          const detected = await api.devices.detect(ip);
          if (detected && detected.model) {
            return { ip, model: detected.model, name: detected.name || ip };
          }
        } catch {
          return null;
        }
        return null;
      }));
      found.push(...results.filter(Boolean) as any[]);
      setScanResults([...found]);
    }
    if (found.length === 0) {
      toast.warning('No devices detected on this subnet');
    } else {
      toast.success(`Found ${found.length} device(s)`);
    }
    setScanning(false);
  };

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
  
  // Find device with best all-time difficulty
  const bestDiffDevice = onlineDevices.reduce((max, d) => {
    const diff = parseDifficulty(d.status?.bestDiff || 0);
    const maxDiff = max ? parseDifficulty(max.status?.bestDiff || 0) : 0;
    return diff > maxDiff ? d : max;
  }, onlineDevices[0] || null);

  // Find device with best difficulty since boot
  const bestSessionDiffDevice = onlineDevices.reduce((max, d) => {
    const diff = parseDifficulty(d.status?.bestSessionDiff || 0);
    const maxDiff = max ? parseDifficulty(max.status?.bestSessionDiff || 0) : 0;
    return diff > maxDiff ? d : max;
  }, onlineDevices[0] || null);

  console.log('[Dashboard] Best difficulty stats:', {
    bestDiff: { device: bestDiffDevice?.name, value: bestDiffDevice?.status?.bestDiff },
    bestSessionDiff: { device: bestSessionDiffDevice?.name, value: bestSessionDiffDevice?.status?.bestSessionDiff }
  });

  const fleetStats = {
    total: devices.length,
    online: onlineDevices.length,
    totalHashrate,
    totalPower,
    fleetEfficiency,
    bestDiffDevice,
    bestSessionDiffDevice,
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

      {/* Best Difficulty (All-Time) */}
      {fleetStats.bestDiffDevice && (
        <div className="hud-panel">
          <div className="flex items-center justify-between">
            <div>
              <div className="data-label">BEST DIFFICULTY</div>
              <div className="text-[var(--text-secondary)] text-sm mt-1">
                {fleetStats.bestDiffDevice.name}
              </div>
            </div>
            <div className="data-value text-[var(--matrix-green)]">
              {formatDifficulty(fleetStats.bestDiffDevice.status?.bestDiff || 0)}
            </div>
          </div>
        </div>
      )}

      {/* Best Since Boot */}
      {fleetStats.bestSessionDiffDevice && (
        <div className="hud-panel">
          <div className="flex items-center justify-between">
            <div>
              <div className="data-label">BEST SINCE BOOT</div>
              <div className="text-[var(--text-secondary)] text-sm mt-1">
                {fleetStats.bestSessionDiffDevice.name}
              </div>
            </div>
            <div className="data-value text-[var(--neon-cyan)]">
              {formatDifficulty(fleetStats.bestSessionDiffDevice.status?.bestSessionDiff || 0)}
            </div>
          </div>
        </div>
      )}

      {/* PSU Cards */}
      {psus.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-glow-cyan">PSU_MANAGEMENT</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {psus.map((psu: any) => {
              // Find devices assigned to this PSU
              const assignedDevices = devices.filter((d) => deviceMatchesPsu(d, psu));
              const backendCount =
                (typeof psu.devices_count === 'number' ? psu.devices_count : null) ??
                (Array.isArray(psu.devices) ? psu.devices.length : null) ??
                (Array.isArray(psu.assigned_devices) ? psu.assigned_devices.length : null);
              const assignedCount = assignedDevices.length || backendCount || 0;
              const metrics = getPsuMetrics(psu);
              const psuLoad = assignedDevices.reduce(
                (sum, d) => sum + (d.status?.power ?? d.status?.wattage ?? 0),
                0
              );
              const loadPercent = metrics.wattage > 0 ? (psuLoad / metrics.wattage) * 100 : 0;
              const loadColor = loadPercent >= 80 ? 'var(--error-red)' : loadPercent >= 70 ? 'var(--warning-amber)' : 'var(--matrix-green)';
              
              return (
                <div key={psu.id} className="hud-panel">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-bold text-glow-cyan">⚡ {psu.name}</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--text-muted)]">
                        {assignedCount} DEVICE{assignedCount !== 1 ? 'S' : ''}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEditPsu(psu)}
                        className="h-6 px-2 text-xs text-[var(--neon-cyan)] hover:bg-[var(--neon-cyan)]/10"
                      >
                        EDIT
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmPsu({ id: psu.id, name: psu.name })}
                        className="h-6 px-2 text-xs text-[var(--error-red)] hover:bg-[var(--error-red)]/10"
                      >
                        DELETE
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--text-secondary)]">Capacity</span>
                      <span className="text-[var(--text-primary)] font-bold">{metrics.wattage}W</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--text-secondary)]">Input</span>
                      <span className="text-[var(--text-primary)] font-bold">
                        {metrics.voltage ? `${metrics.voltage}V` : '— V'} @ {metrics.amperage ? `${metrics.amperage}A` : '— A'}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--text-secondary)]">Current Load</span>
                      <span className="font-bold" style={{ color: loadColor }}>{psuLoad.toFixed(1)}W ({loadPercent.toFixed(0)}%)</span>
                    </div>
                    {assignedDevices.length > 0 && (
                      <div className="text-xs text-[var(--text-muted)] mt-2 space-y-1">
                        <div className="font-bold text-[var(--text-secondary)]">Assigned Devices:</div>
                        {assignedDevices.map(d => (
                          <div key={d.name} className="flex justify-between">
                            <span>{d.name}</span>
                            <span className="text-[var(--neon-cyan)]">{(d.status?.power || 0).toFixed(1)}W</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {assignedDevices.length === 0 && backendCount ? (
                      <div className="text-xs text-[var(--text-muted)] italic mt-2">
                        {backendCount} device(s) assigned (no live data yet)
                      </div>
                    ) : null}
                    {assignedDevices.length === 0 && !backendCount && (
                      <div className="text-xs text-[var(--text-muted)] italic mt-2">
                        No devices assigned
                      </div>
                    )}
                    <div className="w-full bg-[var(--grid-gray)] h-2 rounded mt-2">
                      <div
                        className="h-2 rounded transition-all"
                        style={{ width: `${Math.min(loadPercent, 100)}%`, backgroundColor: loadColor }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Actions Bar */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-glow-green">DEVICE_GRID</h2>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              const inferred = inferredSubnet();
              setScanSubnet(inferred);
              setShowScanModal(true);
            }}
            variant="outline"
            className="gap-2"
          >
            SCAN
          </Button>
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
            <DeviceCard key={device.name} device={device} onRefresh={loadDevices} onConfig={handleConfigClick} />
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
        onClose={() => {
          setShowPsuModal(false);
          setEditingPsu(null);
        }}
        onSave={() => {
          loadPsus();
          setShowPsuModal(false);
          setEditingPsu(null);
        }}
        editPsu={editingPsu}
      />

      <Dialog open={showScanModal} onOpenChange={setShowScanModal}>
        <DialogContent className="bg-[var(--dark-gray)] border-2 border-[var(--matrix-green)] text-[var(--text-primary)] max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-glow-green">SCAN_NETWORK</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-[var(--text-secondary)] text-sm">Subnet (end with .0)</label>
              <Input
                value={scanSubnet}
                onChange={(e) => setScanSubnet(e.target.value)}
                placeholder="e.g., 192.168.1.0"
                className="bg-[var(--dark-gray)] border-[var(--grid-gray)] mt-1"
              />
            </div>
            <Button onClick={handleScan} disabled={scanning} className="btn-matrix w-full">
              {scanning ? 'SCANNING...' : 'START_SCAN'}
            </Button>
            {scanResults.length > 0 && (
              <div className="max-h-48 overflow-y-auto text-sm space-y-1">
                {scanResults.map((res, idx) => (
                  <div key={idx} className="p-2 border border-[var(--grid-gray)] rounded">
                    <div className="font-bold text-[var(--text-primary)]">{res.name}</div>
                    <div className="text-[var(--text-secondary)] text-xs">{res.ip} · {res.model}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* PSU delete confirmation */}
      <ConfirmDialog
        open={!!confirmPsu}
        title={confirmPsu ? `Delete PSU "${confirmPsu.name}"?` : ''}
        description="Devices assigned to this PSU will be set to Standalone mode."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        tone="danger"
        onCancel={() => setConfirmPsu(null)}
        onConfirm={() => {
          if (confirmPsu) {
            handleDeletePsu(confirmPsu.id, confirmPsu.name);
          }
          setConfirmPsu(null);
        }}
      />

      {/* Warning modal (one at a time) */}
      <Dialog open={!!activeWarning} onOpenChange={(open) => { if (!open) dismissActiveWarning(); }}>
        <DialogContent className="matrix-card max-w-xl border-2">
          <DialogHeader>
            <DialogTitle className={`text-xl font-bold ${activeWarning?.level === 'danger' ? 'text-[var(--error-red)]' : 'text-[var(--warning-amber)]'}`}>
              {activeWarning?.title || 'WARNING'}
            </DialogTitle>
          </DialogHeader>
          <div className="text-[var(--text-primary)] text-sm leading-relaxed">
            {activeWarning?.message}
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] mt-3">
            <input
              id="dont-remind-warning"
              type="checkbox"
              checked={dontRemind}
              onChange={(e) => setDontRemind(e.target.checked)}
            />
            <label htmlFor="dont-remind-warning">Don't remind me again for this warning</label>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={dismissActiveWarning}>Dismiss</Button>
            <Button
              className={activeWarning?.level === 'danger' ? 'bg-[var(--error-red)] hover:bg-[var(--error-red)]/80 text-white' : 'btn-matrix'}
              onClick={dismissActiveWarning}
            >
              OK
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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
            <div>
              <div className="text-[var(--text-secondary)]">PSU</div>
              <div className="font-bold text-[var(--text-primary)] truncate">
                {typeof device.psuName === 'string'
                  ? device.psuName
                  : typeof device.psu_id === 'string'
                  ? device.psu_id
                  : typeof (device.status as any).psu_id === 'string'
                  ? (device.status as any).psu_id
                  : typeof device.psu === 'object' && device.psu?.name
                  ? device.psu.name
                  : 'Standalone'}
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
