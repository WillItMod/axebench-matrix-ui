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

class Logger {
  private logs: LogEntry[] = [];
  private maxLogs = 1000;
  private storageKey = 'axebench_debug_logs';
  private storageEnabled = typeof window !== 'undefined' && typeof localStorage !== 'undefined';
  // Keep the persisted payload small to avoid localStorage quota errors
  private maxStoredBytes = 512 * 1024; // 512 KB
  private maxDataPreviewLength = 4000; // limit per-entry data size

  constructor() {
    this.loadLogs();
  }

  private loadLogs() {
    if (!this.storageEnabled) {
      return;
    }
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        this.logs = JSON.parse(stored);
      }
    } catch (e) {
      console.error('Failed to load logs from localStorage', e);
      this.storageEnabled = false;
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
      let payload = JSON.stringify(this.logs);

      // Trim oldest entries until payload fits within the budget
      if (payload.length > this.maxStoredBytes) {
        const targetCount = Math.max(
          50,
          Math.floor((this.logs.length * this.maxStoredBytes) / payload.length)
        );
        this.logs = this.logs.slice(-targetCount);
        payload = JSON.stringify(this.logs);
      }

      localStorage.setItem(this.storageKey, payload);
    } catch (e) {
      console.error('Failed to save logs to localStorage', e);
      // Disable further attempts to avoid spamming the console if quota is full
      this.storageEnabled = false;
    }
  }

  private log(level: LogEntry['level'], category: string, message: string, data?: any) {
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
    return [...this.logs];
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
