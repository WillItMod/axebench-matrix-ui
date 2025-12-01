import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Play, Square, RefreshCw, Clock, Calendar, ArrowLeftRight, Shield } from 'lucide-react';

interface Schedule {
  enabled: boolean;
  entries: ScheduleEntry[];
}

interface ScheduleEntry {
  time: string; // HH:MM format
  profile: string;
  days?: string[]; // ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
}

interface Pool {
  name: string;
  url: string;
  port: number;
  user: string;
  password?: string;
}

interface PoolInfo {
  url: string;
  port: number;
  user: string;
  password: string;
  fallback_url: string;
  fallback_port: number;
  fallback_user: string;
  fallback_password: string;
  is_using_fallback: boolean;
  pool_connected: boolean;
}

export default function Operations() {
  const [devices, setDevices] = useState<any[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [profiles, setProfiles] = useState<any[]>([]);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [schedulerStatus, setSchedulerStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Pool management state
  const [pools, setPools] = useState<Record<string, Pool>>({});
  const [poolInfo, setPoolInfo] = useState<PoolInfo | null>(null);
  const [selectedPool, setSelectedPool] = useState<string>('');
  const [selectedFallbackPool, setSelectedFallbackPool] = useState<string>('');

  // New schedule entry form
  const [newEntry, setNewEntry] = useState<ScheduleEntry>({
    time: '00:00',
    profile: '',
    days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  });

  useEffect(() => {
    loadDevices();
    loadPools();
    const interval = setInterval(() => {
      loadSchedulerStatus();
      if (selectedDevice) {
        loadPoolInfo();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedDevice) {
      loadDeviceData();
      loadPoolInfo();
    }
  }, [selectedDevice]);

  const loadDevices = async () => {
    try {
      const devicesData = await api.devices.list();
      setDevices(devicesData || []);
      if (devicesData && devicesData.length > 0 && !selectedDevice) {
        setSelectedDevice(devicesData[0].name);
      }
    } catch (error) {
      console.error('Failed to load devices:', error);
      toast.error('Failed to load devices');
    } finally {
      setLoading(false);
    }
  };

  const loadDeviceData = async () => {
    if (!selectedDevice) return;

    try {
      const [profilesData, scheduleData] = await Promise.all([
        api.shed.getProfiles(selectedDevice),
        api.shed.getSchedule(selectedDevice),
      ]);
      setProfiles(profilesData || []);
      setSchedule(scheduleData || { enabled: false, entries: [] });
    } catch (error) {
      console.error('Failed to load device data:', error);
      toast.error('Failed to load device data');
    }
  };

  const loadPools = async () => {
    try {
      const poolsData = await api.pool.list();
      // API returns object, not array
      setPools(poolsData || {});
    } catch (error) {
      console.error('Failed to load pools:', error);
    }
  };

  const loadPoolInfo = async () => {
    if (!selectedDevice) return;
    
    try {
      const info = await api.pool.getDevicePool(selectedDevice);
      setPoolInfo(info);
    } catch (error) {
      console.error('Failed to load pool info:', error);
    }
  };

  const loadSchedulerStatus = async () => {
    try {
      const status = await api.shed.schedulerStatus();
      setSchedulerStatus(status);
    } catch (error) {
      console.error('Failed to load scheduler status:', error);
    }
  };

  const handleApplyProfile = async (profileName: string) => {
    if (!selectedDevice) return;

    try {
      await api.shed.applyProfile(selectedDevice, profileName);
      toast.success(`Profile "${profileName}" applied to ${selectedDevice}`);
    } catch (error) {
      console.error('Failed to apply profile:', error);
      toast.error('Failed to apply profile');
    }
  };

  const handleAddScheduleEntry = () => {
    if (!newEntry.profile) {
      toast.error('Please select a profile');
      return;
    }

    const updatedSchedule = {
      ...schedule,
      enabled: schedule?.enabled || false,
      entries: [...(schedule?.entries || []), newEntry],
    };

    setSchedule(updatedSchedule);
    setNewEntry({
      time: '00:00',
      profile: '',
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    });
  };

  const handleRemoveScheduleEntry = (index: number) => {
    if (!schedule) return;

    const updatedSchedule = {
      ...schedule,
      entries: schedule.entries.filter((_, i) => i !== index),
    };

    setSchedule(updatedSchedule);
  };

  const handleSaveSchedule = async () => {
    if (!selectedDevice || !schedule) return;

    try {
      await api.shed.setSchedule(selectedDevice, schedule);
      toast.success('Schedule saved');
    } catch (error) {
      console.error('Failed to save schedule:', error);
      toast.error('Failed to save schedule');
    }
  };

  const handleToggleSchedule = async () => {
    if (!selectedDevice || !schedule) return;

    const updatedSchedule = {
      ...schedule,
      enabled: !schedule.enabled,
    };

    try {
      await api.shed.setSchedule(selectedDevice, updatedSchedule);
      setSchedule(updatedSchedule);
      toast.success(`Schedule ${updatedSchedule.enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.error('Failed to toggle schedule:', error);
      toast.error('Failed to toggle schedule');
    }
  };

  const handleStartScheduler = async () => {
    try {
      await api.shed.startScheduler();
      toast.success('Scheduler started');
      loadSchedulerStatus();
    } catch (error) {
      console.error('Failed to start scheduler:', error);
      toast.error('Failed to start scheduler');
    }
  };

  const handleStopScheduler = async () => {
    try {
      await api.shed.stopScheduler();
      toast.success('Scheduler stopped');
      loadSchedulerStatus();
    } catch (error) {
      console.error('Failed to stop scheduler:', error);
      toast.error('Failed to stop scheduler');
    }
  };

  const handleApplyPool = async () => {
    if (!selectedDevice || !selectedPool) {
      toast.error('Please select a device and pool');
      return;
    }

    try {
      await api.pool.applyPool(selectedDevice, selectedPool);
      toast.success(`Pool applied to ${selectedDevice}`);
      loadPoolInfo();
    } catch (error) {
      console.error('Failed to apply pool:', error);
      toast.error('Failed to apply pool');
    }
  };

  const handleApplyFallbackPool = async () => {
    if (!selectedDevice || !selectedFallbackPool) {
      toast.error('Please select a device and fallback pool');
      return;
    }

    try {
      await api.pool.applyFallback(selectedDevice, selectedFallbackPool);
      toast.success(`Fallback pool applied to ${selectedDevice}`);
      loadPoolInfo();
    } catch (error) {
      console.error('Failed to apply fallback pool:', error);
      toast.error('Failed to apply fallback pool');
    }
  };

  const handleSwapPools = async () => {
    if (!selectedDevice) {
      toast.error('Please select a device');
      return;
    }

    try {
      await api.pool.swapPool(selectedDevice);
      toast.success('Pools swapped successfully');
      loadPoolInfo();
    } catch (error) {
      console.error('Failed to swap pools:', error);
      toast.error('Failed to swap pools');
    }
  };

  const dayLabels: Record<string, string> = {
    mon: 'M',
    tue: 'T',
    wed: 'W',
    thu: 'T',
    fri: 'F',
    sat: 'S',
    sun: 'S',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-matrix-green text-xl animate-pulse">LOADING_OPERATIONS...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-matrix-green mb-2">⚙️ OPERATIONS</h1>
          <p className="text-neon-cyan">Profile Scheduling, Pool Management & Failover</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => { loadDeviceData(); loadPools(); loadPoolInfo(); }} variant="outline" className="gap-2">
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
            {schedulerStatus.next_event && (
              <div className="text-right">
                <div className="text-sm text-gray-400">NEXT_EVENT</div>
                <div className="text-neon-cyan">{schedulerStatus.next_event}</div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Device Selection */}
      <Card className="p-6 bg-black/80 border-neon-cyan">
        <Label>SELECT_DEVICE</Label>
        <div className="flex flex-wrap gap-2 mt-3">
          {devices.map((device) => (
            <Button
              key={device.name}
              onClick={() => setSelectedDevice(device.name)}
              variant={selectedDevice === device.name ? 'default' : 'outline'}
              className={selectedDevice === device.name 
                ? 'bg-[var(--neon-cyan)] text-black hover:bg-[var(--neon-cyan)]/80 border-[var(--neon-cyan)]'
                : 'border-[var(--grid-gray)] text-[var(--text-secondary)] hover:border-[var(--neon-cyan)] hover:text-[var(--neon-cyan)]'
              }
            >
              {device.name}
              <span className="ml-2 text-xs opacity-60">({device.model})</span>
            </Button>
          ))}
        </div>
      </Card>

      {selectedDevice && (
        <>
          {/* Pool Failover Section */}
          <Card className="p-6 bg-black/80 border-red-500">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-6 h-6 text-red-500" />
              <h2 className="text-xl font-bold text-red-500">POOL FAILOVER</h2>
            </div>
            
            {poolInfo && (
              <Card className="p-4 bg-black/90 border-gray-700 mb-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-gray-400 mb-1">MAIN POOL</div>
                    <div className="font-mono text-matrix-green">
                      {poolInfo.url}:{poolInfo.port}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">User: {poolInfo.user}</div>
                    <div className={`text-xs mt-1 ${poolInfo.pool_connected && !poolInfo.is_using_fallback ? 'text-matrix-green' : 'text-gray-500'}`}>
                      {poolInfo.pool_connected && !poolInfo.is_using_fallback ? '● ACTIVE' : '○ INACTIVE'}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-400 mb-1">FALLBACK POOL</div>
                    <div className="font-mono text-neon-cyan">
                      {poolInfo.fallback_url || 'Not configured'}
                      {poolInfo.fallback_port ? `:${poolInfo.fallback_port}` : ''}
                    </div>
                    {poolInfo.fallback_user && (
                      <div className="text-xs text-gray-500 mt-1">User: {poolInfo.fallback_user}</div>
                    )}
                    <div className={`text-xs mt-1 ${poolInfo.is_using_fallback ? 'text-red-500' : 'text-gray-500'}`}>
                      {poolInfo.is_using_fallback ? '● ACTIVE (FAILOVER)' : '○ STANDBY'}
                    </div>
                  </div>
                </div>
              </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <Label>MAIN POOL</Label>
                <div className="flex flex-wrap gap-2 mt-3">
                  {Object.entries(pools).map(([id, pool]) => (
                    <Button
                      key={id}
                      onClick={() => setSelectedPool(id)}
                      variant={selectedPool === id ? 'default' : 'outline'}
                      className={selectedPool === id 
                        ? 'bg-[var(--matrix-green)] text-black hover:bg-[var(--matrix-green)]/80'
                        : 'border-[var(--grid-gray)] text-[var(--text-secondary)] hover:border-[var(--matrix-green)]'
                      }
                    >
                      {pool.name}
                    </Button>
                  ))}
                </div>
                <Button onClick={handleApplyPool} className="w-full mt-3 btn-matrix" disabled={!selectedPool}>
                  APPLY_MAIN_POOL
                </Button>
              </div>

              <div>
                <Label>FALLBACK POOL</Label>
                <div className="flex flex-wrap gap-2 mt-3">
                  {Object.entries(pools).map(([id, pool]) => (
                    <Button
                      key={id}
                      onClick={() => setSelectedFallbackPool(id)}
                      variant={selectedFallbackPool === id ? 'default' : 'outline'}
                      className={selectedFallbackPool === id 
                        ? 'bg-[var(--neon-cyan)] text-black hover:bg-[var(--neon-cyan)]/80'
                        : 'border-[var(--grid-gray)] text-[var(--text-secondary)] hover:border-[var(--neon-cyan)]'
                      }
                    >
                      {pool.name}
                    </Button>
                  ))}
                </div>
                <Button onClick={handleApplyFallbackPool} className="w-full mt-3 bg-[var(--neon-cyan)] text-black hover:bg-[var(--neon-cyan)]/80" disabled={!selectedFallbackPool}>
                  APPLY_FALLBACK_POOL
                </Button>
              </div>
            </div>

            <Button 
              onClick={handleSwapPools} 
              variant="outline" 
              className="w-full gap-2 border-red-500 text-red-500 hover:bg-red-500/10"
            >
              <ArrowLeftRight className="w-4 h-4" />
              SWAP_MAIN_↔_FALLBACK
            </Button>
          </Card>

          {/* Quick Profile Apply */}
          <Card className="p-6 bg-black/80 border-matrix-green">
            <h2 className="text-xl font-bold text-matrix-green mb-4">QUICK_PROFILE_APPLY</h2>
            {profiles.length === 0 ? (
              <div className="text-center py-4 text-gray-500">
                NO_PROFILES_AVAILABLE
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {profiles.map((profile) => (
                  <Button
                    key={profile.name}
                    onClick={() => handleApplyProfile(profile.name)}
                    variant="outline"
                    className="h-auto py-3 flex flex-col items-start"
                  >
                    <div className="font-bold text-matrix-green">{profile.name}</div>
                    {profile.voltage && profile.frequency && (
                      <div className="text-xs text-gray-400 mt-1">
                        {profile.voltage}mV @ {profile.frequency}MHz
                      </div>
                    )}
                  </Button>
                ))}
              </div>
            )}
          </Card>

          {/* Schedule Configuration */}
          <Card className="p-6 bg-black/80 border-neon-cyan">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-neon-cyan">PROFILE_SCHEDULE</h2>
              <Button
                onClick={handleToggleSchedule}
                variant={schedule?.enabled ? 'default' : 'outline'}
                size="sm"
              >
                {schedule?.enabled ? 'ENABLED' : 'DISABLED'}
              </Button>
            </div>

            {/* Add Schedule Entry */}
            <Card className="p-4 bg-black/90 border-gray-700 mb-4">
              <h3 className="font-bold text-matrix-green mb-3">ADD_SCHEDULE_ENTRY</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="entry-time">Time</Label>
                  <Input
                    id="entry-time"
                    type="time"
                    value={newEntry.time}
                    onChange={(e) => setNewEntry({ ...newEntry, time: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="entry-profile">Profile</Label>
                  <Select
                    value={newEntry.profile}
                    onValueChange={(value) => setNewEntry({ ...newEntry, profile: value })}
                  >
                    <SelectTrigger id="entry-profile">
                      <SelectValue placeholder="Select profile..." />
                    </SelectTrigger>
                    <SelectContent>
                      {profiles.map((profile) => (
                        <SelectItem key={profile.name} value={profile.name}>
                          {profile.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button onClick={handleAddScheduleEntry} className="w-full">
                    ADD_ENTRY
                  </Button>
                </div>
              </div>
            </Card>

            {/* Schedule Entries */}
            {schedule && schedule.entries.length > 0 ? (
              <div className="space-y-3">
                {schedule.entries.map((entry, index) => (
                  <Card key={index} className="p-4 bg-black/90 border-gray-700">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <Clock className="w-5 h-5 text-neon-cyan" />
                        <div>
                          <div className="font-bold text-matrix-green">{entry.time}</div>
                          <div className="text-sm text-gray-400">{entry.profile}</div>
                        </div>
                        {entry.days && (
                          <div className="flex gap-1">
                            {entry.days.map((day) => (
                              <span
                                key={day}
                                className="text-xs bg-neon-cyan/20 text-neon-cyan px-2 py-1 rounded"
                              >
                                {dayLabels[day]}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <Button
                        onClick={() => handleRemoveScheduleEntry(index)}
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-400"
                      >
                        REMOVE
                      </Button>
                    </div>
                  </Card>
                ))}
                <Button onClick={handleSaveSchedule} className="w-full">
                  SAVE_SCHEDULE
                </Button>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                NO_SCHEDULE_ENTRIES
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
