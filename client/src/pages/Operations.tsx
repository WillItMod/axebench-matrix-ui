import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Clock, Calendar, Plus, Trash2, AlertCircle, Layers } from 'lucide-react';

type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

const dayLabels: Record<DayKey, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

interface ProfileSlot {
  id: string;
  time: string; // HH:MM
  profile: string;
  days: DayKey[];
}

interface PoolSlot {
  id: string;
  time: string; // HH:MM
  poolId: string;
  mode: 'main' | 'fallback';
  days: DayKey[];
}

interface SchedulePayload {
  enabled: boolean;
  entries: Array<
    | { kind: 'profile'; time: string; profile: string; days: DayKey[] }
    | { kind: 'pool'; time: string; poolId: string; mode: 'main' | 'fallback'; days: DayKey[] }
  >;
}

const generateId = () =>
  (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export default function Operations() {
  const [devices, setDevices] = useState<any[]>([]);
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [pools, setPools] = useState<any[]>([]);
  const [schedulerEnabled, setSchedulerEnabled] = useState(false);
  const [profileSlots, setProfileSlots] = useState<ProfileSlot[]>([]);
  const [poolSlots, setPoolSlots] = useState<PoolSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRemove, setShowRemove] = useState<{ type: 'profile' | 'pool'; id: string } | null>(null);

  const [newProfileSlot, setNewProfileSlot] = useState<ProfileSlot>({
    id: generateId(),
    time: '00:00',
    profile: '',
    days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  });

  const [newPoolSlot, setNewPoolSlot] = useState<PoolSlot>({
    id: generateId(),
    time: '00:00',
    poolId: '',
    mode: 'main',
    days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  });
  const [selectedPoolIds, setSelectedPoolIds] = useState<string[]>([]);

  useEffect(() => {
    loadDevices();
    loadPools();
  }, []);

  useEffect(() => {
    if (selectedDevices.length) {
      const deviceName = selectedDevices[0];
      loadProfiles(deviceName);
      loadSchedule(deviceName);
    }
  }, [selectedDevices]);

  const loadDevices = async () => {
    try {
      const data = await api.devices.list();
      setDevices(data || []);
      if (data?.length && !selectedDevices.length) {
        setSelectedDevices([data[0].name]);
      }
    } catch (error) {
      toast.error('Failed to load devices');
    } finally {
      setLoading(false);
    }
  };

  const loadProfiles = async (deviceName: string) => {
    if (!deviceName) return;
    try {
      const data = await api.shed.getProfiles(deviceName);
      setProfiles(data || []);
    } catch (error) {
      toast.error('Failed to load profiles');
    }
  };

  const loadPools = async () => {
    try {
      const data = await api.pool.list();
      const array = Array.isArray(data) ? data : Object.values(data || {});
      setPools(array);
      if (!selectedPoolIds.length && array.length) {
        const firstId = (array[0] as any).id || (array[0] as any).name;
        if (firstId) setSelectedPoolIds([firstId]);
      }
    } catch (error) {
      toast.error('Failed to load pools');
    }
  };

  const loadSchedule = async (deviceName: string) => {
    if (!deviceName) return;
    try {
      const data = await api.shed.getSchedule(deviceName);
      if (!data) return;

      setSchedulerEnabled(Boolean(data.enabled));

      const entries = (data.entries || []) as SchedulePayload['entries'];
      const pSlots: ProfileSlot[] = [];
      const poSlots: PoolSlot[] = [];

      entries.forEach((entry: any) => {
        if (entry.kind === 'pool') {
          poSlots.push({
            id: crypto.randomUUID(),
            time: entry.time || '00:00',
            poolId: entry.poolId || entry.pool || '',
            mode: entry.mode === 'fallback' ? 'fallback' : 'main',
            days: (entry.days as DayKey[]) || ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
          });
        } else {
          pSlots.push({
            id: crypto.randomUUID(),
            time: entry.time || '00:00',
            profile: entry.profile || '',
            days: (entry.days as DayKey[]) || ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
          });
        }
      });

      // Fallback for legacy schedules lacking kind
      if (!entries?.length && data.entries) {
        const legacy = data.entries as any[];
        legacy.forEach((entry) => {
          pSlots.push({
            id: crypto.randomUUID(),
            time: entry.time || '00:00',
            profile: entry.profile || '',
            days: (entry.days as DayKey[]) || ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
          });
        });
      }

      setProfileSlots(pSlots);
      setPoolSlots(poSlots);
    } catch (error) {
      toast.error('Failed to load schedule');
    }
  };

  const toggleDay = <T extends ProfileSlot | PoolSlot>(slot: T, day: DayKey, setter: (slot: T) => void) => {
    const hasDay = slot.days.includes(day);
    const nextDays = hasDay ? slot.days.filter((d) => d !== day) : [...slot.days, day];
    setter({ ...slot, days: nextDays } as T);
  };

  const handleAddProfileSlot = () => {
    if (!newProfileSlot.profile) {
      toast.error('Select a profile');
      return;
    }
    setProfileSlots([...profileSlots, { ...newProfileSlot, id: crypto.randomUUID() }]);
    setNewProfileSlot({
      id: crypto.randomUUID(),
      time: '00:00',
      profile: '',
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    });
  };

  const handleAddPoolSlot = () => {
    if (!selectedPoolIds.length) {
      toast.error('Select at least one pool');
      return;
    }
    const slotsToAdd = selectedPoolIds.map((poolId) => ({
      ...newPoolSlot,
      id: crypto.randomUUID(),
      poolId,
    }));
    setPoolSlots([...poolSlots, ...slotsToAdd]);
    setSelectedPoolIds([]);
    setNewPoolSlot({
      id: crypto.randomUUID(),
      time: '00:00',
      poolId: '',
      mode: 'main',
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    });
  };

  const handleSaveSchedule = async () => {
    if (!selectedDevices.length) return;
    const payload: SchedulePayload = {
      enabled: schedulerEnabled,
      entries: [
        ...profileSlots.map((slot) => ({
          kind: 'profile' as const,
          time: slot.time,
          profile: slot.profile,
          days: slot.days,
        })),
        ...poolSlots.map((slot) => ({
          kind: 'pool' as const,
          time: slot.time,
          poolId: slot.poolId,
          mode: slot.mode,
          days: slot.days,
        })),
      ],
    };

    try {
      await Promise.all(selectedDevices.map((device) => api.shed.setSchedule(device, payload)));
      toast.success(`Schedule saved for ${selectedDevices.length} device(s)`);
      loadSchedule(selectedDevices[0]);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to save schedule');
    }
  };

  const handleRemoveSlot = (type: 'profile' | 'pool', id: string) => {
    if (type === 'profile') {
      setProfileSlots(profileSlots.filter((slot) => slot.id !== id));
    } else {
      setPoolSlots(poolSlots.filter((slot) => slot.id !== id));
    }
    setShowRemove(null);
  };

  const profileOptions = useMemo(() => profiles.map((p: any) => p.name || p.profile || ''), [profiles]);

  const toggleDevice = (deviceName: string) => {
    setSelectedDevices((prev) =>
      prev.includes(deviceName) ? prev.filter((d) => d !== deviceName) : [...prev, deviceName]
    );
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
      <div className="hud-panel flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-glow-green">OPERATIONS_SCHEDULER</h1>
        <p className="text-[var(--text-secondary)] text-sm">
          Schedule profile modes and pool profiles to run at specific times. Quick applies live on the Pool page.
        </p>
      </div>

      {/* Device selection + enable toggle */}
      <Card className="p-6 bg-black/80 border-[var(--matrix-green)] space-y-4">
        <div className="flex flex-col gap-3">
          <Label className="text-[var(--text-secondary)]">Target Devices</Label>
          <div className="flex flex-wrap gap-2">
            {devices.map((d) => {
              const active = selectedDevices.includes(d.name);
              return (
                <Button
                  key={d.name}
                  size="sm"
                  variant={active ? 'default' : 'outline'}
                  className={active ? 'bg-[var(--neon-cyan)] text-black hover:bg-[var(--neon-cyan)]/80' : 'text-[var(--text-secondary)] hover:text-[var(--neon-cyan)]'}
                  onClick={() => toggleDevice(d.name)}
                >
                  {d.name}
                  <span className="ml-1 text-xs opacity-60">({d.model})</span>
                </Button>
              );
            })}
          </div>
          <div className="flex items-center gap-3 bg-[var(--dark-gray)] border border-[var(--grid-gray)] rounded px-4 py-3">
            <div>
              <div className="text-sm font-bold text-[var(--text-primary)]">SCHEDULER</div>
              <div className="text-xs text-[var(--text-muted)]">Enable or disable for selected devices</div>
            </div>
            <Switch checked={schedulerEnabled} onCheckedChange={setSchedulerEnabled} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSaveSchedule} className="btn-matrix w-full md:w-auto">
              SAVE_SCHEDULE
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setSelectedDevices(devices[0] ? [devices[0].name] : []);
              }}
            >
              RESET_SELECTION
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile schedule */}
        <Card className="p-6 bg-black/80 border-[var(--neon-cyan)] space-y-4">
          <div className="flex items-center gap-3">
            <Layers className="w-5 h-5 text-[var(--neon-cyan)]" />
            <div>
              <h2 className="text-xl font-bold text-[var(--neon-cyan)]">PROFILE_SCHEDULE</h2>
              <p className="text-xs text-[var(--text-muted)]">Set daily times to switch Quiet / Efficient / Balanced / Max.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Time</Label>
              <Input type="time" value={newProfileSlot.time} onChange={(e) => setNewProfileSlot({ ...newProfileSlot, time: e.target.value })} />
            </div>
            <div>
              <Label>Profile</Label>
              <div className="flex flex-wrap gap-2">
                {profileOptions.map((name) => {
                  const active = newProfileSlot.profile === name;
                  return (
                    <Button
                      key={name}
                      type="button"
                      size="sm"
                      variant={active ? 'default' : 'outline'}
                      className={active ? 'bg-[var(--neon-cyan)] text-black hover:bg-[var(--neon-cyan)]/80' : 'text-[var(--text-secondary)] hover:text-[var(--neon-cyan)]'}
                      onClick={() => setNewProfileSlot({ ...newProfileSlot, profile: name })}
                    >
                      {name.toUpperCase()}
                    </Button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-end">
              <Button onClick={handleAddProfileSlot} className="w-full gap-2">
                <Plus className="w-4 h-4" /> ADD
              </Button>
            </div>
          </div>

          <DaySelector slot={newProfileSlot} onToggle={(day) => toggleDay(newProfileSlot, day, (slot) => setNewProfileSlot(slot))} />

          {profileSlots.length === 0 ? (
            <div className="text-[var(--text-muted)] text-sm">No profile schedule entries</div>
          ) : (
            <div className="space-y-3">
              {profileSlots.map((slot) => (
                <ScheduleRow
                  key={slot.id}
                  icon={<Clock className="w-4 h-4 text-[var(--neon-cyan)]" />}
                  title={slot.profile.toUpperCase()}
                  subtitle={slot.time}
                  days={slot.days}
                  onRemove={() => setShowRemove({ type: 'profile', id: slot.id })}
                />
              ))}
            </div>
          )}
        </Card>

        {/* Pool schedule */}
        <Card className="p-6 bg-black/80 border-[var(--matrix-green)] space-y-4">
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-[var(--matrix-green)]" />
            <div>
              <h2 className="text-xl font-bold text-[var(--matrix-green)]">POOL_PROFILE_SCHEDULE</h2>
              <p className="text-xs text-[var(--text-muted)]">Set pool profiles (main/fallback) by time of day.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Time</Label>
              <Input type="time" value={newPoolSlot.time} onChange={(e) => setNewPoolSlot({ ...newPoolSlot, time: e.target.value })} />
            </div>
            <div>
              <Label>Pool Profile</Label>
              <div className="flex flex-wrap gap-2">
                {pools.map((p: any) => {
                  const poolId = p.id || p.name;
                  const active = selectedPoolIds.includes(poolId);
                  return (
                    <Button
                      key={poolId}
                      type="button"
                      size="sm"
                      variant={active ? 'default' : 'outline'}
                      className={active ? 'bg-[var(--matrix-green)] text-black hover:bg-[var(--matrix-green)]/80' : 'text-[var(--text-secondary)] hover:text-[var(--matrix-green)]'}
                      onClick={() =>
                        setSelectedPoolIds((prev) =>
                          prev.includes(poolId) ? prev.filter((id) => id !== poolId) : [...prev, poolId]
                        )
                      }
                    >
                      {p.name}
                    </Button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={newPoolSlot.mode === 'main' ? 'default' : 'outline'}
                className="w-full"
                onClick={() => setNewPoolSlot({ ...newPoolSlot, mode: 'main' })}
              >
                MAIN
              </Button>
              <Button
                variant={newPoolSlot.mode === 'fallback' ? 'default' : 'outline'}
                className="w-full"
                onClick={() => setNewPoolSlot({ ...newPoolSlot, mode: 'fallback' })}
              >
                FALLBACK
              </Button>
            </div>
          </div>

          <DaySelector slot={newPoolSlot} onToggle={(day) => toggleDay(newPoolSlot, day, (slot) => setNewPoolSlot(slot))} />

          {poolSlots.length === 0 ? (
            <div className="text-[var(--text-muted)] text-sm">No pool schedule entries</div>
          ) : (
            <div className="space-y-3">
              {poolSlots.map((slot) => {
                const poolName = pools.find((p: any) => p.id === slot.poolId || p.name === slot.poolId)?.name || slot.poolId;
                return (
                  <ScheduleRow
                    key={slot.id}
                    icon={<Clock className="w-4 h-4 text-[var(--matrix-green)]" />}
                    title={`${poolName} ƒ?½ ${slot.mode.toUpperCase()}`}
                    subtitle={slot.time}
                    days={slot.days}
                    onRemove={() => setShowRemove({ type: 'pool', id: slot.id })}
                  />
                );
              })}
            </div>
          )}

          <Button onClick={handleAddPoolSlot} className="w-full gap-2">
            <Plus className="w-4 h-4" /> ADD POOL SLOT
          </Button>
        </Card>
      </div>

      {/* Remove confirmation */}
      <Dialog open={!!showRemove} onOpenChange={() => setShowRemove(null)}>
        <DialogContent className="matrix-card">
          <DialogHeader>
            <DialogTitle className="text-glow-red flex items-center gap-2">
              <AlertCircle className="w-5 h-5" /> Remove entry?
            </DialogTitle>
            <DialogDescription>This will delete the scheduled entry.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRemove(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (showRemove) {
                  handleRemoveSlot(showRemove.type, showRemove.id);
                }
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DaySelector<T extends { days: DayKey[] }>({ slot, onToggle }: { slot: T; onToggle: (day: DayKey) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {Object.entries(dayLabels).map(([day, label]) => {
        const active = slot.days.includes(day as DayKey);
        return (
          <button
            key={day}
            onClick={() => onToggle(day as DayKey)}
            className={`px-3 py-1 rounded border text-xs font-bold transition ${
              active
                ? 'border-[var(--matrix-green)] text-[var(--matrix-green)] bg-[var(--matrix-green)]/10'
                : 'border-[var(--grid-gray)] text-[var(--text-secondary)] hover:border-[var(--matrix-green)]'
            }`}
            type="button"
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function ScheduleRow({
  icon,
  title,
  subtitle,
  days,
  onRemove,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  days: DayKey[];
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center justify-between bg-[var(--dark-gray)] border border-[var(--grid-gray)] rounded px-3 py-2">
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <div className="text-sm font-bold text-[var(--text-primary)]">{title}</div>
          <div className="text-xs text-[var(--text-muted)]">{subtitle}</div>
        </div>
        <div className="flex gap-1">
          {days.map((d) => (
            <span key={d} className="text-[10px] bg-[var(--grid-gray)] text-[var(--text-secondary)] px-2 py-0.5 rounded">
              {dayLabels[d]}
            </span>
          ))}
        </div>
      </div>
      <button
        onClick={onRemove}
        className="p-1 rounded hover:bg-red-500/10 text-red-400"
        aria-label="Remove"
        type="button"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}
