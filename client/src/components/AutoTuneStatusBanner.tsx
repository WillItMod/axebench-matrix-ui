import { useBenchmark } from '@/contexts/BenchmarkContext';

export default function AutoTuneStatusBanner() {
  const { status } = useBenchmark();

  // Only show when auto_tune is running
  if (!status.running || status.mode !== 'auto_tune') return null;

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
  const currentTest = status.currentTest || '';
  const storedStage =
    typeof window !== 'undefined'
      ? localStorage.getItem('axebench:autoTune_stage_hint') || undefined
      : undefined;
  const nanoAfter =
    typeof window !== 'undefined'
      ? localStorage.getItem('axebench:autoTune_nano') === 'true'
      : false;
  const phase = status.phase || storedStage || 'Full sweep';

  const stages = [
    { key: 'sweep', label: 'Full sweep', match: ['sweep', 'benchmark', 'precision'] },
    { key: 'analyze', label: 'Analyzing data', match: ['analyze', 'session', 'analyzing'] },
    { key: 'profiles', label: 'Generating profiles', match: ['profile', 'generate'] },
    { key: 'nano', label: 'Nano tuning profiles', match: ['nano', 'fine', 'tune'] },
    { key: 'apply', label: 'Finalizing', match: ['apply', 'final', 'apply profile'] },
  ];

  const activeStage =
    stages.find((s) =>
      s.match.some((m) => phase.toLowerCase().includes(m))
    ) || stages[0];

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-[#6d28d9]/95 via-[#a855f7]/90 to-[#6d28d9]/95 backdrop-blur-sm border-b-2 border-[#a855f7] shadow-lg shadow-[#a855f7]/40">
      <div className="container mx-auto px-4 py-3 space-y-2">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="relative">
                <div className="w-3 h-3 bg-amber-300 rounded-full animate-pulse" />
                <div className="absolute inset-0 w-3 h-3 bg-amber-300 rounded-full animate-ping" />
              </div>
              <span className="text-white font-bold text-sm">FULL SWEEP OPTIMIZER ACTIVE</span>
            </div>
            
            <div className="text-white text-sm flex items-center gap-1">
              <span className="text-pink-200">Device:</span> <span className="font-mono">{device}</span>
            </div>

            <div className="text-white text-sm flex items-center gap-1">
              <span className="text-pink-200">Phase:</span> <span className="font-mono">{phase}</span>
            </div>

            {currentTest && (
              <div className="text-white text-sm flex items-center gap-1">
                <span className="text-pink-200">Test:</span> <span className="font-mono text-xs">{currentTest}</span>
              </div>
            )}

            {testsLabel && (
              <div className="text-white text-sm flex items-center gap-1">
                <span className="text-pink-200">Tests:</span> <span className="font-mono">{testsLabel}</span>
              </div>
            )}

            <div className="text-white text-sm flex items-center gap-1">
              <span className="text-pink-200">Nano:</span>{' '}
              <span className="font-mono">{nanoAfter ? 'ON (all profiles)' : 'OFF'}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-white text-sm">
              <span className="text-pink-200">Progress:</span> <span className="font-mono font-bold">{progress}%</span>
            </div>
            
            <div className="w-44 h-2.5 bg-purple-950 rounded-full overflow-hidden border border-[#a855f7]/40">
              <div 
                className="h-full bg-gradient-to-r from-[#a855f7] via-[#c084fc] to-[#22d3ee] transition-all duration-300 shadow-[0_0_14px_rgba(168,85,247,0.7)]"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="text-xl animate-pulse">✨</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {stages.map((s, idx) => {
            const active = s.key === activeStage.key;
            const complete =
              stages.findIndex((st) => st.key === activeStage.key) > idx;
            return (
              <div
                key={s.key}
                className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                  active
                    ? 'bg-white/15 border-white text-white shadow-[0_0_14px_rgba(255,255,255,0.4)]'
                    : complete
                    ? 'bg-white/10 border-white/30 text-white/80'
                    : 'bg-black/20 border-white/10 text-white/60'
                }`}
              >
                {idx + 1}. {s.label}
              </div>
            );
          })}
        </div>

        <div className="text-xs text-pink-100 opacity-90">
          {activeStage.key === 'sweep' && 'Stage 1: Full sweep in progress (silicon leg day).'}
          {activeStage.key === 'analyze' && 'Stage 2: Crunching session data (charts and vibes).'}
          {activeStage.key === 'profiles' && 'Stage 3: Minting profiles (collect them all).'}
          {activeStage.key === 'nano' && 'Stage 4: Nano tuning QUIET/EFFICIENT/BALANCED/MAX (one by one).'}
          {activeStage.key === 'apply' && 'Stage 5: Wrapping up (do not pull the plug).'}
        </div>
      </div>
    </div>
  );
}
