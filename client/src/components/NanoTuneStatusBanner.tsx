import { useBenchmark } from '@/contexts/BenchmarkContext';

export default function NanoTuneStatusBanner() {
  const { status } = useBenchmark();

  // Only show when nano_tune is running
  if (!status.running || status.mode !== 'nano_tune') return null;

  const plannedTests = status.testsTotal || 0;
  const completedTests = Math.min(status.testsCompleted || 0, plannedTests || Number.POSITIVE_INFINITY);
  const progress = plannedTests > 0
    ? Math.min(100, Math.round((completedTests / plannedTests) * 100))
    : Math.min(100, Math.max(0, Math.round(status.progress || 0)));
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
