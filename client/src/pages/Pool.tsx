import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Trash2, Plus, Play, Square, RefreshCw } from 'lucide-react';
import { usePersistentState } from '@/hooks/usePersistentState';

interface Pool {
  id: string;
  name: string;
  url: string;
  user: string;
  password?: string;
  is_default?: boolean;
}

interface PoolPreset {
  name: string;
  url: string;
  description?: string;
}

export default function Pool() {
  const [pools, setPools] = useState<Pool[]>([]);
  const [presets, setPresets] = useState<PoolPreset[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [schedulerStatus, setSchedulerStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDevices, setSelectedDevices] = usePersistentState<string[]>('pool-selected-devices', []);
  const [selectedPoolId, setSelectedPoolId] = usePersistentState<string>('pool-selected-pool', '');
  const [editingPools, setEditingPools] = useState<Record<string, Pool>>({});
  
  // New pool form
  const [newPool, setNewPool] = useState({
    name: '',
    url: '',
    user: '',
    password: '',
  });

  useEffect(() => {
    loadData();
    const interval = setInterval(loadSchedulerStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const [poolsData, presetsData, devicesData] = await Promise.all([
        api.pool.list(),
        api.pool.presets(),
        api.devices.list(),
      ]);
      // Backend may return an object map (axepool) or an array (v3). Normalize to array.
      const poolsArray = Array.isArray(poolsData)
        ? poolsData
        : Object.entries(poolsData || {}).map(([id, pool]: [string, any]) => ({
            id,
            ...pool,
          }));
      console.log('[Pool] Loaded pools:', poolsArray);
      setPools(poolsArray);
      setPresets(presetsData || []);
      setDevices(devicesData || []);
      setSelectedPoolId((prev) => (poolsArray.some((p) => p.id === prev) ? prev : ''));
      // default to no devices selected; respect persisted selection
    } catch (error: any) {
      // If legacy HTML is being served, hint to unset EXPOSE_LEGACY_HTML
      if (typeof error?.message === 'string' && error.message.includes('<html')) {
        console.error('Legacy AxePool UI detected. Ensure EXPOSE_LEGACY_HTML is not set.');
      }
      console.error('Failed to load pool data:', error);
      toast.error('Failed to load pool data');
    } finally {
      setLoading(false);
    }
  };

  const loadSchedulerStatus = async () => {
    try {
      const status = await api.pool.schedulerStatus();
      setSchedulerStatus(status);
    } catch (error) {
      console.error('Failed to load scheduler status:', error);
    }
  };

  const handleCreatePool = async () => {
    if (!newPool.name || !newPool.url || !newPool.user) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      let url = newPool.url;
      let port = 3333; // default stratum port
      const urlMatch = url.match(/^(?:https?:\/\/|stratum\+tcp:\/\/)?([^:\/]+)(?::(\d+))?/);
      if (urlMatch) {
        url = urlMatch[1];
        if (urlMatch[2]) {
          port = parseInt(urlMatch[2]);
        }
      }

      const result = await api.pool.create({
        ...newPool,
        url,
        port,
      });

      toast.success(`Pool "${newPool.name}" created`);
      setNewPool({ name: '', url: '', user: '', password: '' });
      setEditingPools({});
      if (result?.id) {
        setPools((prev) => [...prev, { ...result }]);
        setSelectedPoolId(result.id);
      }
      setTimeout(loadData, 500);
    } catch (error) {
      console.error('Failed to create pool:', error);
      toast.error('Failed to create pool');
    }
  };

  const toggleDevice = (deviceName: string) => {
    setSelectedDevices((prev) =>
      prev.includes(deviceName) ? prev.filter((d) => d !== deviceName) : [...prev, deviceName]
    );
  };

  const isNotFoundError = (error: any) =>
    typeof error?.message === 'string' && error.message.toUpperCase().includes('NOT FOUND');

  const handleBulkApply = async () => {
    if (!selectedPoolId) {
      toast.error('Select a pool first');
      return;
    }
    if (selectedDevices.length === 0) {
      toast.error('Select at least one device');
      return;
    }
    try {
      const results = await Promise.allSettled(
        selectedDevices.map(async (device) => {
          try {
            await api.pool.applyPool(device, selectedPoolId);
            return { device, ok: true };
          } catch (error) {
            return { device, error };
          }
        })
      );

      const failures = results
        .filter((r: any) => r.status === 'fulfilled' ? (r.value?.error) : (r as any).reason)
        .map((r: any) => (r.status === 'fulfilled' ? r.value : r.reason));

      const successCount = results.length - failures.length;

      if (successCount > 0) {
        toast.success(`Applied pool to ${successCount} device(s)`);
      }
      if (failures.length) {
        const notFound = failures.filter((f: any) => isNotFoundError(f?.error || f));
        const other = failures.filter((f: any) => !isNotFoundError(f?.error || f));
        if (notFound.length) {
          toast.warning(`Pool or device not found for ${notFound.length} item(s); skipped.`);
        }
        if (other.length) {
          toast.error('Failed to apply pool to some devices');
        }
      }
    } catch (error) {
      console.error('Failed to bulk apply pool:', error);
      toast.error('Failed to apply pool to all devices');
    }
  };

  const handleDeletePool = async (poolId: string) => {
    if (!confirm('Delete this pool?')) return;

    try {
      await api.pool.delete(poolId);
      toast.success('Pool deleted');
      loadData();
    } catch (error) {
      console.error('Failed to delete pool:', error);
      toast.error('Failed to delete pool');
    }
  };

  const handleApplyPool = async (deviceName: string, poolId: string) => {
    try {
      await api.pool.applyPool(deviceName, poolId);
      toast.success(`Pool applied to ${deviceName}`);
    } catch (error) {
      if (isNotFoundError(error)) {
        toast.warning('Pool or device not found on backend; skipped');
        return;
      }
      console.error('Failed to apply pool:', error);
      toast.error('Failed to apply pool');
    }
  };

  const handleSwapPool = async (deviceName: string) => {
    try {
      await api.pool.swapPool(deviceName);
      toast.success(`Pool swapped for ${deviceName}`);
    } catch (error) {
      console.error('Failed to swap pool:', error);
      toast.error('Failed to swap pool');
    }
  };

  const handleStartScheduler = async () => {
    try {
      await api.pool.startScheduler();
      toast.success('Scheduler started');
      loadSchedulerStatus();
    } catch (error) {
      console.error('Failed to start scheduler:', error);
      toast.error('Failed to start scheduler');
    }
  };

  const handleStopScheduler = async () => {
    try {
      await api.pool.stopScheduler();
      toast.success('Scheduler stopped');
      loadSchedulerStatus();
    } catch (error) {
      console.error('Failed to stop scheduler:', error);
      toast.error('Failed to stop scheduler');
    }
  };

  const startEdit = (pool: Pool) => {
    setEditingPools((prev) => ({ ...prev, [pool.id]: { ...pool } }));
  };

  const updateEditingField = (id: string, field: keyof Pool, value: string) => {
    setEditingPools((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || pools.find((p) => p.id === id) || {}), [field]: value },
    }));
  };

  const saveEdit = async (id: string) => {
    const data = editingPools[id];
    if (!data) return;
    try {
      await api.pool.update(id, data);
      toast.success('Pool updated');
      setEditingPools((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      loadData();
    } catch (error) {
      toast.error('Failed to update pool');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-matrix-green text-xl animate-pulse">LOADING_POOL_DATA...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-matrix-green mb-2">🎱 AXEPOOL</h1>
          <p className="text-neon-cyan">Pool Management & Switching</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={loadData} variant="outline" className="gap-2">
            <RefreshCw className="w-4 h-4" />
            REFRESH
          </Button>
          {schedulerStatus?.running ? (
            <Button onClick={handleStopScheduler} variant="destructive" className="gap-2">
              <Square className="w-4 h-4" />
              STOP_SCHEDULER
            </Button>
          ) : (
            <Button onClick={handleStartScheduler} className="gap-2">
              <Play className="w-4 h-4" />
              START_SCHEDULER
            </Button>
          )}
        </div>
      </div>

      {/* Scheduler Status */}
      {schedulerStatus && (
        <Card className="p-4 bg-black/80 border-matrix-green">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-400">SCHEDULER_STATUS</div>
              <div className={`text-lg font-bold ${schedulerStatus.running ? 'text-matrix-green' : 'text-gray-500'}`}>
                {schedulerStatus.running ? '● RUNNING' : '○ STOPPED'}
              </div>
            </div>
            {schedulerStatus.next_switch && (
              <div className="text-right">
                <div className="text-sm text-gray-400">NEXT_SWITCH</div>
                <div className="text-neon-cyan">{schedulerStatus.next_switch}</div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Create New Pool */}
      <Card className="p-6 bg-black/80 border-matrix-green">
        <h2 className="text-xl font-bold text-matrix-green mb-4">CREATE_NEW_POOL</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="pool-name">Pool Name *</Label>
            <Input
              id="pool-name"
              value={newPool.name}
              onChange={(e) => setNewPool({ ...newPool, name: e.target.value })}
              placeholder="e.g., Solo CK Pool"
            />
          </div>
          <div>
            <Label htmlFor="pool-url">Pool URL *</Label>
            <Input
              id="pool-url"
              value={newPool.url}
              onChange={(e) => setNewPool({ ...newPool, url: e.target.value })}
              placeholder="stratum+tcp://solo.ckpool.org:3333"
            />
          </div>
          <div>
            <Label htmlFor="pool-user">User/Wallet *</Label>
            <Input
              id="pool-user"
              value={newPool.user}
              onChange={(e) => setNewPool({ ...newPool, user: e.target.value })}
              placeholder="bc1q..."
            />
          </div>
          <div>
            <Label htmlFor="pool-password">Password (optional)</Label>
            <Input
              id="pool-password"
              type="password"
              value={newPool.password}
              onChange={(e) => setNewPool({ ...newPool, password: e.target.value })}
              placeholder="x"
            />
          </div>
        </div>
        <Button onClick={handleCreatePool} variant="default" className="mt-4 gap-2 uppercase tracking-wide shadow-[0_0_16px_hsla(var(--primary),0.3)]">
          <Plus className="w-4 h-4" />
          CREATE_POOL
        </Button>
      </Card>

      {/* Pool Presets */}
      {presets.length > 0 && (
        <Card className="p-6 gridrunner-surface border border-transparent shadow-chrome">
          <h2 className="text-xl font-bold text-glow-cyan mb-4">POOL_PRESETS</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {presets.map((preset, idx) => (
              <Card key={idx} className="p-4 gridrunner-surface border border-transparent shadow-soft">
                <div className="font-bold text-[hsl(var(--primary))]">{preset.name}</div>
                <div className="text-sm text-muted-foreground mt-1">{preset.url}</div>
                {preset.description && (
                  <div className="text-xs text-muted-foreground mt-2">{preset.description}</div>
                )}
              </Card>
            ))}
          </div>
        </Card>
      )}

      {/* Quick Apply (multi-device) */}
      {devices.length > 0 && pools.length > 0 && (
        <Card className="p-6 gridrunner-surface border border-transparent shadow-chrome space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="text-2xl font-bold text-glow-cyan">QUICK_POOL_APPLY</div>
          </div>

          <div className="mb-3">
            <div className="text-xs text-[var(--text-secondary)] mb-2">SELECT_DEVICES</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {devices.map((device) => {
                const active = selectedDevices.includes(device.name);
                return (
                  <Button
                    key={device.name}
                    onClick={() => toggleDevice(device.name)}
                    variant={active ? 'default' : 'outline'}
                    className={`w-full justify-start text-left flex-col items-start gap-1 uppercase tracking-wide ${active ? 'shadow-[0_0_16px_hsla(var(--primary),0.35)]' : ''}`}
                  >
                    <span className="font-bold text-sm">{device.name}</span>
                    <span className="text-xs text-muted-foreground">{device.model}</span>
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs text-[var(--text-secondary)]">SELECT_POOL</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {pools.map((pool) => (
                <Button
                  key={pool.id}
                  onClick={() => setSelectedPoolId(pool.id)}
                  variant={selectedPoolId === pool.id ? 'accent' : 'outline'}
                  className="w-full text-sm py-3 uppercase tracking-wide"
                  aria-pressed={selectedPoolId === pool.id}
                >
                  {pool.name}
                </Button>
              ))}
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleBulkApply} variant="default" className="uppercase tracking-wide shadow-[0_0_16px_hsla(var(--primary),0.3)]" disabled={!selectedPoolId || selectedDevices.length === 0}>
                APPLY_TO_SELECTED
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedDevices([]);
                  setSelectedPoolId('');
                }}
              >
                CLEAR_SELECTION
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Existing Pools */}
      <Card className="p-6 bg-black/80 border-matrix-green">
        <h2 className="text-xl font-bold text-matrix-green mb-4">CONFIGURED_POOLS</h2>
        {pools.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            NO_POOLS_CONFIGURED
          </div>
        ) : (
          <div className="space-y-4">
            {pools.map((pool) => (
              <Card key={pool.id} className="p-4 bg-black/90 border-gray-700">
                <div className="flex flex-col gap-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {editingPools[pool.id] ? (
                          <Input
                            value={editingPools[pool.id].name}
                            onChange={(e) => updateEditingField(pool.id, 'name', e.target.value)}
                            className="w-48"
                          />
                        ) : (
                          <div className="font-bold text-matrix-green">{pool.name}</div>
                        )}
                        {pool.is_default && (
                          <span className="text-xs bg-matrix-green/20 text-matrix-green px-2 py-1 rounded">
                            DEFAULT
                          </span>
                        )}
                      </div>
                      {editingPools[pool.id] ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                          <Input
                            value={editingPools[pool.id].url}
                            onChange={(e) => updateEditingField(pool.id, 'url', e.target.value)}
                            placeholder="stratum url"
                          />
                          <Input
                            value={editingPools[pool.id].user}
                            onChange={(e) => updateEditingField(pool.id, 'user', e.target.value)}
                            placeholder="username"
                          />
                          <Input
                            value={editingPools[pool.id].password || ''}
                            onChange={(e) => updateEditingField(pool.id, 'password', e.target.value)}
                            placeholder="password"
                          />
                        </div>
                      ) : (
                        <>
                          <div className="text-sm text-gray-400 mt-1">{pool.url}</div>
                          <div className="text-xs text-gray-500 mt-1">User: {pool.user}</div>
                        </>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {editingPools[pool.id] ? (
                        <>
                          <Button size="sm" variant="default" className="uppercase tracking-wide" onClick={() => saveEdit(pool.id)}>
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setEditingPools((prev) => {
                                const copy = { ...prev };
                                delete copy[pool.id];
                                return copy;
                              })
                            }
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => startEdit(pool)}>
                          Edit
                        </Button>
                      )}
                      <Button
                        onClick={() => handleDeletePool(pool.id)}
                        variant="destructive"
                        size="sm"
                        className="shadow-[0_0_14px_rgba(239,68,68,0.35)]"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Card>

      {/* Per-device pools (similar to Profiles) */}
      {selectedDevices.length > 0 && pools.length > 0 && (
        <Card className="p-6 gridrunner-surface border border-transparent shadow-chrome space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[var(--text-primary)]">DEVICE_POOLS</h2>
            <Button size="sm" variant="outline" onClick={() => loadData()}>
              <RefreshCw className="w-4 h-4 mr-1" /> RELOAD
            </Button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {selectedDevices.map((deviceName) => {
              const device = devices.find((d) => d.name === deviceName);
              const currentPool =
                (device?.status as any)?.poolName ||
                device?.pool ||
                (device?.status as any)?.pool ||
                'N/A';
              return (
                <Card key={deviceName} className="p-4 gridrunner-surface border border-transparent shadow-soft space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-[var(--text-primary)]">{deviceName}</div>
                      <div className="text-xs text-[var(--text-secondary)]">{device?.model || 'Unknown model'}</div>
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">
                      Current: <span className="text-[var(--neon-cyan)]">{currentPool}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Select
                      value={selectedPoolId || ''}
                      onValueChange={(val) => setSelectedPoolId(val)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="SELECT_POOL" />
                      </SelectTrigger>
                      <SelectContent>
                        {pools.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        className="flex-1 uppercase tracking-wide shadow-[0_0_14px_hsla(var(--primary),0.3)]"
                        onClick={() => selectedPoolId && handleApplyPool(deviceName, selectedPoolId)}
                        disabled={!selectedPoolId}
                      >
                        APPLY_POOL
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => handleSwapPool(deviceName)}
                      >
                        SWAP_POOL
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
