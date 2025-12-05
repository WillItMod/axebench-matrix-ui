import { useState } from 'react';
import { toast } from 'sonner';
import { useBenchmark } from '@/contexts/BenchmarkContext';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { api } from '@/lib/api';

export default function BenchmarkStatusBanner() {
  const { status, refreshStatus } = useBenchmark();
  const [stopping, setStopping] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const toNumber = (val: any) => {
    const n = Number(val);
    return Number.isFinite(n) ? n : 0;
  };
  const derivePlannedTests = () => {
    const cfg = (status as any)?.config || {};
    const vStart = toNumber(cfg.voltage_start ?? cfg.voltageStart);
    const vStop = toNumber(cfg.voltage_stop ?? cfg.voltageStop);
    const vStep = Math.max(1, toNumber(cfg.voltage_step ?? cfg.voltageStep) || 1);
    const fStart = toNumber(cfg.frequency_start ?? cfg.frequencyStart);
    const fStop = toNumber(cfg.frequency_stop ?? cfg.frequencyStop);
    const fStep = Math.max(1, toNumber(cfg.frequency_step ?? cfg.frequencyStep) || 1);
    const cycles = Math.max(1, toNumber(cfg.cycles_per_test ?? cfg.cyclesPerTest) || 1);
    const vCount = vStop > vStart ? Math.floor((vStop - vStart) / vStep) + 1 : 1;
    const fCount = fStop > fStart ? Math.floor((fStop - fStart) / fStep) + 1 : 1;
    const plannedByConfig = vCount * fCount * cycles;
    const reported = toNumber(status.testsTotal);
    return Math.max(plannedByConfig, reported, 0);
  };

  const basePlanned = derivePlannedTests();
  const completedRaw = toNumber(status.testsCompleted);
  const needsCushion = status.running && status.phase !== 'complete' && completedRaw >= basePlanned && basePlanned > 0;
  const plannedTests = needsCushion
    ? completedRaw + Math.max(1, Math.round(basePlanned * 0.25))
    : basePlanned;
  const completedTests = Math.min(completedRaw, plannedTests || Number.POSITIVE_INFINITY);
  const fallbackPct = Math.min(100, Math.max(0, Math.round(toNumber(status.progress))));
  const progressPct = plannedTests > 0
    ? Math.min(100, Math.round((completedTests / plannedTests) * 100))
    : fallbackPct;
  const progressText = plannedTests > 0
    ? `${completedTests} / ${plannedTests} (${progressPct}%)`
    : `${progressPct}%`;

  // Debug logging
  console.log('[BenchmarkStatusBanner] status:', {
    running: status.running,
    mode: status.mode,
    willShow: status.running && (!status.mode || status.mode === 'benchmark'),
  });

  // Only show for regular benchmarks (not auto_tune or nano_tune)
  // Show if: running AND (mode is undefined OR mode is 'benchmark')
  // Hide if: mode is explicitly 'auto_tune' or 'nano_tune'
  if (!status.running) return null;
  if (status.mode && status.mode !== 'benchmark') return null;

  const handleStop = async () => {
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
    <>
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
          {progressPct !== undefined && (
            <div className="text-[var(--text-secondary)]">
              Progress: <span className="text-[var(--neon-cyan)]">{progressText}</span>
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
            onClick={() => setConfirmOpen(true)}
            disabled={stopping}
            size="sm"
            className="bg-[#ff1f1f] hover:bg-[#d60f0f] text-white font-bold border border-[#ff1f1f] shadow-[0_0_14px_rgba(255,31,31,0.45)]"
          >
            {stopping ? 'STOPPING...' : 'STOP'}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Stop running benchmark?"
        description="Stopping now will end the current run and discard any partially collected samples."
        tone="warning"
        confirmLabel={stopping ? 'Stopping...' : 'Stop benchmark'}
        onConfirm={() => {
          if (stopping) return;
          setConfirmOpen(false);
          handleStop();
        }}
        onCancel={() => {
          if (stopping) return;
          setConfirmOpen(false);
        }}
      />
    </>
  );
}
