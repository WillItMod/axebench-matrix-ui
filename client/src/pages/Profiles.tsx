import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Zap } from 'lucide-react';
import { usePersistentState } from '@/hooks/usePersistentState';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const ACTIVE_PROFILE_KEY = 'axebench:activeProfiles';

function loadActiveProfiles(): Record<string, string> {
  try {
    const raw = localStorage.getItem(ACTIVE_PROFILE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveActiveProfiles(map: Record<string, string>) {
  try {
    localStorage.setItem(ACTIVE_PROFILE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

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
  const [activeProfiles, setActiveProfiles] = useState<Record<string, string>>(() => loadActiveProfiles());
  const [selectedDevices, setSelectedDevices] = usePersistentState<string[]>('profiles-selected-devices', []);
  const [jsonPreview, setJsonPreview] = useState<{ open: boolean; title: string; body: string }>({
    open: false,
    title: '',
    body: '',
  });

  useEffect(() => {
    loadDevices();
  }, []);

  useEffect(() => {
    if (selectedDevices.length === 0) {
      setProfilesByDevice({});
      return;
    }
    loadProfilesForDevices(selectedDevices);
  }, [selectedDevices]);

  const loadDevices = async () => {
    try {
    const data = await api.devices.list();
    setDevices(data);
  } catch (error) {
      console.error('Failed to load devices:', error);
    }
  };

  const loadProfilesForDevice = async (deviceName: string) => {
    if (!deviceName) return;
    setLoadingDevices((prev) => ({ ...prev, [deviceName]: true }));
    try {
      const data = await api.profiles.get(deviceName);
      const raw = data?.profiles || data || {};
      // Normalize to a plain object so downstream maps do not explode
      const profileData = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
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
      setActiveProfiles((prev) => {
        const next = { ...prev, [deviceName]: profileName };
        saveActiveProfiles(next);
        return next;
      });
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
    setSelectedDevices((prev) =>
      prev.includes(deviceName) ? prev.filter((d) => d !== deviceName) : [...prev, deviceName]
    );
  };

  const applyPresetProfile = async (presetName: string) => {
    if (selectedDevices.length === 0) {
      toast.error('Please select at least one device');
      return;
    }
    const deviceArray = selectedDevices;
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
      <Card className="p-6 chrome-card">
        <h1 className="text-3xl font-bold mb-2">PROFILES</h1>
        <p className="text-muted-foreground text-sm">
          Manage and apply voltage/frequency profiles.
        </p>
      </Card>

      {/* Quick Profile Apply - Multi-Device */}
      <Card className="p-6 space-y-4 chrome-card">
        <div className="flex items-center gap-2">
          <Zap className="w-6 h-6 text-[hsl(var(--primary))]" />
          <h2 className="text-2xl font-bold text-foreground">QUICK_PROFILE_APPLY</h2>
        </div>

        {/* Device Selection Grid */}
        <div className="space-y-2">
          <Label className="text-muted-foreground">SELECT_DEVICES</Label>
          {devices.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              NO_DEVICES_AVAILABLE
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {devices.map((device) => {
                const isSelected = selectedDevices.includes(device.name);
                return (
                  <Button
                    key={device.name}
                    onClick={() => toggleDevice(device.name)}
                    variant={isSelected ? 'default' : 'outline'}
                    className={`w-full justify-start text-left ${isSelected ? 'shadow-[0_0_14px_hsla(var(--primary),0.35)]' : ''}`}
                  >
                    <span className="font-bold text-foreground text-sm">{device.name}</span>
                  </Button>
                );
              })}
            </div>
          )}
        </div>

        {/* Profile Selection & Apply Type */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(['quiet', 'efficient', 'balanced', 'max'] as const).map((name) => (
              <Button
                key={name}
                onClick={() => applyPresetProfile(name)}
                disabled={selectedDevices.length === 0}
                variant="accent"
                className="w-full text-sm py-3 uppercase tracking-wide shadow-[0_0_16px_hsla(var(--accent),0.35)]"
              >
                {name.toUpperCase()}
              </Button>
            ))}
        </div>
      </Card>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold text-foreground">DEVICE_PROFILES</h3>
            <p className="text-muted-foreground text-sm">
              Selected devices render below. Use quick apply above or apply per-device.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => loadProfilesForDevices(selectedDevices)}
            disabled={selectedDevices.length === 0}
            className="shadow-[0_0_12px_hsla(var(--secondary),0.25)]"
          >
            REFRESH_SELECTED
          </Button>
        </div>

        {selectedDevices.length === 0 ? (
          <Card className="p-8 text-center chrome-card text-muted-foreground">
            Select one or more devices above to view their profiles.
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {selectedDevices.map((deviceName) => {
              const profileData = profilesByDevice[deviceName] || {};
              const profileList = Object.entries(profileData).filter(
                ([, profile]) => profile && typeof profile === 'object'
              ) as [string, any][];
              const meta = devices.find((d) => d.name === deviceName);
              const isLoading = loadingDevices[deviceName];

              return (
                <Card key={deviceName} className="space-y-3 p-5 chrome-card">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-bold text-foreground">{deviceName}</div>
                      <div className="text-xs text-muted-foreground">{meta?.model || 'Unknown model'}</div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleSaveCurrent(deviceName)}
                        className="shadow-[0_0_12px_hsla(var(--primary),0.25)]"
                      >
                        SAVE_CURRENT
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => loadProfilesForDevice(deviceName)}
                        className="shadow-[0_0_12px_hsla(var(--secondary),0.2)]"
                      >
                        REFRESH
                      </Button>
                    </div>
                  </div>

                  {isLoading ? (
                    <div className="text-center py-8 text-muted-foreground">LOADING_PROFILES...</div>
                  ) : profileList.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground text-sm">
                      No profiles found. Run a benchmark to generate profiles.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {profileList.map(([name, profile]) => (
                        <div
                          key={`${deviceName}-${name}`}
                          className={`gridrunner-surface border border-transparent p-3 ${
                            activeProfiles[deviceName]?.toLowerCase() === name.toLowerCase()
                              ? 'border-[hsl(var(--primary))] shadow-[0_0_12px_hsla(var(--primary),0.25)]'
                              : 'border-border/70'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <h3 className="text-lg font-bold text-foreground">
                                  {name.toUpperCase()}
                                </h3>
                                {profile?.is_best && (
                                  <span className="px-2 py-0.5 bg-[hsl(var(--success))] text-black text-xs font-bold rounded">
                                    BEST
                                  </span>
                                )}
                                {activeProfiles[deviceName]?.toLowerCase() === name.toLowerCase() && (
                                  <span className="px-2 py-0.5 bg-[hsl(var(--primary))]/15 text-[hsl(var(--primary))] text-xs font-bold rounded border border-[hsl(var(--primary))]">
                                    ACTIVE
                                  </span>
                                )}
                              </div>
                              
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                <div>
                                  <div className="text-muted-foreground">Voltage</div>
                                  <div className="font-bold text-foreground">
                                    {profile.voltage} mV
                                  </div>
                                </div>
                                <div>
                                  <div className="text-muted-foreground">Frequency</div>
                                  <div className="font-bold text-foreground">
                                    {profile.frequency} MHz
                                  </div>
                                </div>
                                <div>
                                  <div className="text-muted-foreground">Hashrate</div>
                                  <div className="font-bold text-[hsl(var(--success))]">
                                    {profile.hashrate?.toFixed(1)} GH/s
                                  </div>
                                </div>
                                <div>
                                  <div className="text-muted-foreground">Efficiency</div>
                                  <div className="font-bold text-[hsl(var(--secondary))]">
                                    {profile.efficiency?.toFixed(2)} J/TH
                                  </div>
                                </div>
                              </div>

                              {profile.description && (
                                <div className="mt-2 text-xs text-muted-foreground">
                                  {profile.description}
                                </div>
                              )}
                            </div>

                            <div className="flex flex-wrap gap-2 ml-4 justify-end">
                              <Button
                                size="sm"
                                onClick={() => handleApply(name, deviceName)}
                                variant="default"
                                className="text-xs min-w-[90px] uppercase tracking-wide shadow-[0_0_12px_hsla(var(--primary),0.25)]"
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
                                variant="secondary"
                                className="text-xs min-w-[90px]"
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
                                variant="accent"
                                className="text-xs min-w-[90px] uppercase tracking-wide shadow-[0_0_12px_hsla(var(--accent),0.3)]"
                              >
                                EDIT
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => {
                                  const json = JSON.stringify(profile, null, 2);
                                  setJsonPreview({
                                    open: true,
                                    title: `${deviceName} • ${name}`,
                                    body: json,
                                  });
                                }}
                                variant="secondary"
                                className="text-xs min-w-[90px] bg-[hsl(var(--secondary))]/20 border border-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] shadow-[0_0_12px_hsla(var(--secondary),0.25)]"
                              >
                                JSON
                              </Button>
                              {!profile?.is_best && (
                                <Button
                                  size="sm"
                                  onClick={() => handleDelete(name, deviceName)}
                                  variant="destructive"
                                  className="text-xs min-w-[90px]"
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
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Card className="p-5 chrome-card">
        <h3 className="text-lg font-bold mb-2">INFO</h3>
        <div className="text-xs text-muted-foreground space-y-2">
          <p>
            <strong className="text-foreground">QUICK_APPLY:</strong> Apply profile to multiple devices
          </p>
          <p>
            <strong className="text-foreground">APPLY:</strong> Set device to profile settings
          </p>
          <p>
            <strong className="text-foreground">NANO:</strong> Fine-tune with Nano Tune
          </p>
          <p>
            <strong className="text-foreground">SAVE_CURRENT:</strong> Save current device settings
          </p>
        </div>
      </Card>

      {/* Save Profile Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="chrome-card">
          <DialogHeader>
            <DialogTitle className="text-foreground">SAVE_CURRENT_PROFILE</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-muted-foreground text-sm mb-2 block">Profile Name</label>
              <Input
                type="text"
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                placeholder="Enter profile name..."
                autoFocus
              />
            </div>
            <p className="text-xs text-muted-foreground">
              This will save the device's current voltage, frequency, and other settings.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              CANCEL
            </Button>
            <Button variant="default" className="uppercase tracking-wide" onClick={handleConfirmSave}>
              CONFIRM_SAVE
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Profile Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="chrome-card">
          <DialogHeader>
            <DialogTitle className="text-foreground">EDIT_PROFILE: {editingProfile.toUpperCase()}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-muted-foreground text-sm mb-2 block">Voltage (mV)</label>
              <Input
                type="number"
                value={editVoltage}
                onChange={(e) => setEditVoltage(e.target.value)}
                placeholder="e.g., 1200"
              />
            </div>
            <div>
              <label className="text-muted-foreground text-sm mb-2 block">Frequency (MHz)</label>
              <Input
                type="number"
                value={editFrequency}
                onChange={(e) => setEditFrequency(e.target.value)}
                placeholder="e.g., 500"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              CANCEL
            </Button>
            <Button variant="accent" className="uppercase tracking-wide" onClick={async () => {
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

      {/* JSON Preview Dialog */}
      <Dialog open={jsonPreview.open} onOpenChange={(open) => setJsonPreview((prev) => ({ ...prev, open }))}>
        <DialogContent className="chrome-card max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-foreground">Profile JSON - {jsonPreview.title}</DialogTitle>
          </DialogHeader>
          <div className="gridrunner-surface border border-transparent p-3 max-h-[60vh] overflow-auto font-mono text-sm text-foreground">
            <pre className="whitespace-pre-wrap">{jsonPreview.body}</pre>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setJsonPreview((prev) => ({ ...prev, open: false }))}>
              Close
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
      <DialogContent className="max-w-md shadow-chrome">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-glow-green">
            🔬 NANO_TUNE
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="gridrunner-surface border border-transparent p-3 text-sm">
            <div className="text-[hsl(var(--accent))] font-bold mb-1">Fine-tune existing profile</div>
            <div className="text-muted-foreground text-xs">
              Base Profile: <span className="text-foreground">{profile}</span>
            </div>
          </div>

          <div>
            <Label className="text-muted-foreground">Optimization Goal</Label>
            <Select 
              value={config.goal} 
              onValueChange={(v) => {
                setConfig({...config, goal: v});
                setHasInteracted(true);
              }}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="quiet">Quiet</SelectItem>
                <SelectItem value="efficient">Efficient</SelectItem>
                <SelectItem value="balanced">Balanced</SelectItem>
                <SelectItem value="max">Max</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="gridrunner-surface border border-transparent p-3 text-xs text-muted-foreground">
            <div className="font-bold text-foreground mb-1">Auto-Configuration</div>
            Nano Tune will automatically determine optimal voltage and frequency ranges based on the selected profile.
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              onClick={(e) => {
                e.preventDefault();
                handleStart();
              }}
              disabled={running}
              variant="default"
              className="flex-1 uppercase tracking-wide shadow-[0_0_18px_hsla(var(--primary),0.35)]"
              type="button"
            >
              {running ? 'STARTING...' : '▶ START_NANO_TUNE'}
            </Button>
            <Button
              onClick={onClose}
              disabled={running}
              variant="outline"
              className="flex-1 uppercase tracking-wide"
            >
              CANCEL
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
