import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { api, MODEL_COLORS, MODEL_NAMES } from '@/lib/api';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useSettings } from '@/contexts/SettingsContext';

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

const MODEL_POWER_HINTS: Record<string, { volts: number; amps: number; note: string }> = {
  gamma: { volts: 5, amps: 3, note: 'Gamma 601/602 uses USB-C 5V input' },
  supra: { volts: 12, amps: 2.5, note: 'Supra (BM1368) typically runs on 12V' },
  ultra: { volts: 12, amps: 2.5, note: 'Ultra (BM1366) typically runs on 12V' },
  hex: { volts: 12, amps: 5, note: 'Hex (BM1366 x6) 12V high-current rail' },
  max: { volts: 12, amps: 3, note: 'Max (BM1397) 12V input' },
  nerdqaxe: { volts: 5, amps: 3, note: 'NerdQAxe (BM1370) USB-C 5V input' },
  nerdqaxe_plus: { volts: 5, amps: 5, note: 'NerdQAxe+ (dual BM1370) 5V with higher current' },
  nerdqaxe_plus_plus: { volts: 5, amps: 8, note: 'NerdQAxe++ (quad BM1370) 5V high-current' },
};

const loadStoredAssignments = (): Record<string, string | null> => {
  try {
    const raw = localStorage.getItem('axebench:psuAssignments');
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (error) {
    console.warn('Failed to load PSU assignments from storage', error);
  }
  return {};
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
const resolveAssignedDevices = (
  psu: any,
  devices: Device[],
  storedAssignments: Record<string, string | null> = {}
) => {
  // Direct match by id/name on device
  let matches = devices.filter((d) => deviceMatchesPsu(d, psu));

  // Add devices explicitly mapped via stored assignments (localStorage)
  const psuId = psu?.id != null ? String(psu.id) : null;
  Object.entries(storedAssignments).forEach(([deviceName, storedId]) => {
    if (!storedId) return;
    if (psuId && String(storedId) === psuId) {
      const dev = devices.find((d) => d.name === deviceName);
      if (dev && !matches.some((m) => m.name === dev.name)) {
        matches.push(dev);
      }
    }
  });

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

// PSU is virtual; prefer provided wattage, else derive from devices, else zero.
const getPsuMetrics = (psu: any, assignedDevices: Device[]) => {
  const wattageFromPsu =
    normalizeNumber(psu?.wattage, null) ??
    normalizeNumber(psu?.capacity_watts, null) ??
    normalizeNumber(psu?.capacity, null);
  const wattageFromDevices = assignedDevices.reduce(
    (sum, d) => sum + (normalizeNumber(d?.status?.power, 0) ?? 0),
    0
  );
  let wattage = wattageFromPsu ?? (wattageFromDevices > 0 ? wattageFromDevices : 0);

  // Voltage/amps are optional; provide hints if present, otherwise omit.
  let voltage =
    normalizeNumber(psu?.voltage, null) ??
    normalizeNumber(psu?.voltage_v, null) ??
    normalizeNumber(psu?.volts, null) ??
    normalizeNumber(psu?.v, null) ??
    normalizeNumber(psu?.input_voltage, null) ??
    null;
  let amperage =
    normalizeNumber(psu?.amperage, null) ??
    normalizeNumber(psu?.amps, null) ??
    normalizeNumber(psu?.current, null) ??
    normalizeNumber(psu?.current_a, null) ??
    normalizeNumber(psu?.input_amperage, null) ??
    null;

  // If wattage missing but both V/A are present, compute it.
  if (!wattage && voltage && amperage) {
    const computedW = voltage * amperage;
    if (Number.isFinite(computedW) && computedW > 0) {
      wattage = Number(computedW.toFixed(1));
    }
  }

  // If wattage and one of voltage/amps are provided, derive the missing dimension
  if (wattage && !amperage && voltage) {
    const derivedA = wattage / voltage;
    if (Number.isFinite(derivedA) && derivedA > 0) {
      amperage = Number(derivedA.toFixed(1));
    }
  } else if (wattage && !voltage && amperage) {
    const derivedV = wattage / amperage;
    if (Number.isFinite(derivedV) && derivedV > 0) {
      voltage = Number(derivedV.toFixed(1));
    }
  }

  let hint: { voltage?: number; amperage?: number; note?: string } | undefined;
  if (voltage === null || amperage === null) {
    // Try to derive from the first assigned device model
    const hintModel = assignedDevices
      .map((d) => d.model?.toLowerCase())
      .find((m) => m && MODEL_POWER_HINTS[m]);
    if (hintModel && MODEL_POWER_HINTS[hintModel]) {
      const suggested = MODEL_POWER_HINTS[hintModel];
      voltage = voltage ?? suggested.volts;
      amperage = amperage ?? suggested.amps;
      hint = { voltage, amperage, note: suggested.note };
    }
  }

  return {
    voltage: voltage ?? undefined,
    amperage: amperage ?? undefined,
    wattage,
    hint,
  };
};

export default function Dashboard() {
  const {
    formatTemp,
    formatHashrate,
    formatPower,
    alertChipTemp,
    alertVrTemp,
    dashboardRefreshMs,
  } = useSettings();
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
  const [confirmDevice, setConfirmDevice] = useState<Device | null>(null);

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
      const storedAssignments = loadStoredAssignments();
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
            const storedPsu = storedAssignments[device.name];
            
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
              psu_id: storedPsu ?? normalizedPsu ?? device.psu_id,
              psuName:
                device?.psuName ??
                device?.psu?.name ??
                (typeof storedPsu === 'string' ? storedPsu : null) ??
                (typeof normalizedPsu === 'string' ? normalizedPsu : null),
              online: true, // If we got status, device is online
              status: {
                hashrate: status.hashrate || 0,
                temp: status.temperature || 0,
          power: normalizeNumber(status.power, 0) ?? 0,
                voltage: status.voltage || 0,
                frequency: status.frequency || 0,
                fan_speed: status.fan_speed || 0,
                difficulty: status.difficulty || deviceInfo?.poolDifficulty || 0,
                bestDiff: deviceInfo?.bestDiff || 0,
                bestSessionDiff: deviceInfo?.bestSessionDiff || 0,
                efficiency: status.power > 0 ? (status.power / (status.hashrate / 1000)) : 0,
                psu_id: storedPsu ?? normalizedPsu ?? status.psu_id ?? status.psuId ?? null,
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

  const handleDeleteDevice = (device: Device) => {
    setConfirmDevice(device);
  };

  const confirmDeleteDevice = async () => {
    if (!confirmDevice) return;
    try {
      await api.devices.delete(confirmDevice.name);
      toast.success(`Deleted ${confirmDevice.name}`);
      loadDevices();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete device');
    } finally {
      setConfirmDevice(null);
    }
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
        ? psuList.map((p: any) => ({ ...p }))
        : [];
      setPsus(normalizedPsus);
      
      // Check each PSU for load warnings
      const storedAssignments = loadStoredAssignments();
      normalizedPsus.forEach((psu: any) => {
        const assignedDevices = resolveAssignedDevices(psu, devices, storedAssignments);
        const metrics = getPsuMetrics(psu, assignedDevices);
        const psuLoad = assignedDevices.reduce(
          (sum, d) =>
            sum +
            (normalizeNumber((d.status as any)?.power, null) ??
              normalizeNumber((d.status as any)?.wattage, 0) ??
              0),
          0
        );
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
    const intervalMs = Math.max(1000, dashboardRefreshMs || 5000);
    const interval = setInterval(loadDevices, intervalMs);
    return () => {
      logger.info('Dashboard', 'Component unmounting, clearing interval');
      clearInterval(interval);
    };
  }, [dashboardRefreshMs]);
  
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

      if (temp >= alertChipTemp) {
        const k = `${d.name}-temp`;
        if (!keyset.has(k)) {
          enqueueWarning({
            id: k,
            title: `${d.name} temperature`,
            message: `High ASIC temperature detected (${formatTemp(temp)}). Consider reducing load or improving cooling.`,
            level: 'warning',
          });
        }
      }
      if (vrTemp >= alertVrTemp) {
        const k = `${d.name}-vr`;
        if (!keyset.has(k)) {
          enqueueWarning({
            id: k,
            title: `${d.name} VR temperature`,
            message: `Voltage regulator temperature is high (${formatTemp(vrTemp)}). Check airflow or reduce power.`,
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
  const totalPower = onlineDevices.reduce(
    (sum, d) => sum + (normalizeNumber(d.status?.power, 0) ?? 0),
    0
  );
  
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
  
  const devicesWithStats = devices.filter(d => d.status);

  // Find device with best all-time difficulty across the fleet (even if offline)
  const bestDiffDevice = devicesWithStats.reduce((max, d) => {
    const diff = parseDifficulty(d.status?.bestDiff || 0);
    const maxDiff = max ? parseDifficulty(max.status?.bestDiff || 0) : 0;
    return diff > maxDiff ? d : max;
  }, devicesWithStats[0] || null);

  // Find device with best difficulty since boot across the fleet (even if offline)
  const bestSessionDiffDevice = devicesWithStats.reduce((max, d) => {
    const diff = parseDifficulty(d.status?.bestSessionDiff || 0);
    const maxDiff = max ? parseDifficulty(max.status?.bestSessionDiff || 0) : 0;
    return diff > maxDiff ? d : max;
  }, devicesWithStats[0] || null);

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
          INITIALIZING... HOLD ON TO YOUR ASICs!
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

        {(fleetStats.bestDiffDevice || fleetStats.bestSessionDiffDevice) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {fleetStats.bestDiffDevice && (
              <div className="matrix-card flex items-center justify-between">
                <div>
                  <div className="data-label">BEST DIFFICULTY</div>
                  <div className="text-[var(--text-secondary)] text-sm mt-1">
                    {fleetStats.bestDiffDevice.name}
                  </div>
                </div>
                <div className="data-value text-[var(--theme-primary)]">
                  {formatDifficulty(fleetStats.bestDiffDevice.status?.bestDiff || 0)}
                </div>
              </div>
            )}
            {fleetStats.bestSessionDiffDevice && (
              <div className="matrix-card flex items-center justify-between">
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
            )}
          </div>
        )}

      {/* PSU Cards */}
      {psus.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-glow-green">PSU_MANAGEMENT</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {psus.map((psu: any) => {
              // Find devices assigned to this PSU
              const storedAssignments = loadStoredAssignments();
              const assignedDevices = resolveAssignedDevices(psu, devices, storedAssignments);
              const backendCount =
                (typeof psu.devices_count === 'number' ? psu.devices_count : null) ??
                (Array.isArray(psu.devices) ? psu.devices.length : null) ??
                (Array.isArray(psu.assigned_devices) ? psu.assigned_devices.length : null);
              const assignedCount = assignedDevices.length || backendCount || 0;
              const metrics = getPsuMetrics(psu, assignedDevices);
              const psuLoad = assignedDevices.reduce(
                (sum, d) =>
                  sum +
                  (normalizeNumber((d.status as any)?.power, null) ??
                    normalizeNumber((d.status as any)?.wattage, 0) ??
                    0),
                0
              );
              const loadPercent = metrics.wattage > 0 ? (psuLoad / metrics.wattage) * 100 : 0;
              const loadColor = loadPercent >= 80 ? 'var(--error-red)' : loadPercent >= 70 ? 'var(--warning-amber)' : 'var(--matrix-green)';
              
              return (
                <div key={psu.id} className="hud-panel">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-bold text-glow-cyan">⚡ {psu.name}</h3>
                    <div className="flex items-center gap-2">
                      {loadPercent >= 80 && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded border border-[var(--error-red)] text-[var(--error-red)]">
                          WARNING
                        </span>
                      )}
                      <span className="text-xs text-[var(--text-muted)]">
                        {assignedCount} DEVICE{assignedCount !== 1 ? 'S' : ''}
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleEditPsu(psu)}
                        className="h-7 px-3 text-xs uppercase tracking-wide"
                      >
                        EDIT
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setConfirmPsu({ id: psu.id, name: psu.name })}
                        className="h-7 px-3 text-xs uppercase tracking-wide shadow-[0_0_14px_rgba(239,68,68,0.35)]"
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
                      {metrics.voltage && metrics.amperage ? (
                        <div className="text-right">
                          <div className="text-[var(--text-primary)] font-bold">
                            {metrics.voltage}V @ {metrics.amperage}A
                          </div>
                          {metrics.hint?.note && (
                            <div className="text-[var(--text-muted)] text-[10px]">
                              {metrics.hint.note}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-right">
                          <div className="text-[var(--text-primary)] font-bold">
                            {(psu.capacity_watts ?? metrics.wattage ?? 0).toFixed(0)}W
                            <span className="text-[var(--text-muted)] text-xs ml-1">
                              {psu.safe_watts ? `safe ${psu.safe_watts}W` : ''}
                            </span>
                          </div>
                          {metrics.hint && (
                            <div className="text-[var(--text-muted)] text-[10px]">
                              ~{metrics.hint.voltage}V @ {metrics.hint.amperage}A (derived from device model)
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--text-secondary)]">Current Load</span>
                      <span className="font-bold" style={{ color: loadColor }}>{psuLoad.toFixed(1)}W ({loadPercent.toFixed(0)}%)</span>
                    </div>
                    {assignedDevices.length > 0 && (
                      <div className="text-xs text-[var(--text-muted)] mt-2 space-y-1">
                        <div className="font-bold text-[var(--text-secondary)]">Assigned Devices:</div>
                        {assignedDevices.map(d => {
                          const devicePower =
                            normalizeNumber((d.status as any)?.power, null) ??
                            normalizeNumber((d.status as any)?.wattage, 0) ??
                            0;
                          return (
                            <div key={d.name} className="flex justify-between">
                              <span>{d.name}</span>
                              <span className="text-[var(--neon-cyan)]">{devicePower.toFixed(1)}W</span>
                            </div>
                          );
                        })}
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
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={() => {
                  const inferred = inferredSubnet();
                  setScanSubnet(inferred);
                  setShowScanModal(true);
                }}
                variant="outline"
                className="gap-2 uppercase tracking-wide"
              >
                SCAN
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Sweep the /24 subnet (254 IPs) to auto-detect Bitaxe devices via backend detect API.
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={loadDevices}
                disabled={refreshing}
                variant="secondary"
                className="uppercase tracking-wide"
              >
                {refreshing ? '⟳ SYNCING...' : '🔄 REFRESH'}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Re-poll devices, PSUs, and warnings from the backend now.
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={() => setShowAddModal(true)}
                variant="default"
                className="uppercase tracking-wide shadow-[0_0_18px_hsla(var(--primary),0.35)]"
              >
                ➕ ADD_DEVICE
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Add a device (blocked if your Patreon tier device limit is reached).
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={() => setShowPsuModal(true)}
                variant="accent"
                className="uppercase tracking-wide shadow-[0_0_18px_hsla(var(--accent),0.4)]"
              >
                ⚡ PSU_CONFIG
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Create or edit shared PSUs; assign them per device in Config.
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Device Grid */}
      {devices.length === 0 ? (
        <div className="matrix-card text-center py-12">
          <div className="text-[var(--text-muted)] text-lg mb-4">
            NO_DEVICES_DETECTED
          </div>
          <Button
            onClick={() => setShowAddModal(true)}
            variant="default"
            className="uppercase tracking-wide shadow-[0_0_18px_hsla(var(--primary),0.35)]"
          >
            ➕ ADD_YOUR_FIRST_DEVICE
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {devices.map((device) => (
            <DeviceCard
              key={device.name}
              device={device}
              onRefresh={loadDevices}
              onConfig={handleConfigClick}
              onDelete={handleDeleteDevice}
            />
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
        <DialogContent className="max-w-lg shadow-chrome">
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
                className="mt-1 bg-card/70 border-border/70"
              />
            </div>
            <Button onClick={handleScan} disabled={scanning} className="w-full uppercase tracking-wide">
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

      <ConfirmDialog
        open={!!confirmDevice}
        title={confirmDevice ? `Delete device "${confirmDevice.name}"?` : 'Delete device?'}
        description="This removes the device from AxeBench. It does not send any stop or reset command to the miner."
        confirmLabel="Delete device"
        cancelLabel="Cancel"
        tone="danger"
        onCancel={() => setConfirmDevice(null)}
        onConfirm={confirmDeleteDevice}
      />

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
              variant={activeWarning?.level === 'danger' ? 'destructive' : 'default'}
              className="uppercase tracking-wide"
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

function DeviceCard({ device, onRefresh, onConfig, onDelete }: { device: Device; onRefresh: () => void; onConfig: (device: Device) => void; onDelete: (device: Device) => void }) {
  const { formatHashrate, formatTemp, formatPower } = useSettings();
  const [, setLocation] = useLocation();
  const modelColor = MODEL_COLORS[device.model?.toLowerCase()] || '#666';
  const modelName = MODEL_NAMES[device.model?.toLowerCase()] || device.model?.toUpperCase() || 'UNKNOWN';
  const warnings: string[] = [];

  const temp = (device.status as any)?.temp ?? 0;
  const vrTemp = (device.status as any)?.vrTemp ?? 0;
  const power = (device.status as any)?.power ?? 0;

  if (!device.online) warnings.push('OFFLINE');
  if (temp > 70) warnings.push('HIGH_TEMP');
  if (vrTemp > 80) warnings.push('VR_HOT');
  if (power > 30) warnings.push('POWER_HIGH');

  const handleBenchmark = () => {
    // Navigate to benchmark page with device pre-selected
    setLocation('/benchmark?device=' + encodeURIComponent(device.name));
  };

  const handleAutoTune = () => {
    setLocation('/benchmark?device=' + encodeURIComponent(device.name) + '&autotune=1');
  };

  const handleMonitor = () => {
    setLocation('/monitoring?device=' + encodeURIComponent(device.name));
  };

  return (
    <div
      className={`matrix-card ${!device.online ? 'opacity-60' : ''} cursor-pointer`}
      onClick={handleMonitor}
      title={warnings.length ? warnings.join(' • ') : undefined}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-xl font-bold text-[var(--text-primary)] text-glow-green">
            {device.name}
          </div>
          <div className="text-sm text-[var(--text-muted)]">{device.ip}</div>
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
          className={`w-4 h-4 rounded-full ${
            device.online ? 'bg-[var(--success-green)] pulse-green' : 'bg-[var(--error-red)]'
          }`}
        />
        <span className={`${device.online ? 'status-online' : 'status-error'} text-base`}>
          {device.online ? 'ONLINE' : 'OFFLINE'}
        </span>
        {warnings.length > 0 && (
          <div className="flex flex-wrap gap-1 ml-auto">
            {warnings.map((warn) => (
              <span
                key={warn}
                className="text-[10px] tracking-wide font-bold px-2 py-0.5 rounded border border-[var(--warning-amber)] bg-[var(--warning-amber)]/10 text-[var(--warning-amber)]"
              >
                {warn}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Stats */}
      {device.online && device.status && (
        <>
          <div className="grid grid-cols-2 gap-2 mb-3 text-base">
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
              <div className="font-bold">{Math.round(device.status.fan_speed || 0)}%</div>
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
      <div className="grid grid-cols-2 gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              size="sm" 
              variant="default"
              className="w-full text-xs uppercase tracking-wide bg-[#ff1f1f] hover:bg-[#d60f0f] text-white border border-[#ff1f1f] shadow-[0_0_14px_rgba(255,31,31,0.5)]"
              onClick={(e) => { e.stopPropagation(); handleBenchmark(); }}
              disabled={!device.online}
            >
              BENCHMARK
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            Start a benchmark with this device preselected (only one benchmark runs at a time).
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              size="sm" 
              variant="autoTune"
              className="w-full text-xs uppercase tracking-wide shadow-[0_0_14px_rgba(168,85,247,0.45)]"
              onClick={(e) => { e.stopPropagation(); handleAutoTune(); }}
              disabled={!device.online}
            >
              FULL SWEEP
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            Launch Full Sweep Optimizer for this device (opens Benchmark with this device selected).
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              size="sm" 
              variant="secondary"
              className="w-full text-xs uppercase tracking-wide"
              onClick={(e) => { e.stopPropagation(); onConfig(device); }}
              disabled={!device.online}
            >
              CONFIG
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            Open device config to set voltage/frequency, fan target, and PSU assignment.
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="destructive"
              className="w-full text-xs uppercase tracking-wide shadow-[0_0_14px_rgba(239,68,68,0.35)]"
              onClick={(e) => { e.stopPropagation(); onDelete(device); }}
            >
              DELETE
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            Remove this device from AxeBench (backend delete); cannot be undone.
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
