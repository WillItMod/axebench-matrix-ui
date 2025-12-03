import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, MODEL_NAMES } from '@/lib/api';
import { toast } from 'sonner';

interface AddDeviceModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const MODEL_POWER_HINTS: Record<
  string,
  { volts: number; amps: number; note: string }
> = {
  gamma: { volts: 5, amps: 3, note: 'Gamma 601/602 uses USB-C 5V input' },
  supra: { volts: 12, amps: 2.5, note: 'Supra (BM1368) typically runs on 12V' },
  ultra: { volts: 12, amps: 2.5, note: 'Ultra (BM1366) typically runs on 12V' },
  hex: { volts: 12, amps: 5, note: 'Hex (BM1366 x6) 12V high-current rail' },
  max: { volts: 12, amps: 3, note: 'Max (BM1397) 12V input' },
  nerdqaxe: { volts: 5, amps: 3, note: 'NerdQAxe (BM1370) USB-C 5V input' },
  nerdqaxe_plus: { volts: 5, amps: 5, note: 'NerdQAxe+ (dual BM1370) 5V with higher current' },
  nerdqaxe_plus_plus: { volts: 5, amps: 8, note: 'NerdQAxe++ (quad BM1370) 5V high-current' },
};

const getModelPowerDefaults = (model: string) =>
  MODEL_POWER_HINTS[model] || { volts: 5, amps: 3, note: 'Default 5V profile (override if needed)' };

export default function AddDeviceModal({ open, onClose, onSuccess }: AddDeviceModalProps) {
  const [ip, setIp] = useState('');
  const [name, setName] = useState('');
  const [model, setModel] = useState('gamma');
  const [detecting, setDetecting] = useState(false);
  const [detected, setDetected] = useState<any>(null);
  const [adding, setAdding] = useState(false);
  const defaults = getModelPowerDefaults(model);
  const [voltage, setVoltage] = useState(defaults.volts);
  const [amperage, setAmperage] = useState(defaults.amps);

  const derivedWattage = Number((voltage * amperage).toFixed(1));

  const handleDetect = async () => {
    if (!ip) {
      toast.error('Enter IP address first');
      return;
    }

    try {
      setDetecting(true);
      const info = await api.devices.detect(ip);
      setDetected(info);
      setName(info.suggested_name || '');
      const modelKey = info.model || 'gamma';
      setModel(modelKey);
      const detectedDefaults = getModelPowerDefaults(modelKey);
      setVoltage(detectedDefaults.volts);
      setAmperage(detectedDefaults.amps);
      toast.success('Device detected successfully');
    } catch (error: any) {
      toast.error(error.message || 'Failed to detect device');
    } finally {
      setDetecting(false);
    }
  };

  const handleAdd = async () => {
    if (!name || !ip) {
      toast.error('Name and IP are required');
      return;
    }

    if (!voltage || voltage <= 0 || !amperage || amperage <= 0) {
      toast.error('Enter a valid voltage and amperage');
      return;
    }

    const capacity = derivedWattage > 0 ? derivedWattage : 25;
    const safe_watts = Number((capacity * 0.8).toFixed(1));
    const warning_watts = Number((capacity * 0.7).toFixed(1));

    try {
      setAdding(true);
      await api.devices.add({
        name,
        ip,
        model,
        psu: {
          type: 'standalone',
          capacity_watts: capacity,
          safe_watts,
          warning_watts,
          voltage,
          amperage,
        },
      });
      toast.success(`Device ${name} added successfully`);
      onSuccess();
      handleClose();
    } catch (error: any) {
      toast.error(error.message || 'Failed to add device');
    } finally {
      setAdding(false);
    }
  };

  const handleClose = () => {
    setIp('');
    setName('');
    setModel('gamma');
    setDetected(null);
    const reset = getModelPowerDefaults('gamma');
    setVoltage(reset.volts);
    setAmperage(reset.amps);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-[var(--dark-gray)] border-2 border-[var(--matrix-green)] text-[var(--text-primary)] max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-glow-green">
            ADD_NEW_DEVICE
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* IP Address with Auto-Detect */}
          <div>
            <Label className="text-[var(--text-secondary)]">IP Address</Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                placeholder="192.168.1.100"
                className="flex-1"
              />
              <Button
                onClick={handleDetect}
                disabled={detecting || !ip}
                className="btn-cyan"
              >
                {detecting ? '⟳' : '🔍'} DETECT
              </Button>
            </div>
          </div>

          {/* Detected Info */}
          {detected && (
            <div className="bg-[var(--grid-gray)] border border-[var(--matrix-green)] rounded p-3 text-sm">
              <div className="text-[var(--success-green)] font-bold mb-2">✓ DEVICE_DETECTED</div>
              <div className="space-y-1 text-[var(--text-secondary)]">
                <div>Model: <span className="text-[var(--text-primary)]">{detected.asic_model}</span></div>
                <div>Hostname: <span className="text-[var(--text-primary)]">{detected.hostname}</span></div>
                <div>Chips: <span className="text-[var(--text-primary)]">{detected.chip_count}</span></div>
              </div>
            </div>
          )}

          {/* Device Name */}
          <div>
            <Label className="text-[var(--text-secondary)]">Device Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Bitaxe"
              className="mt-1"
            />
          </div>

          {/* Model Selection */}
          <div>
            <Label className="text-[var(--text-secondary)]">Model</Label>
            <Select
              value={model}
              onValueChange={(value) => {
                setModel(value);
                const m = getModelPowerDefaults(value);
                setVoltage(m.volts);
                setAmperage(m.amps);
              }}
            >
              <SelectTrigger className="mt-1 bg-[var(--dark-gray)] border-[var(--grid-gray)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[var(--dark-gray)] border-[var(--matrix-green)]">
                {Object.entries(MODEL_NAMES).map(([key, label]) => (
                  <SelectItem key={key} value={key} className="text-[var(--text-primary)]">
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Reference input: {defaults.volts}V @ {defaults.amps}A — {defaults.note}
            </p>
          </div>

          {/* Power Inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[var(--text-secondary)]">Voltage (V)</Label>
              <Input
                type="number"
                value={voltage}
                onChange={(e) => setVoltage(parseFloat(e.target.value) || 0)}
                min={1}
                max={48}
                step="0.1"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-[var(--text-secondary)]">Amperage (A)</Label>
              <Input
                type="number"
                value={amperage}
                onChange={(e) => setAmperage(parseFloat(e.target.value) || 0)}
                min={0.1}
                max={20}
                step="0.1"
                className="mt-1"
              />
            </div>
          </div>
          <div className="text-sm text-[var(--text-primary)] bg-[var(--grid-gray)] border border-[var(--matrix-green)] rounded p-2 flex items-center justify-between">
            <div>
              <div className="font-semibold text-glow-green">Calculated Wattage</div>
              <div className="text-[var(--text-secondary)] text-xs">Used for PSU safety thresholds</div>
            </div>
            <div className="text-xl font-bold text-[var(--neon-cyan)]">{derivedWattage || 0} W</div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4">
            <Button
              onClick={handleAdd}
              disabled={adding || !name || !ip}
              className="flex-1 btn-matrix"
            >
              {adding ? 'ADDING...' : '➕ ADD_DEVICE'}
            </Button>
            <Button
              onClick={handleClose}
              disabled={adding}
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
