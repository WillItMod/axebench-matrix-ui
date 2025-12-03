import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Zap } from 'lucide-react';

export default function Profiles() {
  const [devices, setDevices] = useState<any[]>([]);
  const [profilesByDevice, setProfilesByDevice] = useState<Record<string, any>>({});
  const [loadingDevices, setLoadingDevices] = useState<Record<string, boolean>>({});
  const [showNanoTune, setShowNanoTune] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<string>('');
  const [activeNanoDevice, setActiveNanoDevice] = useState<string>('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [pendingSaveDevice, setPendingSaveDevice] = useState('');
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingProfile, setEditingProfile] = useState<string>('');
  const [editingDevice, setEditingDevice] = useState<string>('');
  const [editVoltage, setEditVoltage] = useState('');
  const [editFrequency, setEditFrequency] = useState('');
  
  // Quick Apply state
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadDevices();
  }, []);

  useEffect(() => {
    const list = Array.from(selectedDevices);
    if (list.length === 0) {
      setProfilesByDevice({});
      return;
    }
    loadProfilesForDevices(list);
  }, [selectedDevices]);

  const loadDevices = async () => {
    try {
      const data = await api.devices.list();
      setDevices(data);
      if (data?.length && selectedDevices.size === 0) {
        setSelectedDevices(new Set([data[0].name]));
      }
    } catch (error) {
      console.error('Failed to load devices:', error);
    }
  };

  const loadProfilesForDevice = async (deviceName: string) => {
    if (!deviceName) return;
    setLoadingDevices((prev) => ({ ...prev, [deviceName]: true }));
    try {
      const data = await api.profiles.get(deviceName);
      const profileData = data?.profiles || data || {};
      setProfilesByDevice((prev) => ({ ...prev, [deviceName]: profileData }));
    } catch (error) {
      console.error('Failed to load profiles:', error);
      toast.error(`Failed to load profiles for ${deviceName}`);
      setProfilesByDevice((prev) => ({ ...prev, [deviceName]: {} }));
    } finally {
      setLoadingDevices((prev) => ({ ...prev, [deviceName]: false }));
    }
  };

  const loadProfilesForDevices = async (deviceNames: string[]) => {
    await Promise.all(deviceNames.map((name) => loadProfilesForDevice(name)));
  };

  const handleApply = async (profileName: string, deviceName: string) => {
    if (!deviceName) return;

    try {
      await api.profiles.apply(deviceName, profileName);
      toast.success(`Applied ${profileName} to ${deviceName}`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to apply profile');
    }
  };

  const handleDelete = async (profileName: string, deviceName: string) => {
    console.log('[Profiles] handleDelete called with:', { profileName, deviceName });
    if (!deviceName) return;
    if (!confirm(`Delete profile "${profileName}" from ${deviceName}?`)) return;

    try {
      console.log('[Profiles] Calling API delete:', { device: deviceName, profile: profileName });
      await api.profiles.delete(deviceName, profileName);
      toast.success('Profile deleted');
      loadProfilesForDevice(deviceName);
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete profile');
    }
  };

  const handleSaveCurrent = (deviceName: string) => {
    if (!deviceName) return;
    setNewProfileName('custom');
    setPendingSaveDevice(deviceName);
    setShowSaveDialog(true);
  };

  const handleConfirmSave = async () => {
    console.log('[Profiles] handleConfirmSave called for device:', pendingSaveDevice, 'name:', newProfileName);
    if (!pendingSaveDevice || !newProfileName.trim()) {
      toast.error('Please enter a profile name');
      return;
    }

    try {
      // Get current device settings
      const deviceInfo = await api.devices.get(pendingSaveDevice);
      const profileData = {
        voltage: deviceInfo.voltage,
        frequency: deviceInfo.frequency,
        description: `Saved on ${new Date().toLocaleString()}`
      };
      
      // Use saveCustom endpoint which fetches current device settings
      const result = await api.profiles.saveCustom(pendingSaveDevice);
      console.log('[Profiles] Save result:', result);
      toast.success(`Profile "${newProfileName}" saved successfully`);
      setShowSaveDialog(false);
      setNewProfileName('');
      loadProfilesForDevice(pendingSaveDevice);
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

  const applyPresetProfile = async (presetName: string) => {
    if (selectedDevices.size === 0) {
      toast.error('Please select at least one device');
      return;
    }
    const deviceArray = Array.from(selectedDevices);
    const missing: string[] = [];
    let applied = 0;

    for (const deviceName of deviceArray) {
      try {
        const deviceProfiles = await api.profiles.get(deviceName);
        const profilesObj = deviceProfiles?.profiles || deviceProfiles || {};
        if (!profilesObj[presetName]) {
          missing.push(deviceName);
          continue;
        }
        await api.profiles.apply(deviceName, presetName);
        applied++;
      } catch (error) {
        console.error(`Failed to apply ${presetName} to ${deviceName}:`, error);
        missing.push(deviceName);
      }
    }

    if (applied > 0) {
      toast.success(`Applied ${presetName.toUpperCase()} to ${applied} device(s)`);
    }
    if (missing.length > 0) {
      toast.warning(`Missing ${presetName} profile for: ${missing.join(', ')}`);
    }
  };

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
                      ? 'border-[var(--matrix-green)] bg-[var(--matrix-green)]/20 shadow-[0_0_0_1px_var(--matrix-green)]'
                      : 'border-[var(--grid-gray)] bg-[var(--dark-gray)] hover:border-[var(--text-muted)]'
                    }
                  `}
                >
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(['quiet', 'efficient', 'balanced', 'max'] as const).map((name) => (
            <Button
              key={name}
              onClick={() => applyPresetProfile(name)}
              disabled={selectedDevices.size === 0}
              className="w-full btn-matrix text-sm py-4 uppercase"
            >
              {name}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold text-glow-cyan">DEVICE_PROFILES</h3>
            <p className="text-[var(--text-secondary)] text-sm">
              Selected devices render below. Use quick apply above or apply per-device.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => loadProfilesForDevices(Array.from(selectedDevices))}
            disabled={selectedDevices.size === 0}
            className="btn-cyan"
          >
            REFRESH_SELECTED
          </Button>
        </div>

        {selectedDevices.size === 0 ? (
          <div className="matrix-card text-center py-10 text-[var(--text-secondary)]">
            Select one or more devices above to view their profiles.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {Array.from(selectedDevices).map((deviceName) => {
              const profileData = profilesByDevice[deviceName] || {};
              const profileList = Object.entries(profileData).filter(
                ([, profile]) => profile && typeof profile === 'object'
              ) as [string, any][];
              const meta = devices.find((d) => d.name === deviceName);
              const isLoading = loadingDevices[deviceName];

              return (
                <div key={deviceName} className="matrix-card space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-bold text-[var(--text-primary)]">{deviceName}</div>
                      <div className="text-xs text-[var(--text-secondary)]">{meta?.model || 'Unknown model'}</div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSaveCurrent(deviceName)}
                        className="btn-matrix"
                      >
                        SAVE_CURRENT
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => loadProfilesForDevice(deviceName)}
                        className="btn-cyan"
                      >
                        REFRESH
                      </Button>
                    </div>
                  </div>

                  {isLoading ? (
                    <div className="text-center py-8 text-[var(--text-muted)]">LOADING_PROFILES...</div>
                  ) : profileList.length === 0 ? (
                    <div className="text-center py-6 text-[var(--text-secondary)] text-sm">
                      No profiles found. Run a benchmark to generate profiles.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {profileList.map(([name, profile]) => (
                        <div key={`${deviceName}-${name}`} className="border border-[var(--grid-gray)] rounded p-3 bg-black/60">
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

                            <div className="flex flex-col gap-2 ml-4">
                              <Button
                                size="sm"
                                onClick={() => handleApply(name, deviceName)}
                                className="btn-matrix text-xs"
                              >
                                APPLY
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => {
                                  setSelectedProfile(name);
                                  setActiveNanoDevice(deviceName);
                                  setShowNanoTune(true);
                                }}
                                className="btn-cyan text-xs"
                              >
                                NANO
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => {
                                  setEditingProfile(name);
                                  setEditingDevice(deviceName);
                                  setEditVoltage(profile.voltage?.toString() || '');
                                  setEditFrequency(profile.frequency?.toString() || '');
                                  setShowEditDialog(true);
                                }}
                                className="bg-[var(--warning-amber)] hover:bg-[var(--warning-amber)]/80 text-black text-xs"
                              >
                                EDIT
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => {
                                  const json = JSON.stringify(profile, null, 2);
                                  const blob = new Blob([json], { type: 'application/json' });
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = `${deviceName}_${name}_profile.json`;
                                  a.click();
                                  URL.revokeObjectURL(url);
                                  toast.success('Profile exported');
                                }}
                                className="bg-purple-600 hover:bg-purple-700 text-white text-xs"
                              >
                                JSON
                              </Button>
                              {!profile?.is_best && (
                                <Button
                                  size="sm"
                                  onClick={() => handleDelete(name, deviceName)}
                                  className="bg-[var(--error-red)] hover:bg-[var(--error-red)]/80 text-white text-xs"
                                >
                                  DELETE
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
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
            <strong className="text-[var(--text-primary)]">NANO:</strong> Fine-tune with Nano Tune
          </p>
          <p>
            <strong className="text-[var(--text-primary)]">SAVE_CURRENT:</strong> Save current device settings
          </p>
        </div>
      </div>

      {/* Save Profile Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="matrix-card">
          <DialogHeader>
            <DialogTitle className="text-glow-cyan">SAVE_CURRENT_PROFILE</DialogTitle>
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
              CANCEL
            </Button>
            <Button className="btn-matrix" onClick={handleConfirmSave}>
              CONFIRM_SAVE
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Profile Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="matrix-card">
          <DialogHeader>
            <DialogTitle className="text-glow-cyan">EDIT_PROFILE: {editingProfile.toUpperCase()}</DialogTitle>
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
              CANCEL
            </Button>
            <Button className="btn-matrix" onClick={async () => {
              if (!editingDevice || !editingProfile) return;
              try {
                const profileData = {
                  voltage: parseInt(editVoltage),
                  frequency: parseInt(editFrequency),
                  description: `Edited on ${new Date().toLocaleString()}`
                };
                await api.profiles.update(editingDevice, editingProfile, profileData);
                toast.success(`Profile "${editingProfile}" updated`);
                setShowEditDialog(false);
                loadProfilesForDevice(editingDevice);
              } catch (error: any) {
                toast.error(error.message || 'Failed to update profile');
              }
            }}>
              SAVE_CHANGES
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Nano Tune Modal */}
      <NanoTuneModal
        open={showNanoTune}
        onClose={() => setShowNanoTune(false)}
        device={activeNanoDevice}
        profile={selectedProfile}
        onSuccess={() => activeNanoDevice && loadProfilesForDevice(activeNanoDevice)}
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
      if (profile) {
        const lower = profile.toLowerCase();
        if (['quiet', 'efficient', 'balanced', 'max'].includes(lower)) {
          setConfig((prev) => ({ ...prev, goal: lower }));
        }
      }
    }
  }, [open, profile]);

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
                <SelectItem value="quiet">Quiet</SelectItem>
                <SelectItem value="efficient">Efficient</SelectItem>
                <SelectItem value="balanced">Balanced</SelectItem>
                <SelectItem value="max">Max</SelectItem>
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
