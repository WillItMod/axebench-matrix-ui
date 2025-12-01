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
}

const BenchmarkContext = createContext<BenchmarkContextType | undefined>(undefined);

export function BenchmarkProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<BenchmarkStatus>({ running: false });

  const refreshStatus = async () => {
    try {
      const data = await api.benchmark.status();
      setStatus({
        running: data.running || false,
        mode: data.mode || 'benchmark',
        device: data.device_name,
        progress: data.progress,
        currentTest: data.current_test,
        phase: data.phase,
        goal: data.goal,
        logs: data.logs || [],
        sessionId: data.session_id,
      });
    } catch (error) {
      console.error('Failed to fetch benchmark status:', error);
      setStatus({ running: false });
    }
  };

  // Force clear any stuck benchmark state on app startup
  useEffect(() => {
    const clearStuckState = async () => {
      try {
        // Call stop endpoint to clear any crashed/stuck benchmarks
        await api.benchmark.stop();
      } catch (error) {
        // Ignore errors - benchmark might not be running
      }
      // Then refresh to get clean state
      refreshStatus();
    };
    
    clearStuckState();
    
    const interval = setInterval(() => {
      if (status.running) {
        refreshStatus();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [status.running]);

  return (
    <BenchmarkContext.Provider value={{ status, refreshStatus }}>
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
