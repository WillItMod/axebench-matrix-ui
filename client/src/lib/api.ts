/**
 * API Configuration and Helper Functions
 * Connects to the Flask backend (AxeBench Python server)
 */

import { logger } from './logger';

// API Base URL - uses Vite proxy in development, direct connection in production
// Development: Vite proxy forwards /api to localhost:5002 (AxePool)
// Production: Set VITE_API_BASE_URL to your backend URL
// AxePool runs on 5002, AxeShed runs on 5001
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

/**
 * Fetch wrapper with error handling and logging
 */
async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const method = options?.method || 'GET';
  
  logger.debug('API', `Request: ${method} ${endpoint}`, { url, options });
  
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      logger.error('API', `Response error: ${method} ${endpoint}`, { 
        status: response.status, 
        statusText: response.statusText,
        error 
      });
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    logger.info('API', `Response success: ${method} ${endpoint}`, { 
      status: response.status, 
      dataType: Array.isArray(data) ? `array[${data.length}]` : typeof data,
      data 
    });
    return data;
  } catch (error) {
    logger.error('API', `Request failed: ${method} ${endpoint}`, { error });
    console.error(`API Error [${endpoint}]:`, error);
    throw error;
  }
}

/**
 * API Methods
 */
export const api = {
  // ============================================================================
  // SYSTEM STATUS
  // ============================================================================
  
  system: {
    // Some deployments do not expose /api/uptime; fall back silently.
    uptime: async () => {
      const url = `${API_BASE_URL}/api/uptime`;
      try {
        const res = await fetch(url);
        if (!res.ok) {
          return { uptime_seconds: 0 };
        }
        const data = await res.json().catch(() => ({ uptime_seconds: 0 }));
        return data as { uptime_seconds: number };
      } catch {
        return { uptime_seconds: 0 };
      }
    },
  },

  // ============================================================================
  // DEVICE MANAGEMENT
  // ============================================================================
  
  devices: {
    list: () => apiFetch<any[]>('/api/devices'),
    get: (name: string) => apiFetch<any>(`/api/devices/${name}`),
    add: (data: { name: string; ip: string; model: string; psu?: any }) =>
      apiFetch<any>('/api/devices', { method: 'POST', body: JSON.stringify(data) }),
    update: (name: string, data: any) =>
      apiFetch<any>(`/api/devices/${name}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (name: string) =>
      apiFetch<any>(`/api/devices/${name}`, { method: 'DELETE' }),
    detect: (ip: string) =>
      apiFetch<any>('/api/devices/detect', { method: 'POST', body: JSON.stringify({ ip }) }),
    status: (name: string) => apiFetch<any>(`/api/devices/${name}/status`),
    // Fetch device system info (includes bestSessionDiff, bestDiff, poolDifficulty)
    info: (name: string) => apiFetch<any>(`/api/devices/${name}/info`),
    restart: (name: string) =>
      apiFetch<any>(`/api/device/${name}/restart`, { method: 'POST' }),
    setFan: (name: string, auto: boolean, targetTemp?: number) =>
      apiFetch<any>(`/api/devices/${name}/fan`, {
        method: 'POST',
        body: JSON.stringify({ auto, target_temp: targetTemp }),
      }),
    applySettings: (name: string, voltage: number, frequency: number) =>
      apiFetch<any>(`/api/device/${name}/settings`, {
        method: 'POST',
        body: JSON.stringify({ voltage, frequency }),
      }),
  },

  // ============================================================================
  // PSU MANAGEMENT
  // ============================================================================
  
  psus: {
    list: () => apiFetch<any[]>('/api/psus'),
    get: (id: string) => apiFetch<any>(`/api/psus/${id}`),
    create: (data: any) =>
      apiFetch<any>('/api/psus', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      apiFetch<any>(`/api/psus/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) =>
      apiFetch<any>(`/api/psus/${id}`, { method: 'DELETE' }),
    getDevices: (id: string) => apiFetch<any>(`/api/psus/${id}/devices`),
  },

  // ============================================================================
  // BENCHMARK
  // ============================================================================
  
  benchmark: {
    start: (config: any) =>
      apiFetch<any>('/api/benchmark/start', { method: 'POST', body: JSON.stringify(config) }),
    // Some backends return 400 when nothing is running; treat as benign.
    stop: async () => {
      const url = `${API_BASE_URL}/api/benchmark/stop`;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) {
          if (res.status === 400) {
            return { status: 'idle' };
          }
          const err = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(err.error || `HTTP ${res.status}`);
        }
        return res.json();
      } catch (error) {
        // If network error, surface it; if 400 was already handled above.
        throw error;
      }
    },
    status: () => apiFetch<any>('/api/benchmark/status'),
    clearQueue: () =>
      apiFetch<any>('/api/benchmark/clear_queue', { method: 'POST' }),
  },

  // ============================================================================
  // PROFILES
  // ============================================================================
  
  profiles: {
    list: () => apiFetch<any>('/api/profiles'),
    get: (device: string) => apiFetch<any>(`/api/profiles/${device}`),
    save: (device: string, profiles: any, sessionId?: string, overwrite?: boolean) =>
      apiFetch<any>(`/api/profiles/${device}`, {
        method: 'POST',
        body: JSON.stringify({ profiles, session_id: sessionId, overwrite }),
      }),
    apply: (device: string, profileName: string) =>
      apiFetch<any>(`/api/profiles/${device}/apply/${profileName}`, { method: 'POST' }),
    saveCustom: (device: string) =>
      apiFetch<any>(`/api/profiles/${device}/custom`, { method: 'POST' }),
    update: (device: string, profileName: string, profileData: any) =>
      apiFetch<any>(`/api/profiles/${device}/update`, {
        method: 'POST',
        body: JSON.stringify({ profile_name: profileName, profile_data: profileData }),
      }),
    delete: (device: string, profileName: string) =>
      apiFetch<any>(`/api/profiles/${device}/delete/${profileName}`, { method: 'DELETE' }),
  },

  // ============================================================================
  // SESSIONS
  // ============================================================================
  
  sessions: {
    list: () => apiFetch<any[]>('/api/sessions'),
    get: (id: string) => apiFetch<any>(`/api/sessions/${id}`),
    delete: (id: string) =>
      apiFetch<any>(`/api/sessions/${id}`, { method: 'DELETE' }),
    getLogs: (id: string) => apiFetch<string>(`/api/sessions/${id}/logs`),
    getPlot: (id: string, plotType: string) =>
      `${API_BASE_URL}/api/sessions/${id}/plot/${plotType}`,
    generateProfiles: (id: string) =>
      apiFetch<any>(`/api/sessions/${id}/generate_profiles`, { method: 'POST' }),
  },

  // ============================================================================
  // CONFIGURATION
  // ============================================================================
  
  config: {
    getPresets: () => apiFetch<any>('/api/presets'),
    getDeviceProfile: (model: string) => apiFetch<any>(`/api/device-profile/${model}`),
    getHardwarePreset: (presetKey: string, deviceModel: string) =>
      apiFetch<any>(`/api/hardware-preset/${presetKey}/${deviceModel}`),
    getOptimizationTargets: () => apiFetch<any>('/api/optimization-targets'),
  },

  // ============================================================================
  // LICENSE
  // ============================================================================
  
  license: {
    status: () => apiFetch<any>('/api/license/status'),
    logout: () => apiFetch<any>('/api/license/logout', { method: 'POST' }),
    refresh: () => apiFetch<any>('/api/license/refresh', { method: 'POST' }),
    tierInfo: () => apiFetch<any>('/api/tier-info'),
  },

  // ============================================================================
  // AXEPOOL - Pool Management (port 5002)
  // ============================================================================
  
  pool: {
    // Pool CRUD
    list: () => apiFetch<Record<string, any>>('/api/pools'),
    create: (data: any) =>
      apiFetch<any>('/api/pools', { method: 'POST', body: JSON.stringify(data) }),
    get: (poolId: string) => apiFetch<any>(`/api/pools/${poolId}`),
    update: (poolId: string, data: any) =>
      apiFetch<any>(`/api/pools/${poolId}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (poolId: string) =>
      apiFetch<any>(`/api/pools/${poolId}`, { method: 'DELETE' }),
    
    // Pool presets
    presets: () => apiFetch<any>('/api/pools/presets'),
    
    // Device pool operations
    getDevicePool: (deviceName: string) => {
      const dev = encodeURIComponent(deviceName);
      return apiFetch<any>(`/api/devices/${dev}/pool`);
    },
    setDevicePool: (deviceName: string, poolId: string) => {
      const dev = encodeURIComponent(deviceName);
      const pool = encodeURIComponent(poolId);
      return apiFetch<any>(`/api/devices/${dev}/pool`, { 
        method: 'POST', 
        body: JSON.stringify({ pool_id: poolId }) 
      });
    },
    applyPool: (deviceName: string, poolId: string) => {
      const dev = encodeURIComponent(deviceName);
      const pool = encodeURIComponent(poolId);
      return apiFetch<any>(`/api/devices/${dev}/pool/apply/${pool}`, { method: 'POST' });
    },
    applyFallback: (deviceName: string, poolId: string) => {
      const dev = encodeURIComponent(deviceName);
      const pool = encodeURIComponent(poolId);
      return apiFetch<any>(`/api/devices/${dev}/pool/apply-fallback/${pool}`, { method: 'POST' });
    },
    swapPool: (deviceName: string) => {
      const dev = encodeURIComponent(deviceName);
      return apiFetch<any>(`/api/devices/${dev}/pool/swap`, { method: 'POST' });
    },
    importPool: (deviceName: string, poolData: any) => {
      const dev = encodeURIComponent(deviceName);
      return apiFetch<any>(`/api/devices/${dev}/pool/import`, { 
        method: 'POST', 
        body: JSON.stringify(poolData) 
      });
    },
    
    // Pool scheduling
    getSchedule: (deviceName: string) => {
      const dev = encodeURIComponent(deviceName);
      return apiFetch<any>(`/api/devices/${dev}/schedule`);
    },
    setSchedule: (deviceName: string, schedule: any) => {
      const dev = encodeURIComponent(deviceName);
      return apiFetch<any>(`/api/devices/${dev}/schedule`, { 
        method: 'POST', 
        body: JSON.stringify(schedule) 
      });
    },
    
    // Scheduler control
    schedulerStatus: () => apiFetch<any>('/api/scheduler/status'),
    startScheduler: () => apiFetch<any>('/api/scheduler/start', { method: 'POST' }),
    stopScheduler: () => apiFetch<any>('/api/scheduler/stop', { method: 'POST' }),
  },

  // ============================================================================
  // AXESHED - Profile Scheduling (port 5001)
  // ============================================================================
  
  shed: {
    // Profile scheduling
    getSchedule: (deviceName: string) => {
      const dev = encodeURIComponent(deviceName);
      const url = `${API_BASE_URL}/api/devices/${dev}/schedule`;
      return fetch(url)
        .then(async (res) => {
          if (res.status === 404) {
            return { enabled: false, entries: [] };
          }
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.error || `HTTP ${res.status}`);
          }
          return res.json();
        });
    },
    setSchedule: (deviceName: string, schedule: any) => {
      const dev = encodeURIComponent(deviceName);
      return apiFetch<any>(`/api/devices/${dev}/schedule`, { 
        method: 'POST', 
        body: JSON.stringify(schedule) 
      });
    },
    
    // Profile operations
    getProfiles: (deviceName: string) => {
      const dev = encodeURIComponent(deviceName);
      const url = `${API_BASE_URL}/api/devices/${dev}/profiles`;
      return fetch(url)
        .then(async (res) => {
          if (res.status === 404) {
            return [];
          }
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.error || `HTTP ${res.status}`);
          }
          return res.json();
        });
    },
    applyProfile: (deviceName: string, profileName: string) => {
      const dev = encodeURIComponent(deviceName);
      const profile = encodeURIComponent(profileName);
      return apiFetch<any>(`/api/devices/${dev}/apply/${profile}`, { method: 'POST' });
    },
    
    // Scheduler control
    schedulerStatus: () => apiFetch<any>('/api/scheduler/status'),
    startScheduler: () => apiFetch<any>('/api/scheduler/start', { method: 'POST' }),
    stopScheduler: () => apiFetch<any>('/api/scheduler/stop', { method: 'POST' }),
  },
};

/**
 * Device Model Display Names
 */
export const MODEL_NAMES: Record<string, string> = {
  gamma: 'Gamma (BM1370)',
  supra: 'Supra (BM1368)',
  ultra: 'Ultra (BM1366)',
  hex: 'Hex (BM1366 x6)',
  max: 'Max (BM1397)',
  nerdqaxe: 'NerdQAxe (BM1370)',
  nerdqaxe_plus: 'NerdQAxe+ (BM1370 x2)',
  nerdqaxe_plus_plus: 'NerdQAxe++ (BM1370 x4)',
};

/**
 * Device Model Colors
 */
export const MODEL_COLORS: Record<string, string> = {
  gamma: '#ff3333',
  supra: '#ff9800',
  ultra: '#4caf50',
  hex: '#2196f3',
  max: '#9c27b0',
  nerdqaxe: '#ff3333',
  nerdqaxe_plus: '#ff6666',
  nerdqaxe_plus_plus: '#ff9999',
};

/**
 * Format hashrate for display
 */
export function formatHashrate(hashrate: number): string {
  if (hashrate >= 1000) {
    return `${(hashrate / 1000).toFixed(2)} TH/s`;
  }
  return `${hashrate.toFixed(1)} GH/s`;
}

/**
 * Format power for display
 */
export function formatPower(watts: number): string {
  return `${watts.toFixed(1)} W`;
}

/**
 * Format temperature for display
 */
export function formatTemp(temp: number): string {
  return `${temp.toFixed(1)}°C`;
}

/**
 * Format efficiency for display
 */
export function formatEfficiency(efficiency: number): string {
  return `${efficiency.toFixed(2)} J/TH`;
}

/**
 * Get status color class
 */
export function getStatusColor(online: boolean, warning?: boolean): string {
  if (!online) return 'status-error';
  if (warning) return 'status-warning';
  return 'status-online';
}

/**
 * Format uptime in seconds to human-readable string
 */
export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) {
    return `${days}d ${hours}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}
