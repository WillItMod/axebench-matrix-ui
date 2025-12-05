import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '@/lib/api';
import { autoTuneTracer } from '@/lib/autoTuneTracer';

interface BenchmarkStatus {
  running: boolean;
  mode?: string; // 'benchmark', 'auto_tune', 'nano_tune'
  device?: string;
  progress?: number;
  config?: any;
  testsTotal?: number;
  testsCompleted?: number;
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
  const [status, setStatus] = useState<BenchmarkStatus>({ running: false, testsTotal: 0, testsCompleted: 0 });

  const normalizeMode = (rawMode?: string, autoMode?: boolean) => {
    const mode = (rawMode || '').toLowerCase();
    if (mode.includes('nano')) return 'nano_tune';
    if (mode.includes('auto')) return 'auto_tune';
    if (autoMode) return 'auto_tune';
    return 'benchmark';
  };

  const clearLogs = () => {
    setStatus(prev => ({ ...prev, logs: [] }));
  };

  const refreshStatus = async () => {
    try {
      const data = await api.benchmark.status();
      const mode = normalizeMode((data as any)?.mode || (data as any)?.tune_type, (data as any)?.auto_mode);
      const toNumber = (value: any) => {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
      };
      const testsTotal = toNumber((data as any)?.tests_total ?? (data as any)?.total_tests ?? (data as any)?.planned_tests);
      const testsCompleted = toNumber((data as any)?.tests_completed ?? (data as any)?.tests_complete);
      console.log('[BenchmarkContext] Status poll result:', {
        running: data.running,
        mode,
        device: data.device_name || data.device,
        progress: data.progress,
        config: data.config,
        tests_total: testsTotal,
        tests_completed: testsCompleted,
        phase: data.phase,
        session_id: data.session_id,
        logs_count: (data.session_logs || data.logs || []).length
      });
      autoTuneTracer.recordStatus(data);
      setStatus({
        running: data.running || false,
        mode,
        device: data.device_name || data.device,
        progress: data.progress,
        config: (data as any)?.config,
        testsTotal,
        testsCompleted,
        currentTest: data.current_test,
        phase: data.phase,
        goal: data.goal,
        logs: data.session_logs || data.logs || [],
        sessionId: data.session_id,
      });
    } catch (error) {
      console.error('Failed to fetch benchmark status:', error);
      autoTuneTracer.recordError('Status poll failed', { error: String(error) });
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
    }, 1000);

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
