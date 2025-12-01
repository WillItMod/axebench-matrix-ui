import { useEffect, useState } from 'react';
import { api, API_BASE_URL } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

export default function Sessions() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      setLoading(true);
      const data = await api.sessions.list();
      setSessions(data || []);
    } catch (error) {
      console.error('Failed to load sessions:', error);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this session?')) return;

    try {
      await api.sessions.delete(id);
      toast.success('Session deleted');
      loadSessions();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete session');
    }
  };

  const handleViewDetails = async (sessionId: string) => {
    try {
      const details = await api.sessions.get(sessionId);
      setSelectedSession(details);
      setShowDetails(true);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load session details');
    }
  };

  const handleGenerateProfiles = async (sessionId: string) => {
    if (!confirm('Generate profiles from this session? This will create 4 optimized profiles (Quiet, Efficient, Optimal, Max).')) return;

    try {
      await api.sessions.generateProfiles(sessionId);
      toast.success('Profiles generated successfully');
    } catch (error: any) {
      toast.error(error.message || 'Failed to generate profiles');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-[var(--matrix-green)] text-2xl text-glow-green flicker">
          LOADING_SESSION_MATRIX...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="hud-panel">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-glow-green mb-2">SESSION_MATRIX</h1>
            <p className="text-[var(--text-secondary)] text-sm">
              Benchmark session history and results
            </p>
          </div>
          <Button onClick={loadSessions} className="btn-cyan">
            🔄 REFRESH
          </Button>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="matrix-card text-center py-12">
          <div className="text-[var(--text-muted)] text-lg mb-4">
            NO_SESSIONS_FOUND
          </div>
          <p className="text-[var(--text-secondary)] text-sm">
            Run a benchmark to create a session
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              onView={() => handleViewDetails(session.id)}
              onDelete={() => handleDelete(session.id)}
              onGenerateProfiles={() => handleGenerateProfiles(session.id)}
            />
          ))}
        </div>
      )}

      {/* Session Details Modal */}
      <SessionDetailsModal
        open={showDetails}
        onClose={() => setShowDetails(false)}
        session={selectedSession}
      />
    </div>
  );
}

function SessionCard({ session, onView, onDelete, onGenerateProfiles }: any) {
  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return 'status-online';
      case 'failed':
      case 'error':
        return 'status-error';
      case 'running':
        return 'status-info';
      default:
        return 'text-[var(--text-muted)]';
    }
  };

  return (
    <div className="matrix-card">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-lg font-bold text-[var(--text-primary)] text-glow-green">
              {session.device || 'Unknown Device'}
            </h3>
            <span className={`text-sm font-bold ${getStatusColor(session.status)}`}>
              {session.status?.toUpperCase() || 'UNKNOWN'}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
            <div>
              <div className="text-[var(--text-secondary)]">Session ID</div>
              <div className="font-mono text-[var(--text-primary)] text-xs">
                {session.id?.substring(0, 8)}...
              </div>
            </div>
            <div>
              <div className="text-[var(--text-secondary)]">Started</div>
              <div className="font-bold text-[var(--text-primary)]">
                {formatDate(session.start_time)}
              </div>
            </div>
            <div>
              <div className="text-[var(--text-secondary)]">Duration</div>
              <div className="font-bold text-[var(--text-primary)]">
                {session.duration ? `${Math.round(session.duration / 60)}m` : 'N/A'}
              </div>
            </div>
            <div>
              <div className="text-[var(--text-secondary)]">Tests</div>
              <div className="font-bold text-[var(--text-primary)]">
                {session.tests_completed || 0} / {session.tests_total || 0}
              </div>
            </div>
          </div>

          {session.best_profile && (
            <div className="bg-[var(--grid-gray)] border border-[var(--matrix-green)] rounded p-2 text-xs">
              <div className="text-[var(--success-green)] font-bold mb-1">BEST RESULT</div>
              <div className="grid grid-cols-4 gap-2 text-[var(--text-secondary)]">
                <div>
                  V: <span className="text-[var(--text-primary)]">{session.best_profile.voltage}mV</span>
                </div>
                <div>
                  F: <span className="text-[var(--text-primary)]">{session.best_profile.frequency}MHz</span>
                </div>
                <div>
                  HR: <span className="text-[var(--success-green)]">{session.best_profile.hashrate?.toFixed(1)}GH/s</span>
                </div>
                <div>
                  Eff: <span className="text-[var(--neon-cyan)]">{session.best_profile.efficiency?.toFixed(2)}J/TH</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 ml-4">
          <Button
            size="sm"
            onClick={onView}
            className="btn-cyan text-xs"
          >
            📊 VIEW
          </Button>
          {session.status?.toLowerCase() === 'completed' && (
            <Button
              size="sm"
              onClick={onGenerateProfiles}
              className="btn-matrix text-xs"
            >
              🔬 GENERATE_PROFILES
            </Button>
          )}
          <Button
            size="sm"
            onClick={onDelete}
            className="bg-[var(--error-red)] hover:bg-[var(--error-red)]/80 text-white text-xs"
          >
            ✕
          </Button>
        </div>
      </div>
    </div>
  );
}

interface SessionDetailsModalProps {
  open: boolean;
  onClose: () => void;
  session: any;
}

function SessionDetailsModal({ open, onClose, session }: SessionDetailsModalProps) {
  const [logs, setLogs] = useState('');
  const [loadingLogs, setLoadingLogs] = useState(false);

  useEffect(() => {
    if (open && session?.id) {
      loadLogs();
    }
  }, [open, session]);

  const loadLogs = async () => {
    if (!session?.id) return;

    try {
      setLoadingLogs(true);
      const logData = await api.sessions.getLogs(session.id);
      setLogs(logData);
    } catch (error) {
      console.error('Failed to load logs:', error);
      setLogs('Failed to load logs');
    } finally {
      setLoadingLogs(false);
    }
  };

  if (!session) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[var(--dark-gray)] border-2 border-[var(--matrix-green)] text-[var(--text-primary)] max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-glow-green">
            SESSION_DETAILS
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Session Info */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-[var(--text-secondary)]">Session ID</div>
              <div className="font-mono text-[var(--text-primary)]">{session.id}</div>
            </div>
            <div>
              <div className="text-[var(--text-secondary)]">Device</div>
              <div className="font-bold text-[var(--text-primary)]">{session.device}</div>
            </div>
            <div>
              <div className="text-[var(--text-secondary)]">Status</div>
              <div className="font-bold text-[var(--success-green)]">{session.status}</div>
            </div>
            <div>
              <div className="text-[var(--text-secondary)]">Duration</div>
              <div className="font-bold text-[var(--text-primary)]">
                {session.duration ? `${Math.round(session.duration / 60)} minutes` : 'N/A'}
              </div>
            </div>
          </div>

          {/* Configuration */}
          {session.config && (
            <div className="matrix-card">
              <h3 className="text-lg font-bold text-glow-cyan mb-2">CONFIGURATION</h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[var(--text-secondary)]">Voltage Range:</span>{' '}
                  <span className="text-[var(--text-primary)]">
                    {session.config.voltage_start}-{session.config.voltage_stop}mV
                  </span>
                </div>
                <div>
                  <span className="text-[var(--text-secondary)]">Frequency Range:</span>{' '}
                  <span className="text-[var(--text-primary)]">
                    {session.config.frequency_start}-{session.config.frequency_stop}MHz
                  </span>
                </div>
                <div>
                  <span className="text-[var(--text-secondary)]">Test Duration:</span>{' '}
                  <span className="text-[var(--text-primary)]">
                    {session.config.benchmark_duration}s
                  </span>
                </div>
                <div>
                  <span className="text-[var(--text-secondary)]">Goal:</span>{' '}
                  <span className="text-[var(--text-primary)]">
                    {session.config.goal}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Best Profile */}
          {session.best_profile && (
            <div className="matrix-card border-[var(--success-green)]">
              <h3 className="text-lg font-bold text-glow-green mb-2">BEST_PROFILE</h3>
              <div className="grid grid-cols-4 gap-3 text-sm">
                <div>
                  <div className="text-[var(--text-secondary)]">Voltage</div>
                  <div className="font-bold text-[var(--text-primary)]">
                    {session.best_profile.voltage} mV
                  </div>
                </div>
                <div>
                  <div className="text-[var(--text-secondary)]">Frequency</div>
                  <div className="font-bold text-[var(--text-primary)]">
                    {session.best_profile.frequency} MHz
                  </div>
                </div>
                <div>
                  <div className="text-[var(--text-secondary)]">Hashrate</div>
                  <div className="font-bold text-[var(--success-green)]">
                    {session.best_profile.hashrate?.toFixed(1)} GH/s
                  </div>
                </div>
                <div>
                  <div className="text-[var(--text-secondary)]">Efficiency</div>
                  <div className="font-bold text-[var(--neon-cyan)]">
                    {session.best_profile.efficiency?.toFixed(2)} J/TH
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Plots */}
          {session.has_plots && (
            <div className="matrix-card">
              <h3 className="text-lg font-bold text-glow-cyan mb-3">VISUALIZATION</h3>
              <div className="grid grid-cols-2 gap-2">
                {['hashrate', 'efficiency', 'temperature', 'power'].map((plotType) => (
                  <a
                    key={plotType}
                    href={api.sessions.getPlot(session.id, plotType)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-matrix text-center text-xs py-2"
                  >
                    📊 {plotType.toUpperCase()}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Logs */}
          <div className="matrix-card">
            <h3 className="text-lg font-bold text-glow-cyan mb-2">LOGS</h3>
            {loadingLogs ? (
              <div className="text-center py-4 text-[var(--matrix-green)] flicker">
                LOADING_LOGS...
              </div>
            ) : (
              <div className="terminal max-h-64 overflow-y-auto">
                <pre className="text-xs whitespace-pre-wrap">{logs || 'No logs available'}</pre>
              </div>
            )}
          </div>

          {/* Export Buttons */}
          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={() => {
                const jsonData = JSON.stringify(session, null, 2);
                const blob = new Blob([jsonData], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `session_${session.id}_${session.device}_${new Date(session.start_time).toISOString().split('T')[0]}.json`;
                a.click();
                URL.revokeObjectURL(url);
                toast.success('JSON exported');
              }}
              className="btn-matrix"
            >
              📥 EXPORT_JSON
            </Button>
            <Button onClick={onClose} className="btn-cyan">
              CLOSE
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
