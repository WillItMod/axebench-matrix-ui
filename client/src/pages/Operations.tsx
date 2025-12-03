import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Calendar, Layers, Play, RefreshCcw, Square, Trash2 } from 'lucide-react';

type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

type ProfileBlock = { id: string; start: string; end: string; profile: string; days: DayKey[] };
type PoolBlock = { id: string; start: string; end: string; pool: string; days: DayKey[] };

type ProfileScheduleState = { enabled: boolean; defaultProfile: string; blocks: ProfileBlock[] };
type PoolScheduleState = { enabled: boolean; defaultPool: string; blocks: PoolBlock[] };

type DeviceScheduleState = { profile: ProfileScheduleState; pool: PoolScheduleState };

const dayLabels: Record<DayKey, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

const fullDayNames: Record<DayKey, string> = {
  mon: 'monday',
  tue: 'tuesday',
  wed: 'wednesday',
  thu: 'thursday',
  fri: 'friday',
  sat: 'saturday',
  sun: 'sunday',
};

const DEFAULT_PROFILES = ['Quiet', 'Efficient', 'Balanced', 'Max'];
const allDays: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const generateId = () =>
  typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function'
    ? (crypto as any).randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const toDayKeys = (days?: string[]): DayKey[] => {
  if (!days || !Array.isArray(days) || days.length === 0) return allDays;
  return days
    .map((d) => d.toLowerCase())
    .map((d) => Object.entries(fullDayNames).find(([, full]) => full === d)?.[0] as DayKey)
    .filter(Boolean);
};

const toFullDays = (days: DayKey[]) => days.map((d) => fullDayNames[d]);

const blankProfileSchedule = (defaultProfile = ''): ProfileScheduleState => ({
  enabled: false,
  defaultProfile,
  blocks: [],
});

const blankPoolSchedule = (defaultPool = ''): PoolScheduleState => ({
  enabled: false,
  defaultPool,
  blocks: [],
});

export default function Operations() {
  const [devices, setDevices] = useState<any[]>([]);
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<string[]>(DEFAULT_PROFILES);
  const [pools, setPools] = useState<Array<{ id: string; name: string }>>([]);
  const [deviceSchedules, setDeviceSchedules] = useState<Record<string, DeviceScheduleState>>({});
  const [profileSchedule, setProfileSchedule] = useState<ProfileScheduleState>(blankProfileSchedule());
  const [poolSchedule, setPoolSchedule] = useState<PoolScheduleState>(blankPoolSchedule());
  const [shedServiceRunning, setShedServiceRunning] = useState<boolean | null>(null);
  const [poolServiceRunning, setPoolServiceRunning] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const settingFromLoad = useRef(false);

  useEffect(() => {
    loadDevices();
    loadPools();
    loadSchedulersStatus();
  }, []);

  useEffect(() => {
    if (!selectedDevices.length) {
      setProfileSchedule(blankProfileSchedule());
      setPoolSchedule(blankPoolSchedule());
      return;
    }
    const first = selectedDevices[0];
    loadProfiles(first);
    loadSchedules(selectedDevices);
  }, [selectedDevices]);

  useEffect(() => {
    if (settingFromLoad.current) {
      settingFromLoad.current = false;
      return;
    }
    setDirty(true);
  }, [profileSchedule, poolSchedule]);

  const loadDevices = async () => {
    try {
      const data = await api.devices.list();
      setDevices(data || []);
      if (data?.length) {
        setSelectedDevices([data[0].name]);
      }
    } catch {
      toast.error('Failed to load devices');
    } finally {
      setLoading(false);
    }
  };

  const loadProfiles = async (deviceName: string) => {
    try {
      const data = await api.shed.getProfiles(deviceName);
      const names = Array.isArray(data) ? data.map((p: any) => p.name || p.profile).filter(Boolean) : [];
      setProfiles(names.length ? names : DEFAULT_PROFILES);
    } catch {
      setProfiles(DEFAULT_PROFILES);
    }
  };

  const loadPools = async () => {
    try {
      const data = await api.pool.list();
      const array = Array.isArray(data)
        ? data
        : Object.entries(data || {}).map(([id, item]: any) => ({ id, ...(item as any) }));
      const mapped = array.map((p: any) => ({ id: p.id || p.name, name: p.name || p.id })).filter((p) => p.id);
      setPools(mapped);
      if (!poolSchedule.defaultPool && mapped[0]) {
        setPoolSchedule((prev) => ({ ...prev, defaultPool: mapped[0].id }));
      }
    } catch {
      toast.error('Failed to load pools');
    }
  };

  const loadSchedulersStatus = async () => {
    try {
      const status = await api.shed.schedulerStatus();
      setShedServiceRunning(!!status?.running);
    } catch {
      setShedServiceRunning(false);
    }
    try {
      const status = await api.pool.schedulerStatus();
      setPoolServiceRunning(!!status?.running);
    } catch {
      setPoolServiceRunning(false);
    }
  };

  const mapProfileFromApi = (payload: any): ProfileScheduleState => {
    const defaultProfile = payload?.default_profile || '';
    const blocks: ProfileBlock[] = (payload?.time_blocks || []).map((block: any) => ({
      id: generateId(),
      start: block.start || '00:00',
      end: block.end || '23:59',
      profile: block.profile || defaultProfile || '',
      days: toDayKeys(block.days),
    }));
    return { enabled: !!payload?.enabled, defaultProfile, blocks };
  };

  const mapPoolFromApi = (payload: any): PoolScheduleState => {
    const defaultPool = payload?.default_pool || '';
    const blocks: PoolBlock[] = (payload?.time_blocks || []).map((block: any) => ({
      id: generateId(),
      start: block.start || '00:00',
      end: block.end || '23:59',
      pool: block.pool || defaultPool || '',
      days: toDayKeys(block.days),
    }));
    return { enabled: !!payload?.enabled, defaultPool, blocks };
  };

  const mapProfileToApi = (schedule: ProfileScheduleState) => ({
    enabled: schedule.enabled,
    default_profile: schedule.defaultProfile || null,
    time_blocks: schedule.blocks.map((b) => ({
      start: b.start || '00:00',
      end: b.end || '23:59',
      profile: b.profile,
      days: toFullDays(b.days),
    })),
  });

  const mapPoolToApi = (schedule: PoolScheduleState) => ({
    enabled: schedule.enabled,
    default_pool: schedule.defaultPool || null,
    time_blocks: schedule.blocks.map((b) => ({
      start: b.start || '00:00',
      end: b.end || '23:59',
      pool: b.pool,
      days: toFullDays(b.days),
    })),
  });

  const loadSchedules = async (devicesToLoad: string[]) => {
    if (!devicesToLoad.length) return;
    const promises = devicesToLoad.map(async (name) => {
      try {
        const [profileRaw, poolRaw] = await Promise.all([
          api.shed.getSchedule(name),
          api.pool.getSchedule(name),
        ]);
        const profile = profileRaw?.skipped ? blankProfileSchedule() : mapProfileFromApi(profileRaw);
        const pool = poolRaw?.skipped ? blankPoolSchedule() : mapPoolFromApi(poolRaw);
        return { name, profile, pool };
      } catch (error) {
        toast.warning(`Schedule unavailable for ${name}`);
        return { name, profile: blankProfileSchedule(), pool: blankPoolSchedule() };
      }
    });

    const results = await Promise.all(promises);
    setDeviceSchedules((prev) => {
      const next = { ...prev } as Record<string, DeviceScheduleState>;
      results.forEach(({ name, profile, pool }) => {
        next[name] = { profile, pool };
      });
      return next;
    });

    const primary = results[0];
    if (primary && !dirty) {
      settingFromLoad.current = true;
      setProfileSchedule(primary.profile);
      setPoolSchedule(primary.pool);
      setDirty(false);
    }
  };

  const addProfileBlock = () => {
    const profile = profileSchedule.defaultProfile || profiles[0] || '';
    const newBlock: ProfileBlock = {
      id: generateId(),
      start: '00:00',
      end: '06:00',
      profile,
      days: [...allDays],
    };
    setProfileSchedule((prev) => ({ ...prev, blocks: [...prev.blocks, newBlock] }));
  };

  const addPoolBlock = () => {
    const pool = poolSchedule.defaultPool || pools[0]?.id || '';
    const newBlock: PoolBlock = {
      id: generateId(),
      start: '00:00',
      end: '06:00',
      pool,
      days: [...allDays],
    };
    setPoolSchedule((prev) => ({ ...prev, blocks: [...prev.blocks, newBlock] }));
  };

  const updateProfileBlock = (id: string, field: keyof ProfileBlock, value: string | DayKey[]) => {
    setProfileSchedule((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => (b.id === id ? { ...b, [field]: value } : b)),
    }));
  };

  const updatePoolBlock = (id: string, field: keyof PoolBlock, value: string | DayKey[]) => {
    setPoolSchedule((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => (b.id === id ? { ...b, [field]: value } : b)),
    }));
  };

  const removeProfileBlock = (id: string) => {
    setProfileSchedule((prev) => ({ ...prev, blocks: prev.blocks.filter((b) => b.id !== id) }));
  };

  const removePoolBlock = (id: string) => {
    setPoolSchedule((prev) => ({ ...prev, blocks: prev.blocks.filter((b) => b.id !== id) }));
  };

  const toggleProfileDay = (block: ProfileBlock, day: DayKey) => {
    const has = block.days.includes(day);
    const nextDays = has ? block.days.filter((d) => d !== day) : [...block.days, day];
    updateProfileBlock(block.id, 'days', nextDays);
  };

  const togglePoolDay = (block: PoolBlock, day: DayKey) => {
    const has = block.days.includes(day);
    const nextDays = has ? block.days.filter((d) => d !== day) : [...block.days, day];
    updatePoolBlock(block.id, 'days', nextDays);
  };

  const handleSave = async () => {
    if (!selectedDevices.length) {
      toast.error('Select at least one device');
      return;
    }

    setSaving(true);
    const profilePayload = mapProfileToApi(profileSchedule);
    const poolPayload = mapPoolToApi(poolSchedule);

    const results = await Promise.allSettled(
      selectedDevices.map(async (device) => {
        const [shedRes, poolRes] = await Promise.allSettled([
          api.shed.setSchedule(device, profilePayload),
          api.pool.setSchedule(device, poolPayload),
        ]);
        return { device, shedRes, poolRes };
      })
    );

    const success = results.filter(
      (r) =>
        r.status === 'fulfilled' &&
        (r as any).value.shedRes.status === 'fulfilled' &&
        (r as any).value.poolRes.status === 'fulfilled'
    ).length;

    const failures = results.length - success;

    selectedDevices.forEach((name) => {
      setDeviceSchedules((prev) => ({
        ...prev,
        [name]: { profile: profileSchedule, pool: poolSchedule },
      }));
    });

    if (success) toast.success(`Saved schedules to ${success} device(s)`);
    if (failures) toast.warning(`${failures} device(s) did not accept schedules`);
    setDirty(false);
    setSaving(false);
  };

  const toggleService = async (kind: 'shed' | 'pool', start: boolean) => {
    try {
      if (kind === 'shed') {
        start ? await api.shed.startScheduler() : await api.shed.stopScheduler();
        setShedServiceRunning(start);
      } else {
        start ? await api.pool.startScheduler() : await api.pool.stopScheduler();
        setPoolServiceRunning(start);
      }
      toast.success(`${kind === 'shed' ? 'Profile' : 'Pool'} scheduler ${start ? 'started' : 'stopped'}`);
    } catch {
      toast.error('Failed to update scheduler service');
    }
  };

  const profileOptions = useMemo(() => (profiles.length ? profiles : DEFAULT_PROFILES), [profiles]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-matrix-green text-xl animate-pulse">LOADING_OPERATIONS...</div>
      </div>
    );
  }

  const selectedList = selectedDevices.map((name) => ({
    name,
    schedule: deviceSchedules[name],
  }));

  const targetLabel = selectedDevices.length
    ? `${selectedDevices.length} device(s): ${selectedDevices.join(', ')}`
    : 'None selected';

  return (
    <div className="space-y-6">
      <div className="hud-panel flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-glow-green">Operations & Scheduling</h1>
        <p className="text-[var(--text-secondary)] text-sm">
          Choose devices, set tuning and pool schedules, and push them together.
        </p>
      </div>

      <Card className="p-6 bg-black/80 border-[var(--matrix-green)] space-y-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2 items-center">
            <Label className="text-[var(--text-secondary)] mr-2">Devices</Label>
            <Button size="sm" variant="outline" onClick={() => setSelectedDevices(devices.map((d) => d.name))}>
              Select all
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSelectedDevices([])}>
              Clear
            </Button>
            <Button size="sm" variant="ghost" onClick={() => loadSchedules(selectedDevices)}>
              <RefreshCcw className="w-4 h-4 mr-1" /> Reload schedules
            </Button>
            {dirty && <span className="text-xs text-amber-400">Unsaved changes</span>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-auto">
            {devices.map((d) => {
              const active = selectedDevices.includes(d.name);
              return (
                <label
                  key={d.name}
                  className={`flex items-center gap-2 rounded border px-3 py-2 cursor-pointer ${
                    active ? 'border-[var(--neon-cyan)] bg-[var(--neon-cyan)]/10' : 'border-[var(--grid-gray)] bg-black/40'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="accent-[var(--neon-cyan)]"
                    checked={active}
                    onChange={() =>
                      setSelectedDevices((prev) =>
                        prev.includes(d.name) ? prev.filter((n) => n !== d.name) : [...prev, d.name]
                      )
                    }
                  />
                  <div className="flex flex-col leading-tight">
                    <span className="text-sm text-[var(--text-primary)]">{d.name}</span>
                    <span className="text-[11px] text-[var(--text-muted)]">{d.model}</span>
                  </div>
                </label>
              );
            })}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ServiceToggle
              title="Profile scheduler service"
              running={shedServiceRunning}
              onStart={() => toggleService('shed', true)}
              onStop={() => toggleService('shed', false)}
            />
            <ServiceToggle
              title="Pool scheduler service"
              running={poolServiceRunning}
              onStart={() => toggleService('pool', true)}
              onStop={() => toggleService('pool', false)}
            />
          </div>
        </div>
      </Card>

      <Card className="p-6 bg-black/80 border-[var(--grid-gray)] space-y-4">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-bold text-[var(--neon-cyan)]">Schedule editor</h2>
            <p className="text-xs text-[var(--text-muted)]">Targets: {targetLabel}</p>
          </div>
          <Button onClick={handleSave} disabled={saving || !selectedDevices.length} className="btn-matrix">
            {saving ? 'Saving...' : selectedDevices.length ? 'Save to selected' : 'Select devices to save'}
          </Button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card className="p-4 bg-[var(--dark-gray)] border-[var(--neon-cyan)] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-[var(--neon-cyan)]" />
                <div>
                  <div className="text-sm font-bold text-[var(--neon-cyan)]">Tuning profiles</div>
                  <div className="text-xs text-[var(--text-muted)]">When off, blocks are saved but not executed.</div>
                </div>
              </div>
              <Switch
                checked={profileSchedule.enabled}
                onCheckedChange={(v) => {
                  settingFromLoad.current = true;
                  setProfileSchedule((prev) => ({ ...prev, enabled: v }));
                  setDirty(true);
                }}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Default profile (when no block matches)</Label>
                <Select
                  value={profileSchedule.defaultProfile || ''}
                  onValueChange={(val) => setProfileSchedule((prev) => ({ ...prev, defaultProfile: val }))}
                >
                  <SelectTrigger className="w-full bg-black border-[var(--grid-gray)]">
                    <SelectValue placeholder="Choose default profile" />
                  </SelectTrigger>
                  <SelectContent>
                    {profileOptions.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button variant="outline" onClick={addProfileBlock} className="w-full">
                  Add time block
                </Button>
              </div>
            </div>

            <BlockTable
              type="profile"
              blocks={profileSchedule.blocks}
              profileOptions={profileOptions}
              onChange={(id, field, value) => updateProfileBlock(id, field as keyof ProfileBlock, value)}
              onRemove={removeProfileBlock}
              onToggleDay={toggleProfileDay}
            />
          </Card>

          <Card className="p-4 bg-[var(--dark-gray)] border-[var(--matrix-green)] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[var(--matrix-green)]" />
                <div>
                  <div className="text-sm font-bold text-[var(--matrix-green)]">Pool profiles</div>
                  <div className="text-xs text-[var(--text-muted)]">When off, blocks are saved but not executed.</div>
                </div>
              </div>
              <Switch
                checked={poolSchedule.enabled}
                onCheckedChange={(v) => {
                  settingFromLoad.current = true;
                  setPoolSchedule((prev) => ({ ...prev, enabled: v }));
                  setDirty(true);
                }}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Default pool</Label>
                <Select
                  value={poolSchedule.defaultPool || ''}
                  onValueChange={(val) => setPoolSchedule((prev) => ({ ...prev, defaultPool: val }))}
                >
                  <SelectTrigger className="w-full bg-black border-[var(--grid-gray)]">
                    <SelectValue placeholder="Choose default pool" />
                  </SelectTrigger>
                  <SelectContent>
                    {pools.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name || p.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button variant="outline" onClick={addPoolBlock} className="w-full">
                  Add time block
                </Button>
              </div>
            </div>

            <BlockTable
              type="pool"
              blocks={poolSchedule.blocks}
              poolOptions={pools}
              onChange={(id, field, value) => updatePoolBlock(id, field as keyof PoolBlock, value)}
              onRemove={removePoolBlock}
              onToggleDay={togglePoolDay}
            />
          </Card>
        </div>
      </Card>

      <Card className="p-6 bg-black/80 border-[var(--grid-gray)] space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Per-device schedules</h2>
          <Button size="sm" variant="outline" onClick={() => loadSchedules(selectedDevices)}>
            <RefreshCcw className="w-4 h-4 mr-1" /> Reload selected
          </Button>
        </div>
        {selectedList.length === 0 && <div className="text-[var(--text-muted)] text-sm">No devices selected.</div>}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {selectedList.map(({ name, schedule }) => (
            <Card key={name} className="p-4 bg-[var(--dark-gray)] border-[var(--grid-gray)] space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold text-[var(--text-primary)]">{name}</div>
                {!schedule && <span className="text-xs text-amber-400">Not loaded</span>}
              </div>
              {schedule && (
                <div className="space-y-3 text-xs">
                  <div>
                    <div className="font-semibold text-[var(--neon-cyan)]">Tuning</div>
                    <div className="text-[var(--text-muted)]">
                      {schedule.profile.enabled ? 'Enabled' : 'Disabled'} • Default: {schedule.profile.defaultProfile || 'None'}
                    </div>
                    <ScheduleList blocks={schedule.profile.blocks} labelKey="profile" />
                  </div>
                  <div>
                    <div className="font-semibold text-[var(--matrix-green)]">Pool</div>
                    <div className="text-[var(--text-muted)]">
                      {schedule.pool.enabled ? 'Enabled' : 'Disabled'} • Default: {schedule.pool.defaultPool || 'None'}
                    </div>
                    <ScheduleList blocks={schedule.pool.blocks} labelKey="pool" />
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      </Card>
    </div>
  );
}

function ServiceToggle({
  title,
  running,
  onStart,
  onStop,
}: {
  title: string;
  running: boolean | null;
  onStart: () => void;
  onStop: () => void;
}) {
  return (
    <div className="flex items-center justify-between bg-[var(--dark-gray)] border border-[var(--grid-gray)] rounded px-4 py-3">
      <div>
        <div className="text-sm font-bold text-[var(--text-primary)]">{title}</div>
        <div className="text-xs text-[var(--text-muted)]">
          Status: {running === null ? '...' : running ? 'Running' : 'Stopped'}
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant={running ? 'outline' : 'default'} onClick={onStart}>
          <Play className="w-4 h-4 mr-1" /> Start
        </Button>
        <Button size="sm" variant={!running ? 'outline' : 'default'} onClick={onStop}>
          <Square className="w-4 h-4 mr-1" /> Stop
        </Button>
      </div>
    </div>
  );
}

function BlockTable({
  type,
  blocks,
  profileOptions,
  poolOptions,
  onChange,
  onRemove,
  onToggleDay,
}: {
  type: 'profile' | 'pool';
  blocks: Array<ProfileBlock | PoolBlock>;
  profileOptions?: string[];
  poolOptions?: Array<{ id: string; name: string }>;
  onChange: (id: string, field: string, value: any) => void;
  onRemove: (id: string) => void;
  onToggleDay: (block: any, day: DayKey) => void;
}) {
  return (
    <div className="space-y-2">
      {blocks.length === 0 && <div className="text-xs text-[var(--text-muted)]">No blocks yet.</div>}
      {blocks.map((block) => (
        <div
          key={block.id}
          className="border border-[var(--grid-gray)] rounded p-3 bg-black/60 space-y-2"
        >
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-center">
            <div>
              <Label>Start</Label>
              <Input
                type="time"
                value={block.start}
                onChange={(e) => onChange(block.id, 'start', e.target.value)}
              />
            </div>
            <div>
              <Label>End</Label>
              <Input type="time" value={block.end} onChange={(e) => onChange(block.id, 'end', e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Label>{type === 'profile' ? 'Profile' : 'Pool'}</Label>
              {type === 'profile' ? (
                <Select
                  value={(block as ProfileBlock).profile}
                  onValueChange={(val) => onChange(block.id, 'profile', val)}
                >
                  <SelectTrigger className="w-full bg-black border-[var(--grid-gray)]">
                    <SelectValue placeholder="Select profile" />
                  </SelectTrigger>
                  <SelectContent>
                    {(profileOptions || DEFAULT_PROFILES).map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select
                  value={(block as PoolBlock).pool}
                  onValueChange={(val) => onChange(block.id, 'pool', val)}
                >
                  <SelectTrigger className="w-full bg-black border-[var(--grid-gray)]">
                    <SelectValue placeholder="Select pool" />
                  </SelectTrigger>
                  <SelectContent>
                    {(poolOptions || []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name || p.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="flex justify-end">
              <Button size="sm" variant="ghost" className="text-red-400" onClick={() => onRemove(block.id)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <DaySelector days={block.days} onToggle={(day) => onToggleDay(block, day)} />
        </div>
      ))}
    </div>
  );
}

function DaySelector({ days, onToggle }: { days: DayKey[]; onToggle: (day: DayKey) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {allDays.map((day) => {
        const active = days.includes(day);
        return (
          <button
            key={day}
            onClick={() => onToggle(day)}
            type="button"
            className={`px-3 py-1 rounded border text-xs font-bold transition ${
              active
                ? 'border-[var(--matrix-green)] text-[var(--matrix-green)] bg-[var(--matrix-green)]/10'
                : 'border-[var(--grid-gray)] text-[var(--text-secondary)] hover:border-[var(--matrix-green)]'
            }`}
          >
            {dayLabels[day]}
          </button>
        );
      })}
    </div>
  );
}

function ScheduleList({
  blocks,
  labelKey,
}: {
  blocks: Array<ProfileBlock | PoolBlock>;
  labelKey: 'profile' | 'pool';
}) {
  if (!blocks.length) {
    return <div className="text-[var(--text-muted)]">No time blocks.</div>;
  }
  return (
    <div className="space-y-2 mt-1">
      {blocks.map((b) => (
        <div key={b.id} className="border border-[var(--grid-gray)] rounded px-2 py-1 bg-black/40">
          <div className="flex items-center justify-between text-[var(--text-primary)]">
            <span>
              {b.start} - {b.end}
            </span>
            <span className="font-semibold">{(b as any)[labelKey]}</span>
          </div>
          <div className="flex flex-wrap gap-1 text-[10px] text-[var(--text-muted)]">
            {b.days.map((d) => (
              <span key={d} className="px-1 py-0.5 bg-[var(--grid-gray)] rounded">
                {dayLabels[d]}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
