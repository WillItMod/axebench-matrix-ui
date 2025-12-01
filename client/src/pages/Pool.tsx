import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Trash2, Plus, Play, Square, RefreshCw } from 'lucide-react';

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
      // Ensure poolsData is an array
      const poolsArray = Array.isArray(poolsData) ? poolsData : [];
      setPools(poolsArray);
      setPresets(presetsData || []);
      setDevices(devicesData || []);
    } catch (error) {
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
      // Parse URL to extract host and port
      let url = newPool.url;
      let port = 3333; // default stratum port
      
      // Handle full URL format (http://host:port or stratum+tcp://host:port)
      const urlMatch = url.match(/^(?:https?:\/\/|stratum\+tcp:\/\/)?([^:\/]+)(?::(\d+))?/);
      if (urlMatch) {
        url = urlMatch[1]; // host only
        if (urlMatch[2]) {
          port = parseInt(urlMatch[2]); // extracted port
        }
      }
      
      // Create pool with separated URL and port
      await api.pool.create({
        ...newPool,
        url,
        port
      });
      
      toast.success(`Pool "${newPool.name}" created`);
      setNewPool({ name: '', url: '', user: '', password: '' });
      loadData();
    } catch (error) {
      console.error('Failed to create pool:', error);
      toast.error('Failed to create pool');
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
        <Button onClick={handleCreatePool} className="mt-4 gap-2">
          <Plus className="w-4 h-4" />
          CREATE_POOL
        </Button>
      </Card>

      {/* Pool Presets */}
      {presets.length > 0 && (
        <Card className="p-6 bg-black/80 border-neon-cyan">
          <h2 className="text-xl font-bold text-neon-cyan mb-4">POOL_PRESETS</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {presets.map((preset, idx) => (
              <Card key={idx} className="p-4 bg-black/90 border-gray-700">
                <div className="font-bold text-matrix-green">{preset.name}</div>
                <div className="text-sm text-gray-400 mt-1">{preset.url}</div>
                {preset.description && (
                  <div className="text-xs text-gray-500 mt-2">{preset.description}</div>
                )}
              </Card>
            ))}
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
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className="font-bold text-matrix-green">{pool.name}</div>
                      {pool.is_default && (
                        <span className="text-xs bg-matrix-green/20 text-matrix-green px-2 py-1 rounded">
                          DEFAULT
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-400 mt-1">{pool.url}</div>
                    <div className="text-xs text-gray-500 mt-1">User: {pool.user}</div>
                  </div>
                  <Button
                    onClick={() => handleDeletePool(pool.id)}
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Card>

      {/* Device Pool Assignment */}
      {devices.length > 0 && (
        <Card className="p-6 bg-black/80 border-neon-cyan">
          <h2 className="text-xl font-bold text-neon-cyan mb-4">DEVICE_POOL_ASSIGNMENT</h2>
          <div className="space-y-4">
            {devices.map((device) => (
              <Card key={device.name} className="p-4 bg-black/90 border-gray-700">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-matrix-green">{device.name}</div>
                    <div className="text-sm text-gray-400">{device.model}</div>
                  </div>
                  <div className="flex gap-2">
                    <Select
                      onValueChange={(value) => handleApplyPool(device.name, value)}
                    >
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Select pool..." />
                      </SelectTrigger>
                      <SelectContent>
                        {pools.map((pool) => (
                          <SelectItem key={pool.id} value={pool.id}>
                            {pool.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={() => handleSwapPool(device.name)}
                      variant="outline"
                      size="sm"
                    >
                      SWAP
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
