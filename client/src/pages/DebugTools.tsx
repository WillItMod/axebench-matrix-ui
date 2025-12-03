import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type PingResult = { ok: boolean; message: string; data?: any };

const pretty = (value: any) => JSON.stringify(value, null, 2);

export default function DebugTools() {
  const [deviceName, setDeviceName] = useState<string>('');
  const [results, setResults] = useState<Record<string, PingResult>>({});

  const apiBase = useMemo(() => import.meta.env.VITE_API_BASE_URL || '(vite proxy)', []);
  const debugEnabled = import.meta.env.VITE_ENABLE_DEBUG === 'true';

  const record = (key: string, res: PingResult) =>
    setResults((prev) => ({ ...prev, [key]: res }));

  const withPing = async (key: string, fn: () => Promise<any>) => {
    try {
      const data = await fn();
      record(key, { ok: true, message: 'ok', data });
    } catch (error: any) {
      record(key, { ok: false, message: error?.message || 'error', data: error });
    }
  };

  if (!debugEnabled) {
    return (
      <div className="p-6">
        <Card className="p-6 bg-black/70 border-red-500 text-red-400">
          <div className="font-bold">DEBUG DISABLED</div>
          <div className="text-sm mt-1">Enable with VITE_ENABLE_DEBUG=true to access.</div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      <div className="hud-panel flex flex-col gap-1">
        <h1 className="text-3xl font-bold text-glow-green">INTERNAL DIAGNOSTICS</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Hidden page for quick API probes and cache cleanup. Does not appear in navigation.
        </p>
        <p className="text-xs text-[var(--text-muted)]">
          API base: {apiBase} • VITE_ENABLE_DEBUG={String(debugEnabled)}
        </p>
      </div>

      <Card className="p-4 bg-[var(--dark-gray)]/80 border-[var(--grid-gray)] space-y-3">
        <div className="font-semibold text-[var(--text-primary)]">Quick Pings</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Button variant="outline" onClick={() => withPing('uptime', () => api.system.uptime())}>
            Ping /api/uptime
          </Button>
          <Button variant="outline" onClick={() => withPing('devices', () => api.devices.list())}>
            List devices
          </Button>
          <Button variant="outline" onClick={() => withPing('pools', () => api.pool.list())}>
            List pools
          </Button>
        </div>
      </Card>

      <Card className="p-4 bg-[var(--dark-gray)]/80 border-[var(--grid-gray)] space-y-3">
        <div className="font-semibold text-[var(--text-primary)]">Device-specific checks</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div className="space-y-1">
            <Label htmlFor="deviceName">Device name</Label>
            <Input
              id="deviceName"
              placeholder="Gamma-601"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            disabled={!deviceName}
            onClick={() =>
              withPing('schedule-get', () => api.shed.getSchedule(deviceName))
            }
          >
            GET schedule
          </Button>
          <Button
            variant="outline"
            disabled={!deviceName}
            onClick={() =>
              withPing('profiles-get', () => api.shed.getProfiles(deviceName))
            }
          >
            GET profiles
          </Button>
        </div>
        <div className="text-xs text-[var(--text-muted)]">
          Uses the same endpoints as the Operations page. Useful for quickly spotting 404s or bad responses.
        </div>
      </Card>

      <Card className="p-4 bg-[var(--dark-gray)]/80 border-[var(--grid-gray)] space-y-3">
        <div className="font-semibold text-[var(--text-primary)]">Local cache helpers</div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              localStorage.removeItem('axebench:psuAssignments');
              localStorage.removeItem('axebench:draft:profiles');
              localStorage.removeItem('axebench:draft:pools');
              record('cache', { ok: true, message: 'Cleared local drafts' });
            }}
          >
            Clear local drafts
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              record('build-info', {
                ok: true,
                message: 'env snapshot',
                data: {
                  VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL || '(proxy)',
                  VITE_ENABLE_DEBUG: import.meta.env.VITE_ENABLE_DEBUG,
                  PATREON_URL: import.meta.env.VITE_PATREON_URL,
                },
              });
            }}
          >
            Snapshot env
          </Button>
          <Button
            variant="outline"
            onClick={() => record('reset', { ok: true, message: 'Results cleared' })}
          >
            Clear results
          </Button>
        </div>
      </Card>

      {Object.keys(results).length > 0 && (
        <Card className="p-4 bg-black/80 border-[var(--grid-gray)] space-y-3">
          <div className="font-semibold text-[var(--text-primary)]">Results</div>
          <div className="space-y-2">
            {Object.entries(results).map(([key, res]) => (
              <div key={key} className="border border-[var(--grid-gray)] rounded p-3 bg-[var(--dark-gray)]/70">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm">{key}</span>
                  <span className={res.ok ? 'text-[var(--matrix-green)]' : 'text-red-400'}>
                    {res.ok ? 'OK' : 'FAIL'}
                  </span>
                </div>
                <div className="text-xs text-[var(--text-muted)]">{res.message}</div>
                {res.data !== undefined && (
                  <pre className="mt-2 text-xs bg-black/70 p-2 rounded border border-[var(--grid-gray)] overflow-x-auto">
                    {pretty(res.data)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
