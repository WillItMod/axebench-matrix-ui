/**
 * Auto Tune trace logger
 * Captures end-to-end events for the Auto Tune flow to aid troubleshooting.
 * Stores a rolling buffer in-memory and, when available, in localStorage so
 * traces survive page reloads. Also exposes a download helper.
 */

import { logger } from './logger';

type TraceType =
  | 'start'
  | 'start_payload'
  | 'status'
  | 'complete'
  | 'error';

type TraceEvent = {
  ts: string;
  type: TraceType;
  runId: string;
  data?: Record<string, any>;
};

class AutoTuneTracer {
  private events: TraceEvent[] = [];
  private storageKey = 'axebench:autoTuneTrace';
  private activeRunId: string | null = null;
  private maxEvents = 500;

  constructor() {
    this.load();
    if (typeof window !== 'undefined') {
      // Expose for quick debugging in the browser console
      (window as any).axebenchAutoTuneTrace = {
        get: () => this.get(),
        clear: () => this.clear(),
        download: () => this.download(),
      };
    }
  }

  startRun(meta: Record<string, any>) {
    const runId = `auto-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    this.activeRunId = runId;
    this.push('start', meta, runId);
    return runId;
  }

  recordStartPayload(payload: Record<string, any>, runId?: string) {
    this.push('start_payload', payload, runId);
  }

  recordStatus(status: any) {
    if (!status) return;
    const mode = String(status.mode || status.tune_type || '').toLowerCase();
    const isAuto = mode.includes('auto');
    // Only trace auto_tune runs
    if (!isAuto && !this.activeRunId) return;

    const runId = this.activeRunId || `auto-${Date.now()}-stat`;
    if (!this.activeRunId && isAuto) {
      this.activeRunId = runId;
    }

    const data = {
      running: !!status.running,
      mode: status.mode || status.tune_type,
      device: status.device || status.device_name,
      progress: status.progress,
      phase: status.phase,
      goal: status.goal,
      tests_completed: status.tests_completed ?? status.tests_complete,
      tests_total: status.tests_total,
      session_id: status.session_id,
      error: status.error,
      warning: status.warning,
    };

    this.push('status', data, runId);

    if (!status.running && this.activeRunId === runId) {
      this.push('complete', { reason: status.error ? 'error' : 'finished' }, runId);
      this.activeRunId = null;
    }
  }

  recordError(message: string, extra?: Record<string, any>, runId?: string) {
    const id = runId || this.activeRunId || `auto-${Date.now()}-err`;
    this.push('error', { message, ...extra }, id);
    if (this.activeRunId === id) {
      this.activeRunId = null;
    }
  }

  private push(type: TraceType, data: Record<string, any>, runId?: string) {
    const evt: TraceEvent = {
      ts: new Date().toISOString(),
      type,
      runId: runId || this.activeRunId || 'auto-unknown',
      data: this.safeClone(data),
    };
    this.events.push(evt);
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
    this.persist();
    // Mirror to the existing logger for immediate visibility
    logger.debug('AUTO_TUNE_TRACE', `${evt.type}#${evt.runId}`, evt.data);
  }

  private safeClone(data: any) {
    try {
      return JSON.parse(JSON.stringify(data));
    } catch {
      return { note: 'unserializable data' };
    }
  }

  private persist() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.events));
    } catch {
      // If persistence fails (quota/etc), keep in-memory only.
    }
  }

  private load() {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        this.events = JSON.parse(raw);
      }
    } catch {
      this.events = [];
    }
  }

  get() {
    return [...this.events];
  }

  clear() {
    this.events = [];
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(this.storageKey);
      } catch {
        // ignore
      }
    }
  }

  download() {
    if (typeof document === 'undefined' || this.events.length === 0) return;
    const text = this.events
      .map((e) => `[${e.ts}] (${e.runId}) ${e.type}: ${JSON.stringify(e.data)}`)
      .join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auto-tune-trace-${new Date().toISOString()}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

export const autoTuneTracer = new AutoTuneTracer();
