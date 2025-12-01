import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '@/lib/api';

interface BenchmarkStatus {
  running: boolean;
  device?: string;
  progress?: number;
  currentTest?: string;
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
        device: data.device_name,
        progress: data.progress,
        currentTest: data.current_test,
        logs: data.logs || [],
        sessionId: data.session_id,
      });
    } catch (error) {
      console.error('Failed to fetch benchmark status:', error);
      setStatus({ running: false });
    }
  };

  // Poll status on mount and every 2 seconds if running
  useEffect(() => {
    refreshStatus();
    
    const interval = setInterval(() => {
      refreshStatus();
    }, 2000);

    return () => clearInterval(interval);
  }, []);

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
