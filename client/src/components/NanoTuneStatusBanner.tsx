import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function NanoTuneStatusBanner() {
  const [nanoTuneStatus, setNanoTuneStatus] = useState<any>(null);

  useEffect(() => {
    const checkNanoTuneStatus = async () => {
      try {
        // Check if nano tune is running via benchmark status
        const response = await api.benchmark.status();
        if (response.running && response.mode === 'nano_tune') {
          setNanoTuneStatus(response);
        } else {
          setNanoTuneStatus(null);
        }
      } catch (error) {
        // Nano tune not running or endpoint not available
        setNanoTuneStatus(null);
      }
    };

    // Initial check
    checkNanoTuneStatus();

    // Poll every 2 seconds
    const interval = setInterval(checkNanoTuneStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  if (!nanoTuneStatus) return null;

  const progress = nanoTuneStatus.progress || 0;
  const device = nanoTuneStatus.device_name || 'Unknown';
  const goal = nanoTuneStatus.goal || 'balanced';
  const currentTest = nanoTuneStatus.current_test || '';

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
