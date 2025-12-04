/**
 * Client-side logging utility with localStorage persistence
 * Logs are stored in localStorage and can be downloaded as a file
 */

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  category: string;
  message: string;
  data?: any;
}

const LOGGING_ENABLED =
  typeof import.meta !== 'undefined' &&
  typeof (import.meta as any).env !== 'undefined' &&
  (import.meta as any).env.VITE_ENABLE_LOGGER === 'true';

class Logger {
  private logs: LogEntry[] = [];
  private maxLogs = 1000;
  private storageKey = 'axebench_debug_logs';
  private static storageBroken =
    typeof window !== 'undefined' && (window as any).__axebenchLogStorageBroken === true;
  private enabled = LOGGING_ENABLED;
  private storageEnabled = false;
  // Keep the persisted payload small to avoid localStorage quota errors
  private maxStoredBytes = 256 * 1024; // 256 KB cap; stay well below browser limits
  private maxDataPreviewLength = 2000; // limit per-entry data size
  private maxLogAgeMs = 7 * 24 * 60 * 60 * 1000; // keep at most 7 days of logs

  constructor() {
    if (
      this.enabled &&
      typeof window !== 'undefined' &&
      typeof localStorage !== 'undefined' &&
      !Logger.storageBroken
    ) {
      this.storageEnabled = true;
      this.loadLogs();
    }
  }

  private loadLogs() {
    if (!this.storageEnabled) {
      return;
    }
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        this.logs = JSON.parse(stored);
        this.pruneLogsByAge();

        // If persisted payload is already too large, trim it proactively
        if (stored.length > this.maxStoredBytes) {
          const targetCount = Math.max(
            50,
            Math.floor((this.logs.length * this.maxStoredBytes) / stored.length)
          );
          this.logs = this.logs.slice(-targetCount);
          this.saveLogs();
        }
      }
    } catch (e) {
      this.disablePersistentStorage('Failed to load logs from localStorage', e);
    }
  }

  private saveLogs() {
    if (!this.storageEnabled) {
      return;
    }
    try {
      // Keep only the most recent logs
      if (this.logs.length > this.maxLogs) {
        this.logs = this.logs.slice(-this.maxLogs);
      }
      this.pruneLogsByAge();
      let payloadLogs = this.logs;
      let payload = JSON.stringify(payloadLogs);

      // Trim oldest entries until payload fits within the budget
      if (payload.length > this.maxStoredBytes) {
        const targetCount = Math.max(
          50,
          Math.floor((payloadLogs.length * this.maxStoredBytes) / payload.length)
        );
        payloadLogs = payloadLogs.slice(-targetCount);
        payload = JSON.stringify(payloadLogs);
      }

      // First attempt with trimmed payload
      if (this.tryPersist(payload)) {
        if (payloadLogs.length !== this.logs.length) {
          this.logs = payloadLogs;
        }
        return;
      }

      // Quota still exceeded; keep only the freshest few entries and try once more
      const minimalLogs = payloadLogs.slice(-50);
      if (this.tryPersist(JSON.stringify(minimalLogs))) {
        this.logs = minimalLogs;
        return;
      }

      // Final fallback: clear persisted logs and disable further attempts
      this.disablePersistentStorage('localStorage quota exceeded for logs');
    } catch (e) {
      this.disablePersistentStorage('Failed to save logs to localStorage', e);
    }
  }

  private tryPersist(payload: string): boolean {
    try {
      localStorage.setItem(this.storageKey, payload);
      return true;
    } catch (err) {
      if (this.isQuotaError(err)) {
        return false;
      }
      throw err;
    }
  }

  private isQuotaError(error: unknown) {
    if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
      return (
        error.name === 'QuotaExceededError' ||
        error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        error.code === 22 ||
        error.code === 1014
      );
    }
    if (typeof error === 'object' && error !== null && 'message' in error) {
      const message = (error as any).message as string;
      return typeof message === 'string' && message.toLowerCase().includes('quota');
    }
    return false;
  }

  private disablePersistentStorage(reason: string, error?: unknown) {
    if (Logger.storageBroken) {
      this.storageEnabled = false;
      return;
    }

    Logger.storageBroken = true;
    if (typeof window !== 'undefined') {
      (window as any).__axebenchLogStorageBroken = true;
    }

    this.storageEnabled = false;
    try {
      localStorage.removeItem(this.storageKey);
    } catch {
      // Ignore failures while disabling persistence
    }

    const message = `${reason}. Falling back to in-memory logs only.`;
    if (error) {
      console.warn(message, error);
    } else {
      console.warn(message);
    }
  }

  private pruneLogsByAge() {
    if (!this.maxLogAgeMs) {
      return;
    }
    const cutoff = Date.now() - this.maxLogAgeMs;
    this.logs = this.logs.filter(log => {
      const ts = Date.parse(log.timestamp);
      return Number.isFinite(ts) && ts >= cutoff;
    });
  }

  private log(level: LogEntry['level'], category: string, message: string, data?: any) {
    if (!this.enabled) {
      return;
    }
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      data: this.sanitizeData(data),
    };

    this.logs.push(entry);
    this.saveLogs();

    // Also log to console
    const consoleMsg = `[${entry.timestamp}] [${category}] ${message}`;
    switch (level) {
      case 'error':
        console.error(consoleMsg, data);
        break;
      case 'warn':
        console.warn(consoleMsg, data);
        break;
      case 'debug':
        console.debug(consoleMsg, data);
        break;
      default:
        console.log(consoleMsg, data);
    }
  }

  private sanitizeData(data: any) {
    if (data === undefined) {
      return undefined;
    }

    try {
      const clone = JSON.parse(JSON.stringify(data));
      const json = JSON.stringify(clone);

      if (json.length > this.maxDataPreviewLength) {
        return {
          truncated: true,
          preview: json.slice(0, this.maxDataPreviewLength) + '...',
          originalLength: json.length,
        };
      }

      return clone;
    } catch (e) {
      // Fallback in case data is not serializable
      return { unserializable: true, message: String(e) };
    }
  }

  info(category: string, message: string, data?: any) {
    this.log('info', category, message, data);
  }

  warn(category: string, message: string, data?: any) {
    this.log('warn', category, message, data);
  }

  error(category: string, message: string, data?: any) {
    this.log('error', category, message, data);
  }

  debug(category: string, message: string, data?: any) {
    this.log('debug', category, message, data);
  }

  getLogs(): LogEntry[] {
    return this.enabled ? [...this.logs] : [];
  }

  clearLogs() {
    this.logs = [];
    if (!this.storageEnabled) {
      return;
    }
    try {
      localStorage.removeItem(this.storageKey);
    } catch (e) {
      console.error('Failed to clear logs from localStorage', e);
      this.storageEnabled = false;
    }
  }

  downloadLogs() {
    if (!this.enabled || this.logs.length === 0) {
      return;
    }
    const logText = this.logs
      .map(log => {
        const dataStr = log.data ? `\n  Data: ${JSON.stringify(log.data, null, 2)}` : '';
        return `[${log.timestamp}] [${log.level.toUpperCase()}] [${log.category}] ${log.message}${dataStr}`;
      })
      .join('\n\n');

    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `axebench-debug-${new Date().toISOString()}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

// Export singleton instance
export const logger = new Logger();

// Add global access for debugging in console
if (typeof window !== 'undefined') {
  (window as any).axebenchLogger = logger;
}
