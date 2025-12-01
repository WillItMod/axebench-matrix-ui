import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Zap, Check } from 'lucide-react';

export default function Profiles() {
  const [devices, setDevices] = useState<any[]>([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [profiles, setProfiles] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [showNanoTune, setShowNanoTune] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<string>('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingProfile, setEditingProfile] = useState<string>('');
  const [editVoltage, setEditVoltage] = useState('');
  const [editFrequency, setEditFrequency] = useState('');
  
  // Quick Apply state
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set());
  const [quickApplyProfile, setQuickApplyProfile] = useState('');
  const [applyAsMain, setApplyAsMain] = useState(true);

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
      // Backend may wrap profiles in a 'profiles' key, unwrap if needed
      const profileData = data?.profiles || data || {};
      console.log('[Profiles] Loaded profiles:', { raw: data, unwrapped: profileData });
      setProfiles(profileData);
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

  const handleSaveCurrent = () => {
    if (!selectedDevice) return;
    setNewProfileName('custom');
    setShowSaveDialog(true);
  };

  const handleConfirmSave = async () => {
    console.log('[Profiles] handleConfirmSave called for device:', selectedDevice, 'name:', newProfileName);
    if (!selectedDevice || !newProfileName.trim()) {
      toast.error('Please enter a profile name');
      return;
    }

    try {
      // Get current device settings
      const deviceInfo = await api.devices.get(selectedDevice);
      const profileData = {
        voltage: deviceInfo.voltage,
        frequency: deviceInfo.frequency,
        description: `Saved on ${new Date().toLocaleString()}`
      };
      
      const result = await api.profiles.update(selectedDevice, newProfileName.trim(), profileData);
      console.log('[Profiles] Save result:', result);
      toast.success(`Profile "${newProfileName}" saved successfully`);
      setShowSaveDialog(false);
      setNewProfileName('');
      loadProfiles();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save profile');
    }
  };

  const toggleDevice = (deviceName: string) => {
    const newSelected = new Set(selectedDevices);
    if (newSelected.has(deviceName)) {
      newSelected.delete(deviceName);
    } else {
      newSelected.add(deviceName);
    }
    setSelectedDevices(newSelected);
  };

  const handleQuickApply = async () => {
    if (selectedDevices.size === 0) {
      toast.error('Please select at least one device');
      return;
    }
    if (!quickApplyProfile) {
      toast.error('Please select a profile');
      return;
    }

    const deviceArray = Array.from(selectedDevices);
    let successCount = 0;
    let failCount = 0;

    for (const deviceName of deviceArray) {
      try {
        await api.profiles.apply(deviceName, quickApplyProfile);
        successCount++;
      } catch (error) {
        console.error(`Failed to apply profile to ${deviceName}:`, error);
        failCount++;
      }
    }

    if (successCount > 0) {
      toast.success(`Applied "${quickApplyProfile}" to ${successCount} device(s)${applyAsMain ? ' as MAIN' : ' as FALLBACK'}`);
    }
    if (failCount > 0) {
      toast.error(`Failed to apply to ${failCount} device(s)`);
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

      {/* Quick Profile Apply - Multi-Device */}
      <div className="matrix-card border-2 border-[var(--neon-cyan)]">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-6 h-6 text-[var(--neon-cyan)]" />
          <h2 className="text-2xl font-bold text-glow-cyan">QUICK_PROFILE_APPLY</h2>
        </div>

        {/* Device Selection Grid */}
        <div className="mb-4">
          <Label className="text-[var(--text-secondary)] mb-2 block">SELECT_DEVICES</Label>
          {devices.length === 0 ? (
            <div className="text-center py-4 text-[var(--text-muted)]">
              NO_DEVICES_AVAILABLE
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {devices.map((device) => (
                <button
                  key={device.name}
                  onClick={() => toggleDevice(device.name)}
                  className={`
                    relative p-3 rounded border-2 transition-all text-left
                    ${selectedDevices.has(device.name)
                      ? 'border-[var(--matrix-green)] bg-[var(--matrix-green)]/10'
                      : 'border-[var(--grid-gray)] bg-[var(--dark-gray)] hover:border-[var(--text-muted)]'
                    }
                  `}
                >
                  {selectedDevices.has(device.name) && (
                    <div className="absolute top-1 right-1">
                      <Check className="w-4 h-4 text-[var(--matrix-green)]" />
                    </div>
                  )}
                  <div className="font-bold text-[var(--text-primary)] text-sm">
                    {device.name}
                  </div>
                  <div className="text-xs text-[var(--text-secondary)]">
                    {device.model}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Profile Selection & Apply Type */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <Label className="text-[var(--text-secondary)] mb-2 block">SELECT_PROFILE</Label>
            <Select value={quickApplyProfile} onValueChange={setQuickApplyProfile}>
              <SelectTrigger className="bg-[var(--dark-gray)] border-[var(--grid-gray)]">
                <SelectValue placeholder="Select profile..." />
              </SelectTrigger>
              <SelectContent className="bg-[var(--dark-gray)] border-[var(--matrix-green)]">
                {profileList.map(([name, profile]: [string, any]) => {
                  if (!profile || typeof profile !== 'object') return null;
                  return (
                    <SelectItem key={name} value={name} className="text-[var(--text-primary)]">
                      {name.toUpperCase()} - {profile.voltage}mV @ {profile.frequency}MHz
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-[var(--text-secondary)] mb-2 block">APPLY_AS</Label>
            <div className="flex gap-2">
              <button
                onClick={() => setApplyAsMain(true)}
                className={`
                  flex-1 py-2 px-4 rounded border-2 font-bold transition-all
                  ${applyAsMain
                    ? 'border-[var(--matrix-green)] bg-[var(--matrix-green)]/20 text-[var(--matrix-green)]'
                    : 'border-[var(--grid-gray)] bg-[var(--dark-gray)] text-[var(--text-secondary)]'
                  }
                `}
              >
                MAIN
              </button>
              <button
                onClick={() => setApplyAsMain(false)}
                className={`
                  flex-1 py-2 px-4 rounded border-2 font-bold transition-all
                  ${!applyAsMain
                    ? 'border-[var(--neon-cyan)] bg-[var(--neon-cyan)]/20 text-[var(--neon-cyan)]'
                    : 'border-[var(--grid-gray)] bg-[var(--dark-gray)] text-[var(--text-secondary)]'
                  }
                `}
              >
                FALLBACK
              </button>
            </div>
          </div>
        </div>

        {/* Apply Button */}
        <Button
          onClick={handleQuickApply}
          disabled={selectedDevices.size === 0 || !quickApplyProfile}
          className="w-full btn-matrix text-lg py-6"
        >
          <Zap className="w-5 h-5 mr-2" />
          APPLY_TO_{selectedDevices.size}_DEVICE{selectedDevices.size !== 1 ? 'S' : ''}
        </Button>
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
              <div className="text-[var(--text-muted)] text-lg animate-pulse">
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
                
                console.log('[Profiles] Rendering profile:', { name, profile });
                
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
                      <Button
                        size="sm"
                        onClick={() => {
                          setEditingProfile(name);
                          setEditVoltage(profile.voltage?.toString() || '');
                          setEditFrequency(profile.frequency?.toString() || '');
                          setShowEditDialog(true);
                        }}
                        className="bg-[var(--warning-amber)] hover:bg-[var(--warning-amber)]/80 text-black text-xs"
                      >
                        ✏️ EDIT
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
                <strong className="text-[var(--text-primary)]">QUICK_APPLY:</strong> Apply profile to multiple devices
              </p>
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

      {/* Save Profile Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="matrix-card">
          <DialogHeader>
            <DialogTitle className="text-glow-cyan">💾 SAVE_CURRENT_PROFILE</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-[var(--text-secondary)] text-sm mb-2 block">Profile Name</label>
              <input
                type="text"
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--dark-gray)] border border-[var(--grid-gray)] rounded text-[var(--text-primary)] focus:border-[var(--matrix-green)] focus:outline-none"
                placeholder="Enter profile name..."
                autoFocus
              />
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              This will save the device's current voltage, frequency, and other settings.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              ❌ CANCEL
            </Button>
            <Button className="btn-matrix" onClick={handleConfirmSave}>
              ✅ CONFIRM_SAVE
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Profile Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="matrix-card">
          <DialogHeader>
            <DialogTitle className="text-glow-cyan">✏️ EDIT_PROFILE: {editingProfile.toUpperCase()}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-[var(--text-secondary)] text-sm mb-2 block">Voltage (mV)</label>
              <input
                type="number"
                value={editVoltage}
                onChange={(e) => setEditVoltage(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--dark-gray)] border border-[var(--grid-gray)] rounded text-[var(--text-primary)] focus:border-[var(--matrix-green)] focus:outline-none"
                placeholder="e.g., 1200"
              />
            </div>
            <div>
              <label className="text-[var(--text-secondary)] text-sm mb-2 block">Frequency (MHz)</label>
              <input
                type="number"
                value={editFrequency}
                onChange={(e) => setEditFrequency(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--dark-gray)] border border-[var(--grid-gray)] rounded text-[var(--text-primary)] focus:border-[var(--matrix-green)] focus:outline-none"
                placeholder="e.g., 500"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              ❌ CANCEL
            </Button>
            <Button className="btn-matrix" onClick={async () => {
              if (!selectedDevice || !editingProfile) return;
              try {
                const profileData = {
                  voltage: parseInt(editVoltage),
                  frequency: parseInt(editFrequency),
                  description: `Edited on ${new Date().toLocaleString()}`
                };
                await api.profiles.update(selectedDevice, editingProfile, profileData);
                toast.success(`Profile "${editingProfile}" updated`);
                setShowEditDialog(false);
                loadProfiles();
              } catch (error: any) {
                toast.error(error.message || 'Failed to update profile');
              }
            }}>
              ✅ SAVE_CHANGES
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
  const [hasInteracted, setHasInteracted] = useState(false);

  // Reset interaction flag when modal opens
  useEffect(() => {
    if (open) {
      setHasInteracted(false);
    }
  }, [open]);

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
            <Select 
              value={config.goal} 
              onValueChange={(v) => {
                setConfig({...config, goal: v});
                setHasInteracted(true);
              }}
            >
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
              onClick={(e) => {
                e.preventDefault();
                handleStart();
              }}
              disabled={running}
              className="flex-1 btn-matrix"
              type="button"
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
