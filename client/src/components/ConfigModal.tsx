import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import { toast } from 'sonner';

interface ConfigModalProps {
  open: boolean;
  onClose: () => void;
  device: {
    name: string;
    ip?: string;
    model: string;
    status?: {
      voltage: number;
      frequency: number;
      fan_speed: number;
      temp: number;
    };
  };
  onSuccess?: () => void;
}

export default function ConfigModal({ open, onClose, device, onSuccess }: ConfigModalProps) {
  const [voltage, setVoltage] = useState(device.status?.voltage || 1200);
  const [frequency, setFrequency] = useState(device.status?.frequency || 500);
  const [fanAuto, setFanAuto] = useState(true);
  const [targetTemp, setTargetTemp] = useState(60);
  const [applying, setApplying] = useState(false);
  const [psus, setPsus] = useState<any[]>([]);
  const [selectedPsu, setSelectedPsu] = useState<string>('standalone');
  const [ipAddress, setIpAddress] = useState(device.ip || '');

  const getPsuMetrics = (psu: any) => {
    const toNum = (v: any) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const voltage = toNum(psu?.voltage);
    const amperage = toNum(psu?.amperage);
    const wattage =
      toNum(psu?.wattage) ??
      (voltage && amperage ? Number((voltage * amperage).toFixed(1)) : null) ??
      0;
    return { voltage: voltage ?? undefined, amperage: amperage ?? undefined, wattage };
  };
  
  // Load PSUs and current device PSU assignment
  useEffect(() => {
    const loadPsus = async () => {
      try {
        const psuList = await api.psus.list();
        const normalized = Array.isArray(psuList)
          ? psuList.map((p: any) => ({ ...p, ...getPsuMetrics(p) }))
          : [];
        setPsus(normalized);
        
        // Get current device PSU assignment
        const deviceData = await api.devices.get(device.name);
        setSelectedPsu(deviceData.psu_id || 'standalone');
        setIpAddress(deviceData.ip || deviceData.ip_address || device.ip || '');
      } catch (error) {
        console.error('Failed to load PSUs:', error);
      }
    };
    if (open) {
      loadPsus();
    }
  }, [open, device.name]);

  const handleApplySettings = async () => {
    try {
      setApplying(true);
      
      // Update IP if changed
      if (ipAddress && (ipAddress !== device.ip)) {
        await api.devices.update(device.name, { ip: ipAddress });
      }

      // Apply voltage and frequency
      await api.devices.applySettings(device.name, voltage, frequency);
      
      // Apply fan settings
      await api.devices.setFan(device.name, fanAuto, fanAuto ? targetTemp : undefined);
      
      // Update PSU assignment
      await api.devices.update(device.name, {
        psu_id: selectedPsu === 'standalone' ? null : selectedPsu
      });
      
      toast.success('Settings applied successfully');
      onSuccess?.();
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Failed to apply settings');
    } finally {
      setApplying(false);
    }
  };

  const handleRestart = async () => {
    if (!confirm(`Restart ${device.name}?`)) return;

    try {
      await api.devices.restart(device.name);
      toast.success('Device restart initiated');
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Failed to restart device');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[var(--dark-gray)] border-2 border-[var(--matrix-green)] text-[var(--text-primary)] max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-glow-green">
            ⚙️ DEVICE_CONFIG
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Device Info */}
          <div className="bg-[var(--grid-gray)] border border-[var(--neon-cyan)] rounded p-3">
            <div className="text-[var(--neon-cyan)] font-bold">{device.name}</div>
            <div className="text-[var(--text-secondary)] text-sm">{device.model}</div>
            {device.status && (
              <div className="text-xs text-[var(--text-muted)] mt-1">
                Current: {device.status.voltage}mV @ {device.status.frequency}MHz | {device.status.temp.toFixed(1)}°C
              </div>
            )}
          </div>

          {/* IP Address */}
          <div>
            <Label className="text-[var(--text-secondary)]">IP Address</Label>
            <Input
              type="text"
              value={ipAddress}
              onChange={(e) => setIpAddress(e.target.value)}
              placeholder="e.g., 192.168.1.50"
              className="mt-1"
            />
          </div>

          {/* Voltage */}
          <div>
            <Label className="text-[var(--text-secondary)]">Core Voltage (mV)</Label>
            <Input
              type="number"
              value={voltage}
              onChange={(e) => setVoltage(parseInt(e.target.value))}
              min={1000}
              max={1400}
              step={25}
              className="mt-1"
            />
            <div className="text-xs text-[var(--text-muted)] mt-1">
              Range: 1000-1400 mV (recommended: 1100-1300)
            </div>
          </div>

          {/* Frequency */}
          <div>
            <Label className="text-[var(--text-secondary)]">Frequency (MHz)</Label>
            <Input
              type="number"
              value={frequency}
              onChange={(e) => setFrequency(parseInt(e.target.value))}
              min={300}
              max={700}
              step={25}
              className="mt-1"
            />
            <div className="text-xs text-[var(--text-muted)] mt-1">
              Range: 300-700 MHz (recommended: 400-600)
            </div>
          </div>

          {/* PSU Assignment */}
          <div>
            <Label className="text-[var(--text-secondary)]">PSU Assignment</Label>
            <Select value={selectedPsu} onValueChange={setSelectedPsu}>
              <SelectTrigger className="mt-1 bg-[var(--bg-primary)] border-[var(--grid-gray)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[var(--dark-gray)] border-[var(--matrix-green)]">
                <SelectItem value="standalone">Standalone (Own PSU)</SelectItem>
                {psus.map((psu: any) => (
                  <SelectItem key={psu.id} value={psu.id}>
                    {psu.name} ({psu.wattage}W{psu.voltage ? `, ${psu.voltage}V@${psu.amperage ?? '?'}A` : ''})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-xs text-[var(--text-muted)] mt-1">
              Assign device to a shared PSU or mark as standalone
            </div>
          </div>

          {/* Fan Control */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-[var(--text-secondary)]">Auto Fan Control</Label>
              <Switch
                checked={fanAuto}
                onCheckedChange={setFanAuto}
              />
            </div>

            {fanAuto && (
              <div>
                <Label className="text-[var(--text-secondary)]">Target Temperature (°C)</Label>
                <Input
                  type="number"
                  value={targetTemp}
                  onChange={(e) => setTargetTemp(parseInt(e.target.value))}
                  min={40}
                  max={75}
                  step={5}
                  className="mt-1"
                />
                <div className="text-xs text-[var(--text-muted)] mt-1">
                  Fan speed will adjust to maintain this temperature
                </div>
              </div>
            )}
          </div>

          {/* Warning */}
          <div className="bg-[var(--error-red)]/10 border border-[var(--error-red)] rounded p-3 text-xs text-[var(--text-secondary)]">
            <strong className="text-[var(--error-red)]">⚠️ Warning:</strong> Incorrect settings may cause instability or hardware damage. Test carefully and monitor temperatures.
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4">
            <Button
              onClick={handleApplySettings}
              disabled={applying}
              className="flex-1 btn-matrix"
            >
              {applying ? 'APPLYING...' : '✓ APPLY_SETTINGS'}
            </Button>
            <Button
              onClick={handleRestart}
              className="btn-cyan"
            >
              🔄 RESTART
            </Button>
            <Button
              onClick={onClose}
              disabled={applying}
              className="bg-[var(--grid-gray)] hover:bg-[var(--grid-gray)]/80"
            >
              CANCEL
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
