import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

export default function Profiles() {
  const [devices, setDevices] = useState<any[]>([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [profiles, setProfiles] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [showNanoTune, setShowNanoTune] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState('');

  useEffect(() => {
    loadDevices();
  }, []);

  useEffect(() => {
    if (selectedDevice) {
      loadProfiles();
    }
  }, [selectedDevice]);

  const loadDevices = async () => {
    try {
      const data = await api.devices.list();
      setDevices(data);
    } catch (error) {
      console.error('Failed to load devices:', error);
    }
  };

  const loadProfiles = async () => {
    if (!selectedDevice) return;
    
    try {
      setLoading(true);
      const data = await api.profiles.get(selectedDevice);
      setProfiles(data || {});
    } catch (error) {
      console.error('Failed to load profiles:', error);
      setProfiles({});
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async (profileName: string) => {
    if (!selectedDevice) return;

    try {
      await api.profiles.apply(selectedDevice, profileName);
      toast.success(`Applied profile: ${profileName}`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to apply profile');
    }
  };

  const handleDelete = async (profileName: string) => {
    console.log('[Profiles] handleDelete called with:', { profileName, selectedDevice });
    if (!selectedDevice) return;
    if (!confirm(`Delete profile "${profileName}"?`)) return;

    try {
      console.log('[Profiles] Calling API delete:', { device: selectedDevice, profile: profileName });
      await api.profiles.delete(selectedDevice, profileName);
      toast.success('Profile deleted');
      loadProfiles();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete profile');
    }
  };

  const handleSaveCurrent = async () => {
    console.log('[Profiles] handleSaveCurrent called for device:', selectedDevice);
    if (!selectedDevice) return;

    try {
      const result = await api.profiles.saveCustom(selectedDevice);
      console.log('[Profiles] Save result:', result);
      toast.success('Current settings saved as Custom profile');
      loadProfiles();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save current settings');
    }
  };

  const profileList = Object.entries(profiles);

  return (
    <div className="space-y-6">
      <div className="hud-panel">
        <h1 className="text-3xl font-bold text-glow-green mb-2">PROFILE_MATRIX</h1>
        <p className="text-[var(--text-secondary)] text-sm">
          Manage and apply voltage/frequency profiles
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile List */}
        <div className="lg:col-span-2 space-y-4">
          {/* Device Selection */}
          <div className="matrix-card">
            <Label className="text-[var(--text-secondary)]">Select Device</Label>
            <Select value={selectedDevice} onValueChange={setSelectedDevice}>
              <SelectTrigger className="mt-1 bg-[var(--dark-gray)] border-[var(--grid-gray)]">
                <SelectValue placeholder="Select device..." />
              </SelectTrigger>
              <SelectContent className="bg-[var(--dark-gray)] border-[var(--matrix-green)]">
                {devices.map((device) => (
                  <SelectItem key={device.name} value={device.name} className="text-[var(--text-primary)]">
                    {device.name} ({device.model})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Profiles */}
          {loading ? (
            <div className="matrix-card text-center py-12">
              <div className="text-[var(--matrix-green)] text-glow-green flicker">
                LOADING_PROFILES...
              </div>
            </div>
          ) : profileList.length === 0 ? (
            <div className="matrix-card text-center py-12">
              <div className="text-[var(--text-muted)] text-lg mb-4">
                NO_PROFILES_FOUND
              </div>
              <p className="text-[var(--text-secondary)] text-sm">
                Run a benchmark to generate profiles
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {profileList.map(([name, profile]: [string, any]) => {
                // Skip null or invalid profiles
                if (!profile || typeof profile !== 'object') return null;
                
                return (
                <div key={name} className="matrix-card">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-lg font-bold text-[var(--text-primary)] text-glow-green">
                          {name.toUpperCase()}
                        </h3>
                        {profile?.is_best && (
                          <span className="px-2 py-0.5 bg-[var(--success-green)] text-black text-xs font-bold rounded">
                            BEST
                          </span>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <div className="text-[var(--text-secondary)]">Voltage</div>
                          <div className="font-bold text-[var(--text-primary)]">
                            {profile.voltage} mV
                          </div>
                        </div>
                        <div>
                          <div className="text-[var(--text-secondary)]">Frequency</div>
                          <div className="font-bold text-[var(--text-primary)]">
                            {profile.frequency} MHz
                          </div>
                        </div>
                        <div>
                          <div className="text-[var(--text-secondary)]">Hashrate</div>
                          <div className="font-bold text-[var(--success-green)]">
                            {profile.hashrate?.toFixed(1)} GH/s
                          </div>
                        </div>
                        <div>
                          <div className="text-[var(--text-secondary)]">Efficiency</div>
                          <div className="font-bold text-[var(--neon-cyan)]">
                            {profile.efficiency?.toFixed(2)} J/TH
                          </div>
                        </div>
                      </div>

                      {profile.description && (
                        <div className="mt-2 text-xs text-[var(--text-muted)]">
                          {profile.description}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2 ml-4">
                      <Button
                        size="sm"
                        onClick={() => handleApply(name)}
                        className="btn-matrix text-xs"
                      >
                        ✓ APPLY
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedProfile(name);
                          setShowNanoTune(true);
                        }}
                        className="btn-cyan text-xs"
                      >
                        🔬 TUNE
                      </Button>
                      {!profile?.is_best && (
                        <Button
                          size="sm"
                          onClick={() => handleDelete(name)}
                          className="bg-[var(--error-red)] hover:bg-[var(--error-red)]/80 text-white text-xs"
                        >
                          ✕
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
              })}
            </div>
          )}
        </div>

        {/* Actions Panel */}
        <div className="space-y-4">
          <div className="hud-panel">
            <h3 className="text-xl font-bold text-glow-cyan mb-4">ACTIONS</h3>
            <div className="space-y-2">
              <Button
                onClick={handleSaveCurrent}
                disabled={!selectedDevice}
                className="w-full btn-matrix"
              >
                💾 SAVE_CURRENT
              </Button>
              <Button
                onClick={loadProfiles}
                disabled={!selectedDevice}
                className="w-full btn-cyan"
              >
                🔄 REFRESH
              </Button>
            </div>
          </div>

          <div className="matrix-card">
            <h3 className="text-lg font-bold text-glow-cyan mb-2">INFO</h3>
            <div className="text-xs text-[var(--text-secondary)] space-y-2">
              <p>
                <strong className="text-[var(--text-primary)]">APPLY:</strong> Set device to profile settings
              </p>
              <p>
                <strong className="text-[var(--text-primary)]">TUNE:</strong> Fine-tune with Nano Tune
              </p>
              <p>
                <strong className="text-[var(--text-primary)]">SAVE_CURRENT:</strong> Save current device settings
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Nano Tune Modal */}
      <NanoTuneModal
        open={showNanoTune}
        onClose={() => setShowNanoTune(false)}
        device={selectedDevice}
        profile={selectedProfile}
        onSuccess={loadProfiles}
      />
    </div>
  );
}

interface NanoTuneModalProps {
  open: boolean;
  onClose: () => void;
  device: string;
  profile: string;
  onSuccess: () => void;
}

function NanoTuneModal({ open, onClose, device, profile, onSuccess }: NanoTuneModalProps) {
  const [config, setConfig] = useState({
    goal: 'balanced',
  });
  const [running, setRunning] = useState(false);

  const handleStart = async () => {
    try {
      setRunning(true);
      
      // Start Nano Tune benchmark - backend auto-determines ranges from profile
      await api.benchmark.start({
        device,
        mode: 'nano_tune',
        base_profile: profile,
        goal: config.goal,
      });

      toast.success('Nano Tune started');
      onClose();
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || 'Failed to start Nano Tune');
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[var(--dark-gray)] border-2 border-[var(--matrix-green)] text-[var(--text-primary)] max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-glow-green">
            🔬 NANO_TUNE
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="bg-[var(--grid-gray)] border border-[var(--neon-cyan)] rounded p-3 text-sm">
            <div className="text-[var(--neon-cyan)] font-bold mb-1">Fine-tune existing profile</div>
            <div className="text-[var(--text-secondary)] text-xs">
              Base Profile: <span className="text-[var(--text-primary)]">{profile}</span>
            </div>
          </div>

          <div>
            <Label className="text-[var(--text-secondary)]">Optimization Goal</Label>
            <Select value={config.goal} onValueChange={(v) => setConfig({...config, goal: v})}>
              <SelectTrigger className="mt-1 bg-[var(--dark-gray)] border-[var(--grid-gray)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[var(--dark-gray)] border-[var(--matrix-green)]">
                <SelectItem value="max_hashrate">Maximum Hashrate</SelectItem>
                <SelectItem value="efficient">Maximum Efficiency</SelectItem>
                <SelectItem value="balanced">Balanced</SelectItem>
                <SelectItem value="quiet">Quiet Mode</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="bg-[var(--grid-gray)]/50 border border-[var(--text-muted)] rounded p-3 text-xs text-[var(--text-secondary)]">
            <div className="font-bold text-[var(--text-primary)] mb-1">Auto-Configuration</div>
            Nano Tune will automatically determine optimal voltage and frequency ranges based on the selected profile.
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              onClick={handleStart}
              disabled={running}
              className="flex-1 btn-matrix"
            >
              {running ? 'STARTING...' : '▶ START_NANO_TUNE'}
            </Button>
            <Button
              onClick={onClose}
              disabled={running}
              className="flex-1 btn-cyan"
            >
              CANCEL
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
