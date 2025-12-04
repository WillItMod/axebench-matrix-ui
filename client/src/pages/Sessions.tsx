import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type ProfileKey = 'quiet' | 'efficient' | 'balanced' | 'max';

type SessionResult = {
  voltage: number;
  frequency: number;
  avg_hashrate: number;
  avg_power: number;
  efficiency: number;
  hashrate_variance: number;
  stability_score: number;
  avg_fan_speed?: number;
  avg_chip_temp?: number;
  avg_vr_temp?: number;
};

type GeneratedProfile = {
  voltage: number;
  frequency: number;
  fan_target?: number;
  hashrate?: number;
  expected_hashrate?: number;
  power?: number;
  expected_power?: number;
  efficiency?: number;
  stability_score?: number;
  hashrate_variance?: number;
  avg_fan_speed?: number;
  avg_chip_temp?: number;
  avg_vr_temp?: number;
  max_chip_temp?: number;
  max_vr_temp?: number;
  max_power?: number;
  test_duration?: number;
  warmup_time?: number;
  source_session_id?: string;
  tested_at?: string;
  notes?: string;
};

type ProfilePreviewState = {
  device: string;
  sessionId: string;
  profiles: Record<ProfileKey, GeneratedProfile | null>;
  hasExistingProfiles: boolean;
};

const profileStyles: Record<ProfileKey, { title: string; color: string }> = {
  quiet: { title: 'Quiet', color: '#4caf50' },
  efficient: { title: 'Efficient', color: '#00b4ff' },
  balanced: { title: 'Balanced', color: '#f4a020' },
  max: { title: 'Max', color: '#ff5252' },
};

const toNumber = (value: any): number | null => {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeResult = (result: any): SessionResult | null => {
  const voltage = toNumber(result?.voltage);
  const frequency = toNumber(result?.frequency);
  const hashrate =
    toNumber(result?.avg_hashrate) ??
    toNumber(result?.hashrate) ??
    toNumber(result?.hashrate_avg);
  const power =
    toNumber(result?.avg_power) ??
    toNumber(result?.power) ??
    toNumber(result?.power_avg);

  if (voltage === null || frequency === null || hashrate === null || power === null) {
    return null;
  }

  const efficiency =
    toNumber(result?.efficiency) ??
    (hashrate > 0 ? power / (hashrate / 1000) : null) ??
    null;

  return {
    voltage,
    frequency,
    avg_hashrate: hashrate,
    avg_power: power,
    efficiency: efficiency ?? power,
    hashrate_variance: toNumber(result?.hashrate_variance) ?? toNumber(result?.variance) ?? 0,
    stability_score: toNumber(result?.stability_score) ?? 0,
    avg_fan_speed: toNumber(result?.avg_fan_speed) ?? undefined,
    avg_chip_temp: toNumber(result?.avg_chip_temp) ?? undefined,
    avg_vr_temp: toNumber(result?.avg_vr_temp) ?? undefined,
  };
};

const buildGeneratedProfiles = (session: any): Record<ProfileKey, GeneratedProfile | null> | null => {
  const results = Array.isArray(session?.results) ? session.results : [];
  const normalized = results
    .map(normalizeResult)
    .filter((item): item is SessionResult => Boolean(item));

  if (normalized.length === 0) {
    return null;
  }

  const byHashrate = [...normalized].sort((a, b) => (b.avg_hashrate ?? 0) - (a.avg_hashrate ?? 0));
  const byEfficiency = [...normalized].sort((a, b) => (a.efficiency ?? Infinity) - (b.efficiency ?? Infinity));
  const byPower = [...normalized].sort((a, b) => (a.avg_power ?? Infinity) - (b.avg_power ?? Infinity));

  const bestHashrate = byHashrate[0]?.avg_hashrate ?? 0;
  const selectProfile = (sorted: SessionResult[], minHashrateRatio: number) => {
    if (!sorted.length) return null;
    const threshold = bestHashrate * minHashrateRatio;
    return sorted.find((r) => (r.avg_hashrate ?? 0) >= threshold) ?? sorted[0];
  };

  const selectStableHighPerf = (sorted: SessionResult[]) => {
    for (const result of sorted) {
      if ((result.hashrate_variance ?? 100) < 5 && (result.stability_score ?? 0) > 80) {
        return result;
      }
    }
    if (!sorted.length) return null;
    return sorted[Math.min(2, sorted.length - 1)];
  };

  const benchConfig = session?.benchmark_config || session?.config || {};
  const sessionId = session?.session_id || session?.id;

  const buildProfile = (result: SessionResult | null, fanTarget: number, key: ProfileKey): GeneratedProfile | null => {
    if (!result) return null;
    const efficiency =
      result.efficiency ??
      (result.avg_power && result.avg_hashrate ? result.avg_power / (result.avg_hashrate / 1000) : undefined);

    return {
      voltage: result.voltage,
      frequency: result.frequency,
      fan_target: fanTarget,
      hashrate: result.avg_hashrate,
      expected_hashrate: result.avg_hashrate,
      power: result.avg_power,
      expected_power: result.avg_power,
      efficiency,
      stability_score: result.stability_score,
      hashrate_variance: result.hashrate_variance,
      avg_fan_speed: result.avg_fan_speed,
      avg_chip_temp: result.avg_chip_temp,
      avg_vr_temp: result.avg_vr_temp,
      max_chip_temp: benchConfig.max_chip_temp || 65,
      max_vr_temp: benchConfig.max_vr_temp || 85,
      max_power: benchConfig.max_power || result.avg_power,
      test_duration: benchConfig.test_duration || benchConfig.benchmark_duration || 120,
      warmup_time: benchConfig.warmup_time || 10,
      source_session_id: sessionId,
      tested_at: new Date().toISOString(),
      notes: `Auto-generated ${key} profile from benchmark session`,
    };
  };

  return {
    quiet: buildProfile(selectProfile(byPower, 0.8), 68, 'quiet'),
    efficient: buildProfile(byEfficiency[0] ?? null, 65, 'efficient'),
    balanced: buildProfile(selectStableHighPerf(byHashrate), 60, 'balanced'),
    max: buildProfile(byHashrate[0] ?? null, 55, 'max'),
  };
};

const parseTimestamp = (value: any): Date | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const computeDurationSeconds = (session: any): number | null => {
  const explicit = toNumber(session?.duration ?? session?.elapsed ?? session?.elapsed_seconds);
  if (explicit && explicit > 0) return explicit;

  const start = parseTimestamp(session?.start_time ?? session?.started_at ?? session?.start);
  const end =
    parseTimestamp(session?.end_time ?? session?.finished_at ?? session?.end ?? session?.stop_time) ??
    parseTimestamp(session?.completed_at);

  if (start && end) {
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
  }

  return null;
};

const computeTests = (session: any) => {
  const resultsCount = Array.isArray(session?.results) ? session.results.length : null;
  const testsCompleted = toNumber(
    session?.tests_completed ?? session?.completed_tests ?? session?.tests_run ?? resultsCount
  );
  const testsTotal = toNumber(
    session?.tests_total ?? session?.total_tests ?? session?.planned_tests ?? resultsCount
  );

  return {
    tests_completed: testsCompleted ?? resultsCount ?? 0,
    tests_total: testsTotal ?? resultsCount ?? 0,
  };
};

const deriveBestProfile = (session: any) => {
  if (session?.best_profile) return session.best_profile;
  const results = Array.isArray(session?.results) ? session.results : [];
  const normalized = results.map(normalizeResult).filter((r): r is SessionResult => Boolean(r));
  if (!normalized.length) return null;
  const best = [...normalized].sort((a, b) => (b.avg_hashrate ?? 0) - (a.avg_hashrate ?? 0))[0];
  if (!best) return null;
  const efficiency =
    best.efficiency ??
    (best.avg_power && best.avg_hashrate ? best.avg_power / (best.avg_hashrate / 1000) : undefined);
  return {
    voltage: best.voltage,
    frequency: best.frequency,
    hashrate: best.avg_hashrate,
    efficiency,
  };
};

const normalizeSession = (session: any) => {
  const duration = computeDurationSeconds(session);
  const tests = computeTests(session);
  const device =
    session?.device_configs?.[0]?.name ||
    session?.device ||
    session?.device_name ||
    session?.device_model ||
    'Unknown Device';

  return {
    ...session,
    device,
    duration: duration ?? session?.duration ?? null,
    tests_completed: tests.tests_completed,
    tests_total: tests.tests_total,
    best_profile: deriveBestProfile(session),
    has_plots: session?.has_plots ?? Boolean(session?.plots),
  };
};

const formatDuration = (seconds?: number | null) => {
  if (!seconds || Number.isNaN(seconds)) return 'N/A';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
};

const normalizeLogs = (logData: any): string => {
  if (!logData) return '';
  if (typeof logData === 'string') return logData;
  if (Array.isArray(logData)) return logData.join('\n');
  if (typeof logData === 'object') {
    if (typeof logData.logs === 'string') return logData.logs;
    if (Array.isArray(logData.logs)) return logData.logs.join('\n');
    if (typeof logData.data === 'string') return logData.data;
  }
  try {
    return JSON.stringify(logData, null, 2);
  } catch {
    return String(logData);
  }
};

export default function Sessions() {
  const [, setLocation] = useLocation();
  const [sessions, setSessions] = useState<any[]>([]);
  const [deviceFilter, setDeviceFilter] = useState<string>('');
  const [modeFilter, setModeFilter] = useState<'all' | 'auto' | 'manual'>('all');
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [processingSessionId, setProcessingSessionId] = useState<string | null>(null);
  const [profilePreview, setProfilePreview] = useState<ProfilePreviewState | null>(null);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [profileDialogLoading, setProfileDialogLoading] = useState(false);
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [savingProfiles, setSavingProfiles] = useState(false);
  const [appendSuffix, setAppendSuffix] = useState(false);
  const [profileSuffix, setProfileSuffix] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  useEffect(() => {
    loadSessions();
  }, []);

  const deviceOptions = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach((s) => set.add(s.device));
    return Array.from(set).sort();
  }, [sessions]);

  const isAutoSession = (s: any) => {
    const tune = (s?.tune_type || s?.mode || '').toLowerCase();
    return tune.includes('auto') || tune.includes('auto_tune') || s?.auto_mode === true;
  };

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      const deviceMatch = deviceFilter ? s.device === deviceFilter : true;
      const auto = isAutoSession(s);
      const modeMatch = modeFilter === 'all' ? true : modeFilter === 'auto' ? auto : !auto;
      return deviceMatch && modeMatch;
    });
  }, [sessions, deviceFilter, modeFilter]);

  const groupedSessions = useMemo(() => {
    const groups: Record<string, { auto: any[]; manual: any[] }> = {};
    filteredSessions.forEach((session) => {
      const deviceName = session.device || 'UNKNOWN_DEVICE';
      const bucket = isAutoSession(session) ? 'auto' : 'manual';
      if (!groups[deviceName]) {
        groups[deviceName] = { auto: [], manual: [] };
      }
      groups[deviceName][bucket].push(session);
    });

    // Sort newest first inside each bucket
    Object.values(groups).forEach((group) => {
      (['auto', 'manual'] as const).forEach((bucket) => {
        group[bucket].sort((a, b) => (new Date(b.start_time).getTime()) - (new Date(a.start_time).getTime()));
      });
    });

    return groups;
  }, [filteredSessions]);

  const loadSessions = async () => {
    try {
      setLoading(true);
      const data = await api.sessions.list();
      const normalized = Array.isArray(data) ? data.map(normalizeSession) : [];
      setSessions(normalized);
      setSelectedIds(new Set());
    } catch (error) {
      console.error('Failed to load sessions:', error);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this session?')) return;

    try {
      await api.sessions.delete(id);
      toast.success('Session deleted');
      loadSessions();
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete session');
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.size) {
      toast.error('Select at least one session');
      return;
    }
    if (!confirm(`Delete ${selectedIds.size} selected session(s)?`)) return;
    try {
      setBulkDeleting(true);
      for (const id of selectedIds) {
        // best-effort delete each, continue on errors
        // eslint-disable-next-line no-await-in-loop
        await api.sessions.delete(id);
      }
      toast.success(`Deleted ${selectedIds.size} session${selectedIds.size > 1 ? 's' : ''}`);
      setSelectedIds(new Set());
      loadSessions();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete selected sessions');
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleViewDetails = async (sessionId: string) => {
    try {
      const details = await api.sessions.get(sessionId);
      setSelectedSession(normalizeSession(details));
      setShowDetails(true);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load session details');
    }
  };

  const handleGenerateProfiles = async (sessionId: string) => {
    setProfileDialogOpen(true);
    setProfileDialogLoading(true);
    setProcessingSessionId(sessionId);

    try {
      const session = await api.sessions.get(sessionId);
      const deviceName =
        session?.device_configs?.[0]?.name ||
        session?.device ||
        session?.device_name ||
        session?.device_model;

      if (!deviceName) {
        throw new Error('Unable to determine device for this session');
      }

      const generatedProfiles = buildGeneratedProfiles(session);
      if (!generatedProfiles) {
        throw new Error('No results found to generate profiles for this session');
      }

      let hasExistingProfiles = false;
      try {
        const existing = await api.profiles.get(deviceName);
        const profilesObj = existing?.profiles || existing || {};
        hasExistingProfiles =
          Boolean(existing?.exists) ||
          (profilesObj && typeof profilesObj === 'object' && Object.keys(profilesObj).length > 0);
      } catch (error) {
        console.warn('Unable to check existing profiles:', error);
      }

      setProfilePreview({
        device: deviceName,
        sessionId: session?.session_id || session?.id || sessionId,
        profiles: generatedProfiles,
        hasExistingProfiles,
      });
      setOverwriteExisting(true);
    } catch (error: any) {
      toast.error(error.message || 'Failed to generate profiles');
      setProfileDialogOpen(false);
      setProfilePreview(null);
    } finally {
      setProfileDialogLoading(false);
      setProcessingSessionId(null);
    }
  };

  const handleDownloadJson = async (session: any) => {
    try {
      const detail = await api.sessions.get(session.id);
      const normalized = normalizeSession(detail);
      const jsonData = JSON.stringify(normalized, null, 2);
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `session_${session.id.substring(0, 8)}_${session.device}_${new Date(session.start_time).toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('JSON downloaded');
    } catch (error: any) {
      toast.error(error.message || 'Failed to export JSON');
    }
  };

  const handleSaveGeneratedProfiles = async () => {
    if (!profilePreview) return;
    const requiresOverwrite = profilePreview.hasExistingProfiles;
    if (requiresOverwrite && !overwriteExisting) {
      toast.error('Profiles already exist. Confirm overwrite to continue.');
      return;
    }

    try {
      setSavingProfiles(true);
      const suffix = appendSuffix && profileSuffix.trim() ? `-${profileSuffix.trim()}` : '';
      const payload = Object.entries(profilePreview.profiles).reduce<Record<string, GeneratedProfile>>(
        (acc, [key, value]) => {
          if (value) {
            const name = `${key}${suffix}`;
            acc[name] = { ...value, tune_type: key };
          }
          return acc;
        },
        {}
      );

      await api.profiles.save(
        profilePreview.device,
        payload,
        profilePreview.sessionId,
        overwriteExisting || !requiresOverwrite
      );

      localStorage.setItem('axebench:selectedProfileDevice', profilePreview.device);
      toast.success('Profiles saved successfully');
      setProfileDialogOpen(false);
      setProfilePreview(null);
      setOverwriteExisting(false);
      setAppendSuffix(false);
      setProfileSuffix('');
      setLocation(`/profiles?device=${encodeURIComponent(profilePreview.device)}`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to save profiles');
    } finally {
      setSavingProfiles(false);
    }
  };

  const profileDialogState = useMemo(
    () => ({
      open: profileDialogOpen,
      preview: profilePreview,
      overwriteExisting,
      saving: savingProfiles,
      loading: profileDialogLoading,
      appendSuffix,
      profileSuffix,
    }),
    [profileDialogOpen, profilePreview, overwriteExisting, savingProfiles, profileDialogLoading, appendSuffix, profileSuffix]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-[var(--matrix-green)] text-2xl text-glow-green flicker">
          LOADING SESSIONS...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="hud-panel">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-glow-green mb-2">SESSIONS</h1>
            <p className="text-[var(--text-secondary)] text-sm">
              Benchmark session history and results
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleBulkDelete}
              variant="destructive"
              className="uppercase tracking-wide"
              disabled={!selectedIds.size || bulkDeleting}
            >
              {bulkDeleting ? 'DELETING…' : `DELETE_SELECTED (${selectedIds.size || 0})`}
            </Button>
            <Button onClick={loadSessions} variant="secondary" className="uppercase tracking-wide">
              REFRESH
            </Button>
          </div>
        </div>
      </div>

      {/* Filters */}
      {sessions.length > 0 && (
        <div className="matrix-card p-4 space-y-3">
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div className="flex flex-wrap gap-2">
              {(['all','auto','manual'] as const).map((mode) => (
                <Button
                  key={mode}
                  size="sm"
                  variant={modeFilter === mode ? 'default' : 'outline'}
                  className="text-xs uppercase tracking-wide"
                  aria-pressed={modeFilter === mode}
                  onClick={() => setModeFilter(mode)}
                >
                  {mode === 'all' ? 'ALL_MODES' : mode === 'auto' ? 'AUTO_TUNE' : 'MANUAL'}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {deviceOptions.map((dev) => (
                <Button
                  key={dev}
                  size="sm"
                  variant={deviceFilter === dev ? 'default' : 'outline'}
                  className="text-xs uppercase tracking-wide"
                  aria-pressed={deviceFilter === dev}
                  onClick={() => setDeviceFilter(deviceFilter === dev ? '' : dev)}
                >
                  {dev}
                </Button>
              ))}
            </div>
          </div>
          <div className="text-[var(--text-muted)] text-xs">
            Showing {filteredSessions.length} of {sessions.length} sessions
          </div>
        </div>
      )}

      {filteredSessions.length === 0 ? (
        <div className="matrix-card text-center py-12">
          <div className="text-[var(--text-muted)] text-lg mb-4">
            NO_SESSIONS_FOUND
          </div>
          <p className="text-[var(--text-secondary)] text-sm">
            Run a benchmark to create a session
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedSessions).sort(([a], [b]) => a.localeCompare(b)).map(([deviceName, buckets]) => {
            const showAuto = modeFilter === 'all' || modeFilter === 'auto';
            const showManual = modeFilter === 'all' || modeFilter === 'manual';
            const columns = showAuto && showManual ? 'md:grid-cols-2' : 'md:grid-cols-1';
            return (
            <div key={deviceName} className="matrix-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-glow-green">{deviceName}</h2>
                  <div className="text-[var(--text-secondary)] text-xs">
                    {buckets.auto.length + buckets.manual.length} sessions · {buckets.auto.length} AUTO / {buckets.manual.length} MANUAL
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={loadSessions} className="text-xs">
                  REFRESH_DEVICE
                </Button>
              </div>

              <div className={`grid ${columns} gap-4`}>
                {showAuto && (
                  <div className="space-y-2">
                    <div className="text-[var(--text-secondary)] text-xs">AUTO_TUNE</div>
                    {buckets.auto.length === 0 ? (
                      <div className="text-[var(--text-muted)] text-xs border border-dashed border-[var(--grid-gray)] rounded px-3 py-2">
                        NO_AUTO_TUNE_SESSIONS
                      </div>
                    ) : (
                      buckets.auto.map((session) => (
                        <SessionCard
                          key={session.id}
                          session={session}
                          onView={() => handleViewDetails(session.id)}
                          onDelete={() => handleDelete(session.id)}
                          onGenerateProfiles={() => handleGenerateProfiles(session.id)}
                          generating={processingSessionId === session.id}
                          onDownloadJson={() => handleDownloadJson(session)}
                          selected={selectedIds.has(session.id)}
                          onToggleSelect={(checked: boolean) => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (checked) next.add(session.id);
                              else next.delete(session.id);
                              return next;
                            });
                          }}
                        />
                      ))
                    )}
                  </div>
                )}

                {showManual && (
                  <div className="space-y-2">
                    <div className="text-[var(--text-secondary)] text-xs">MANUAL_TUNE</div>
                    {buckets.manual.length === 0 ? (
                      <div className="text-[var(--text-muted)] text-xs border border-dashed border-[var(--grid-gray)] rounded px-3 py-2">
                        NO_MANUAL_SESSIONS
                      </div>
                    ) : (
                      buckets.manual.map((session) => (
                        <SessionCard
                          key={session.id}
                          session={session}
                          onView={() => handleViewDetails(session.id)}
                          onDelete={() => handleDelete(session.id)}
                          onGenerateProfiles={() => handleGenerateProfiles(session.id)}
                          generating={processingSessionId === session.id}
                          onDownloadJson={() => handleDownloadJson(session)}
                          selected={selectedIds.has(session.id)}
                          onToggleSelect={(checked: boolean) => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (checked) next.add(session.id);
                              else next.delete(session.id);
                              return next;
                            });
                          }}
                        />
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          );
          })}
        </div>
      )}

      <SessionDetailsModal
        open={showDetails}
        onClose={() => setShowDetails(false)}
        session={selectedSession}
      />

      <ProfilePreviewDialog
        state={profileDialogState}
        onOpenChange={(open) => {
          setProfileDialogOpen(open);
          if (!open) {
            setProfilePreview(null);
            setOverwriteExisting(false);
            setProfileDialogLoading(false);
            setAppendSuffix(false);
            setProfileSuffix('');
          }
        }}
        onSave={handleSaveGeneratedProfiles}
        onToggleOverwrite={setOverwriteExisting}
        onToggleSuffix={setAppendSuffix}
        onSuffixChange={setProfileSuffix}
      />
    </div>
  );
}

function SessionCard({
  session,
  onView,
  onDelete,
  onGenerateProfiles,
  onDownloadJson,
  generating,
  selected,
  onToggleSelect,
}: any) {
  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return 'status-online';
      case 'failed':
      case 'error':
        return 'status-error';
      case 'running':
        return 'status-info';
      default:
        return 'text-[var(--text-muted)]';
    }
  };

  const tuneLabel = (session.tune_type || session.mode || 'BENCHMARK').toString().toUpperCase();
  const isAuto = tuneLabel.includes('AUTO');
  const tuneClass = isAuto
    ? 'bg-[var(--neon-cyan)]/15 text-[var(--neon-cyan)]'
    : 'bg-[var(--matrix-green)]/15 text-[var(--matrix-green)]';

  return (
    <div className="matrix-card">
      <div className="flex items-start justify-between gap-3">
        <div className="pt-1">
          <Checkbox
            id={`select-${session.id}`}
            checked={selected}
            onCheckedChange={(checked) => onToggleSelect?.(Boolean(checked))}
            className="border-[var(--grid-gray)] data-[state=checked]:bg-[var(--matrix-green)]"
          />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-lg font-bold text-[var(--text-primary)] text-glow-green">
              {session.device || 'Unknown Device'}
            </h3>
            <span className={`text-sm font-bold ${getStatusColor(session.status)}`}>
              {session.status?.toUpperCase() || 'UNKNOWN'}
            </span>
            <span className={`text-[10px] px-2 py-1 rounded-full font-semibold ${tuneClass}`}>
              {tuneLabel}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
            <div>
              <div className="text-[var(--text-secondary)]">Session ID</div>
              <div className="font-mono text-[var(--text-primary)] text-xs">
                {session.id?.substring(0, 8)}...
              </div>
            </div>
            <div>
              <div className="text-[var(--text-secondary)]">Started</div>
              <div className="font-bold text-[var(--text-primary)]">
                {formatDate(session.start_time)}
              </div>
            </div>
            <div>
              <div className="text-[var(--text-secondary)]">Duration</div>
              <div className="font-bold text-[var(--text-primary)]">
                {formatDuration(session.duration)}
              </div>
            </div>
            <div>
              <div className="text-[var(--text-secondary)]">Tests</div>
              <div className="font-bold text-[var(--text-primary)]">
                {session.tests_completed || 0} / {session.tests_total || 0}
              </div>
            </div>
          </div>

          {session.best_profile && (
            <div className="gridrunner-surface border border-transparent p-2 text-xs">
              <div className="text-[var(--success-green)] font-bold mb-1">BEST RESULT</div>
              <div className="grid grid-cols-4 gap-2 text-muted-foreground">
                <div>
                  V: <span className="text-[var(--text-primary)]">{session.best_profile.voltage}mV</span>
                </div>
                <div>
                  F: <span className="text-[var(--text-primary)]">{session.best_profile.frequency}MHz</span>
                </div>
                <div>
                  HR: <span className="text-[var(--success-green)]">{session.best_profile.hashrate?.toFixed(1)}GH/s</span>
                </div>
                <div>
                  Eff: <span className="text-[var(--neon-cyan)]">{session.best_profile.efficiency?.toFixed(2)}J/TH</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 ml-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                onClick={onView}
                variant="secondary"
                className="text-xs uppercase tracking-wide"
              >
                VIEW
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Open session details, plots, and logs.</TooltipContent>
          </Tooltip>
          {session.status?.toLowerCase() === 'completed' && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  onClick={onGenerateProfiles}
                  disabled={generating}
                  variant="accent"
                  className="text-xs uppercase tracking-wide disabled:opacity-70 shadow-[0_0_14px_hsla(var(--accent),0.35)]"
                >
                  {generating ? 'GENERATING...' : 'GENERATE_PROFILES'}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                Build Quiet/Efficient/Balanced/Max profiles from this session’s results and save to the device.
              </TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                onClick={onDownloadJson}
                variant="outline"
                className="text-xs uppercase tracking-wide"
              >
                JSON
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Download normalized session JSON (includes config/results/log metadata).</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                onClick={onDelete}
                variant="destructive"
                className="text-xs uppercase tracking-wide shadow-[0_0_14px_rgba(239,68,68,0.35)]"
              >
                DELETE
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Delete session and plots from disk. This cannot be undone.</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

interface SessionDetailsModalProps {
  open: boolean;
  onClose: () => void;
  session: any;
}

function SessionDetailsModal({ open, onClose, session }: SessionDetailsModalProps) {
  const [logs, setLogs] = useState('');
  const [loadingLogs, setLoadingLogs] = useState(false);

  useEffect(() => {
    if (open && session?.id) {
      loadLogs();
    }
  }, [open, session]);

  const loadLogs = async () => {
    if (!session?.id) return;

    try {
      setLoadingLogs(true);
      const logData = await api.sessions.getLogs(session.id);
      setLogs(normalizeLogs(logData));
    } catch (error) {
      console.error('Failed to load logs:', error);
      setLogs('Failed to load logs');
    } finally {
      setLoadingLogs(false);
    }
  };

  if (!session) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[var(--dark-gray)] border-2 border-[var(--matrix-green)] text-[var(--text-primary)] max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-glow-green">
            SESSION_DETAILS
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-[var(--text-secondary)]">Session ID</div>
              <div className="font-mono text-[var(--text-primary)]">{session.id}</div>
            </div>
            <div>
              <div className="text-[var(--text-secondary)]">Device</div>
              <div className="font-bold text-[var(--text-primary)]">{session.device}</div>
            </div>
            <div>
              <div className="text-[var(--text-secondary)]">Status</div>
              <div className="font-bold text-[var(--success-green)]">{session.status}</div>
            </div>
            <div>
              <div className="text-[var(--text-secondary)]">Tune Type</div>
              <div className="font-bold text-[var(--text-primary)]">
                {session.tune_type || session.mode || 'Benchmark'}
              </div>
            </div>
            <div>
              <div className="text-[var(--text-secondary)]">Duration</div>
              <div className="font-bold text-[var(--text-primary)]">
                {formatDuration(session.duration)}
              </div>
            </div>
            <div>
              <div className="text-[var(--text-secondary)]">Tests</div>
              <div className="font-bold text-[var(--text-primary)]">
                {session.tests_completed && session.tests_total
                  ? `${session.tests_completed}/${session.tests_total}`
                  : 'N/A'}
              </div>
            </div>
          </div>

          {session.config && (
            <div className="matrix-card">
              <h3 className="text-lg font-bold text-glow-cyan mb-2">CONFIGURATION</h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[var(--text-secondary)]">Voltage Range:</span>{' '}
                  <span className="text-[var(--text-primary)]">
                    {session.config.voltage_start}-{session.config.voltage_stop}mV
                  </span>
                </div>
                <div>
                  <span className="text-[var(--text-secondary)]">Frequency Range:</span>{' '}
                  <span className="text-[var(--text-primary)]">
                    {session.config.frequency_start}-{session.config.frequency_stop}MHz
                  </span>
                </div>
                <div>
                  <span className="text-[var(--text-secondary)]">Test Duration:</span>{' '}
                  <span className="text-[var(--text-primary)]">
                    {session.config.benchmark_duration}s
                  </span>
                </div>
                <div>
                  <span className="text-[var(--text-secondary)]">Goal:</span>{' '}
                  <span className="text-[var(--text-primary)]">
                    {session.config.goal}
                  </span>
                </div>
              </div>
            </div>
          )}

          {session.best_profile && (
            <div className="matrix-card border-[var(--success-green)]">
              <h3 className="text-lg font-bold text-glow-green mb-2">BEST_PROFILE</h3>
              <div className="grid grid-cols-4 gap-3 text-sm">
                <div>
                  <div className="text-[var(--text-secondary)]">Voltage</div>
                  <div className="font-bold text-[var(--text-primary)]">
                    {session.best_profile.voltage} mV
                  </div>
                </div>
                <div>
                  <div className="text-[var(--text-secondary)]">Frequency</div>
                  <div className="font-bold text-[var(--text-primary)]">
                    {session.best_profile.frequency} MHz
                  </div>
                </div>
                <div>
                  <div className="text-[var(--text-secondary)]">Hashrate</div>
                  <div className="font-bold text-[var(--success-green)]">
                    {session.best_profile.hashrate?.toFixed(1)} GH/s
                  </div>
                </div>
                <div>
                  <div className="text-[var(--text-secondary)]">Efficiency</div>
                  <div className="font-bold text-[var(--neon-cyan)]">
                    {session.best_profile.efficiency?.toFixed(2)} J/TH
                  </div>
                </div>
              </div>
            </div>
          )}

          {session.has_plots && (
            <div className="matrix-card">
              <h3 className="text-lg font-bold text-glow-cyan mb-3">VISUALIZATION</h3>
              <div className="grid grid-cols-2 gap-2">
                {['hashrate', 'efficiency', 'temperature', 'power'].map((plotType) => (
                  <Button key={plotType} asChild variant="default" className="text-xs uppercase tracking-wide shadow-[0_0_14px_hsla(var(--primary),0.25)]">
                    <a
                      href={api.sessions.getPlot(session.id, plotType)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      VIEW {plotType.toUpperCase()}
                    </a>
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="matrix-card">
            <h3 className="text-lg font-bold text-glow-cyan mb-2">LOGS</h3>
            {loadingLogs ? (
              <div className="text-center py-4 text-[var(--matrix-green)] flicker">
                LOADING_LOGS...
              </div>
            ) : (
              <div className="terminal max-h-64 overflow-y-auto">
                <pre className="text-xs whitespace-pre-wrap">{logs || 'No logs available'}</pre>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={() => {
                const jsonData = JSON.stringify(session, null, 2);
                const blob = new Blob([jsonData], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `session_${session.id}_${session.device}_${new Date(session.start_time).toISOString().split('T')[0]}.json`;
                a.click();
                URL.revokeObjectURL(url);
                toast.success('JSON exported');
              }}
              variant="default"
              className="uppercase tracking-wide shadow-[0_0_14px_hsla(var(--primary),0.25)]"
            >
              EXPORT_JSON
            </Button>
            <Button onClick={onClose} variant="outline" className="uppercase tracking-wide">
              CLOSE
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ProfilePreviewDialogProps {
  state: {
    open: boolean;
    preview: ProfilePreviewState | null;
    overwriteExisting: boolean;
    saving: boolean;
    loading: boolean;
    appendSuffix: boolean;
    profileSuffix: string;
  };
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
  onToggleOverwrite: (checked: boolean) => void;
  onToggleSuffix: (checked: boolean) => void;
  onSuffixChange: (value: string) => void;
}

function ProfilePreviewDialog({ state, onOpenChange, onSave, onToggleOverwrite, onToggleSuffix, onSuffixChange }: ProfilePreviewDialogProps) {
  const { open, preview, overwriteExisting, saving, loading, appendSuffix, profileSuffix } = state;

  const formatNumber = (value?: number | null, digits = 1) => {
    if (value === undefined || value === null || Number.isNaN(value)) return '?';
    return value.toFixed(digits);
  };

  const cards = (['quiet', 'efficient', 'balanced', 'max'] as ProfileKey[]).map((key) => {
    const profile = preview?.profiles?.[key];
    const style = profileStyles[key];
    if (!profile) return null;

    return (
      <div
        key={key}
        className="rounded-xl border border-[var(--grid-gray)] bg-[var(--dark-gray)]/90 p-4 shadow-lg relative overflow-hidden"
        style={{ boxShadow: `0 0 14px ${style.color}33` }}
      >
        <div
          className="absolute inset-0 opacity-10"
          style={{ background: `radial-gradient(circle at 20% 20%, ${style.color}, transparent 45%)` }}
        />
        <div className="relative space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold tracking-wide" style={{ color: style.color }}>
              {style.title}
            </div>
            <div className="text-xs px-3 py-1 rounded-full bg-[var(--grid-gray)] text-[var(--text-primary)]">
              {profile.voltage}mV @ {profile.frequency}MHz
            </div>
          </div>
          <div className="text-sm text-[var(--text-secondary)]">
            ~{formatNumber(profile.hashrate ?? profile.expected_hashrate)} GH/s | ~{formatNumber(profile.power ?? profile.expected_power)} W | {formatNumber(profile.efficiency, 2)} J/TH
          </div>
          <div className="text-xs text-[var(--text-muted)]">
            Fan target: {profile.fan_target ?? 65}°C
            {profile.avg_chip_temp ? ` · Avg temp: ${formatNumber(profile.avg_chip_temp)}°C` : ''}
            {profile.stability_score ? ` · Stability: ${formatNumber(profile.stability_score, 0)}%` : ''}
          </div>
        </div>
      </div>
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[var(--dark-gray)] border-2 border-[var(--matrix-green)] text-[var(--text-primary)] max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-glow-green flex items-center gap-2">
            Save Profiles
          </DialogTitle>
          <p className="text-[var(--text-secondary)]">
            Generate optimized profiles from your benchmark results.
          </p>
        </DialogHeader>

        {!preview || loading ? (
          <div className="text-center py-10 text-[var(--text-muted)] text-sm">
            Preparing profile preview...
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-[var(--grid-gray)] bg-[var(--grid-gray)]/50 px-4 py-3">
              <div className="text-[var(--text-secondary)]">Device</div>
              <div className="text-lg font-bold text-[var(--text-primary)]">{preview.device}</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {cards}
            </div>

            {preview.hasExistingProfiles && (
              <div className="flex items-start gap-3 rounded-lg border border-[var(--warning-amber)] bg-[var(--warning-amber)]/15 px-4 py-3 text-[var(--warning-amber)]">
                <div className="mt-0.5 text-lg">⚠️</div>
                <div className="flex-1 text-sm">
                  Profiles already exist for this device. Saving will overwrite them.
                  <div className="flex items-center gap-2 mt-2">
                    <Checkbox
                      id="overwrite"
                      checked={overwriteExisting}
                      onCheckedChange={(checked) => onToggleOverwrite(Boolean(checked))}
                    />
                    <label htmlFor="overwrite" className="text-[var(--text-primary)]">
                      Overwrite existing profiles
                    </label>
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-lg border border-[var(--grid-gray)] bg-[var(--grid-gray)]/40 px-4 py-3">
              <div className="flex items-start gap-2">
                <Checkbox
                  id="suffix"
                  checked={appendSuffix}
                  onCheckedChange={(checked) => onToggleSuffix(Boolean(checked))}
                />
                <div className="flex-1">
                  <label htmlFor="suffix" className="text-sm text-[var(--text-primary)] font-semibold">
                    Append suffix to profile names
                  </label>
                  <p className="text-xs text-[var(--text-secondary)]">Adds "-suffix" to Quiet/Efficient/Balanced/Max.</p>
                  <input
                    type="text"
                    value={profileSuffix}
                    onChange={(e) => onSuffixChange(e.target.value)}
                    className="mt-2 w-full px-3 py-2 rounded bg-[var(--dark-gray)] border border-[var(--grid-gray)] text-[var(--text-primary)] text-sm"
                    placeholder="e.g., room1"
                    disabled={!appendSuffix}
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="min-w-[120px]"
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                onClick={onSave}
                disabled={saving || (preview.hasExistingProfiles && !overwriteExisting)}
                variant="default"
                className="min-w-[150px] uppercase tracking-wide shadow-[0_0_14px_hsla(var(--primary),0.3)]"
              >
                {saving ? 'Saving...' : 'Save Profiles'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
