import { useBenchmark } from '@/contexts/BenchmarkContext';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { useState } from 'react';

export default function BenchmarkStatusBanner() {
  const { status, refreshStatus } = useBenchmark();
  const [stopping, setStopping] = useState(false);

  // Debug logging
  console.log('[BenchmarkStatusBanner] status:', {
    running: status.running,
    mode: status.mode,
    willShow: status.running && (!status.mode || status.mode === 'benchmark')
  });

  // Only show for regular benchmarks (not auto_tune or nano_tune)
  // Show if: running AND (mode is undefined OR mode is 'benchmark')
  // Hide if: mode is explicitly 'auto_tune' or 'nano_tune'
  if (!status.running) return null;
  if (status.mode && status.mode !== 'benchmark') return null;

  const handleStop = async () => {
    if (!confirm('Stop the running benchmark?')) return;

    try {
      setStopping(true);
      await api.benchmark.stop();
      toast.success('Benchmark stopped');
      await refreshStatus();
    } catch (error: any) {
      toast.error(error.message || 'Failed to stop benchmark');
    } finally {
      setStopping(false);
    }
  };

  return (
    <div className="bg-gradient-to-r from-[var(--matrix-green)]/20 to-[var(--neon-cyan)]/20 border-b-2 border-[var(--matrix-green)] px-4 py-3">
      <div className="container mx-auto flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Running indicator */}
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-[var(--matrix-green)] rounded-full pulse-green" />
            <span className="text-[var(--matrix-green)] font-bold text-glow-green">
              BENCHMARK_RUNNING
            </span>
          </div>

          {/* Device name */}
          {status.device && (
            <div className="text-[var(--text-secondary)]">
              Device: <span className="text-[var(--neon-cyan)]">{status.device}</span>
            </div>
          )}

          {/* Progress */}
          {status.progress !== undefined && (
            <div className="text-[var(--text-secondary)]">
              Progress: <span className="text-[var(--neon-cyan)]">{status.progress}%</span>
            </div>
          )}

          {/* Current test */}
          {status.currentTest && (
            <div className="text-[var(--text-secondary)] text-sm">
              {status.currentTest}
            </div>
          )}
        </div>

        {/* Stop button */}
        <Button
          onClick={handleStop}
          disabled={stopping}
          size="sm"
          className="bg-[var(--error-red)] hover:bg-[var(--error-red)]/80 text-white font-bold"
        >
          {stopping ? 'STOPPING...' : '⏹ STOP'}
        </Button>
      </div>
    </div>
  );
}
