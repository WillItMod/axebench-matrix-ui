import { useBenchmark } from '@/contexts/BenchmarkContext';

export default function NanoTuneStatusBanner() {
  const { status } = useBenchmark();

  // Only show when nano_tune is running
  if (!status.running || status.mode !== 'nano_tune') return null;

  const toNumber = (val: any) => {
    const n = Number(val);
    return Number.isFinite(n) ? n : 0;
  };
  const plannedTests = (() => {
    const cfg = (status as any)?.config || {};
    const vStart = toNumber(cfg.voltage_start ?? cfg.voltageStart);
    const vStop = toNumber(cfg.voltage_stop ?? cfg.voltageStop);
    const vStep = Math.max(1, toNumber(cfg.voltage_step ?? cfg.voltageStep) || 1);
    const fStart = toNumber(cfg.frequency_start ?? cfg.frequencyStart);
    const fStop = toNumber(cfg.frequency_stop ?? cfg.frequencyStop);
    const fStep = Math.max(1, toNumber(cfg.frequency_step ?? cfg.frequencyStep) || 1);
    const cycles = Math.max(1, toNumber(cfg.cycles_per_test ?? cfg.cyclesPerTest) || 1);
    const plannedByConfig = (vStop > vStart ? Math.floor((vStop - vStart) / vStep) + 1 : 1) *
      (fStop > fStart ? Math.floor((fStop - fStart) / fStep) + 1 : 1) *
      cycles;
    const reported = toNumber(status.testsTotal);
    const base = Math.max(plannedByConfig, reported, 0);
    const needsCushion = status.running && status.phase !== 'complete' && toNumber(status.testsCompleted) >= base && base > 0;
    return needsCushion
      ? toNumber(status.testsCompleted) + Math.max(1, Math.round(base * 0.25))
      : base;
  })();
  const completedTests = Math.min(toNumber(status.testsCompleted), plannedTests || Number.POSITIVE_INFINITY);
  const fallbackPct = Math.min(100, Math.max(0, Math.round(toNumber(status.progress))));
  const progress = plannedTests > 0
    ? Math.min(100, Math.round((completedTests / plannedTests) * 100))
    : fallbackPct;
  const testsLabel = plannedTests > 0 ? `${completedTests}/${plannedTests}` : null;
  const device = status.device || 'Unknown';
  const goal = status.goal || 'balanced';
  const currentTest = status.currentTest || '';

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-purple-900/95 to-pink-900/95 backdrop-blur-sm border-b-2 border-purple-500 shadow-lg">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-purple-400 rounded-full animate-pulse" />
              <span className="text-purple-200 font-bold text-sm">NANO_TUNE_ACTIVE</span>
            </div>
            
            <div className="text-white text-sm">
              <span className="text-purple-300">Device:</span> <span className="font-mono">{device}</span>
            </div>

            <div className="text-white text-sm">
              <span className="text-purple-300">Goal:</span> <span className="font-mono uppercase">{goal}</span>
            </div>

            {currentTest && (
              <div className="text-white text-sm">
                <span className="text-purple-300">Test:</span> <span className="font-mono">{currentTest}</span>
              </div>
            )}

            {testsLabel && (
              <div className="text-white text-sm">
                <span className="text-purple-300">Tests:</span> <span className="font-mono">{testsLabel}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className="text-white text-sm">
              <span className="text-purple-300">Progress:</span> <span className="font-mono">{progress}%</span>
            </div>
            
            {/* Progress Bar */}
            <div className="w-32 h-2 bg-purple-950 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
