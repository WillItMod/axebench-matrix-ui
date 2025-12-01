import { useEffect, useRef } from 'react';
import { useBenchmark } from '@/contexts/BenchmarkContext';

export default function BenchmarkConsole() {
  const { status } = useBenchmark();
  const logs = status.logs || [];
  const consoleRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs appear
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [logs]);

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour12: false });
  };

  const getLogColor = (level: string) => {
    switch (level.toLowerCase()) {
      case 'error':
        return 'text-red-400';
      case 'warning':
        return 'text-yellow-400';
      case 'success':
        return 'text-green-400';
      case 'info':
      default:
        return 'text-cyan-400';
    }
  };

  return (
    <div className="bg-black/80 border-2 border-[var(--matrix-green)] rounded-lg overflow-hidden">
      {/* Console Header */}
      <div className="bg-[var(--matrix-green)]/20 border-b border-[var(--matrix-green)] px-4 py-2">
        <div className="flex items-center justify-between">
          <span className="text-[var(--matrix-green)] font-bold">
            [BENCHMARK_CONSOLE]
          </span>
          <span className="text-xs text-[var(--text-muted)]">
            {logs.length} events
          </span>
        </div>
      </div>

      {/* Console Content */}
      <div
        ref={consoleRef}
        className="h-64 overflow-y-auto p-4 font-mono text-sm space-y-1"
      >
        {logs.length === 0 ? (
          <div className="text-[var(--text-muted)] italic">
            No benchmark activity. Start a benchmark to see logs here.
          </div>
        ) : (
          logs.map((log: any, index: number) => {
            // Handle both string logs and object logs {message, time, type}
            const logText = typeof log === 'string' ? log : log.message || JSON.stringify(log);
            const logLevel = typeof log === 'object' ? log.type || 'info' : 'info';
            const timestamp = typeof log === 'object' && log.time ? formatTimestamp(log.time) : '';
            
            return (
              <div key={index} className="flex gap-2">
                {timestamp && (
                  <span className="text-[var(--text-muted)] text-xs">[{timestamp}]</span>
                )}
                <span className={getLogColor(logLevel)}>{logText}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
