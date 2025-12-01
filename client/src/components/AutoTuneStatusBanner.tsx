import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function AutoTuneStatusBanner() {
  const [autoTuneStatus, setAutoTuneStatus] = useState<any>(null);

  useEffect(() => {
    const checkAutoTuneStatus = async () => {
      try {
        // Check if auto tune is running via benchmark status
        const response = await api.benchmark.status();
        if (response.running && response.mode === 'auto_tune') {
          setAutoTuneStatus(response);
        } else {
          setAutoTuneStatus(null);
        }
      } catch (error) {
        // Auto tune not running or endpoint not available
        setAutoTuneStatus(null);
      }
    };

    // Initial check
    checkAutoTuneStatus();

    // Poll every 2 seconds
    const interval = setInterval(checkAutoTuneStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  if (!autoTuneStatus) return null;

  const progress = autoTuneStatus.progress || 0;
  const device = autoTuneStatus.device_name || 'Unknown';
  const phase = autoTuneStatus.phase || 'Initializing';
  const currentTest = autoTuneStatus.current_test || '';

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-purple-600/95 to-pink-600/95 backdrop-blur-sm border-b-2 border-pink-400 shadow-lg shadow-pink-500/50">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="relative">
                <div className="w-3 h-3 bg-pink-300 rounded-full animate-pulse" />
                <div className="absolute inset-0 w-3 h-3 bg-pink-300 rounded-full animate-ping" />
              </div>
              <span className="text-white font-bold text-sm">🪄 AUTO_TUNE_ACTIVE</span>
            </div>
            
            <div className="text-white text-sm">
              <span className="text-pink-200">Device:</span> <span className="font-mono">{device}</span>
            </div>

            <div className="text-white text-sm">
              <span className="text-pink-200">Phase:</span> <span className="font-mono">{phase}</span>
            </div>

            {currentTest && (
              <div className="text-white text-sm">
                <span className="text-pink-200">Test:</span> <span className="font-mono text-xs">{currentTest}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className="text-white text-sm">
              <span className="text-pink-200">Progress:</span> <span className="font-mono font-bold">{progress}%</span>
            </div>
            
            {/* Progress Bar */}
            <div className="w-40 h-2.5 bg-purple-950 rounded-full overflow-hidden border border-pink-400/30">
              <div 
                className="h-full bg-gradient-to-r from-purple-400 via-pink-400 to-pink-500 transition-all duration-300 shadow-lg shadow-pink-500/50"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Sparkle effect */}
            <div className="text-xl animate-pulse">✨</div>
          </div>
        </div>

        {/* Phase description */}
        <div className="mt-2 text-xs text-pink-100 opacity-80">
          {phase === 'Precision Benchmark' && '📊 Running comprehensive benchmark to find optimal settings...'}
          {phase === 'Profile Generation' && '⚙️ Generating 4 profiles: Quiet, Efficient, Optimal, Max...'}
          {phase === 'Fine Tuning' && '🔧 Fine-tuning each profile for maximum performance...'}
          {phase === 'Applying Profile' && '✅ Applying Efficient profile to device...'}
        </div>
      </div>
    </div>
  );
}
