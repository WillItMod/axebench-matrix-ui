import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '@/lib/api';

interface BenchmarkStatus {
  running: boolean;
  mode?: string; // 'benchmark', 'auto_tune', 'nano_tune'
  device?: string;
  progress?: number;
  currentTest?: string;
  phase?: string; // For auto_tune: 'Precision Benchmark', 'Profile Generation', etc.
  goal?: string; // For nano_tune: 'quiet', 'balanced', 'performance', 'max'
  logs?: string[];
  sessionId?: string;
}

interface BenchmarkContextType {
  status: BenchmarkStatus;
  refreshStatus: () => Promise<void>;
  clearLogs: () => void;
}

const BenchmarkContext = createContext<BenchmarkContextType | undefined>(undefined);

export function BenchmarkProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<BenchmarkStatus>({ running: false });

  const clearLogs = () => {
    setStatus(prev => ({ ...prev, logs: [] }));
  };

  const refreshStatus = async () => {
    try {
      const data = await api.benchmark.status();
      console.log('[BenchmarkContext] Status poll result:', {
        running: data.running,
        mode: data.mode,
        device: data.device_name || data.device,
        progress: data.progress,
        phase: data.phase,
        session_id: data.session_id,
        logs_count: (data.session_logs || data.logs || []).length
      });
      setStatus({
        running: data.running || false,
        mode: data.mode || 'benchmark',
        device: data.device_name || data.device,
        progress: data.progress,
        currentTest: data.current_test,
        phase: data.phase,
        goal: data.goal,
        logs: data.session_logs || data.logs || [],
        sessionId: data.session_id,
      });
    } catch (error) {
      console.error('Failed to fetch benchmark status:', error);
      setStatus({ running: false });
    }
  };

  // Initialize status on app startup without interrupting any running benchmark
  useEffect(() => {
    const initializeStatus = async () => {
      // Only fetch current state on load; don't auto-stop running benchmarks
      await refreshStatus();
    };

    initializeStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps = run ONCE on mount

  // Separate effect for polling
  useEffect(() => {
    const interval = setInterval(() => {
      if (status.running) {
        refreshStatus();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [status.running, refreshStatus]);

  return (
    <BenchmarkContext.Provider value={{ status, refreshStatus, clearLogs }}>
      {children}
    </BenchmarkContext.Provider>
  );
}

export function useBenchmark() {
  const context = useContext(BenchmarkContext);
  if (!context) {
    throw new Error('useBenchmark must be used within BenchmarkProvider');
  }
  return context;
}
