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

export default function AddDeviceModal({ open, onClose, onSuccess }: AddDeviceModalProps) {
  const [ip, setIp] = useState('');
  const [name, setName] = useState('');
  const [model, setModel] = useState('gamma');
  const [detecting, setDetecting] = useState(false);
  const [detected, setDetected] = useState<any>(null);
  const [adding, setAdding] = useState(false);

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
      setModel(info.model || 'gamma');
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

    try {
      setAdding(true);
      await api.devices.add({
        name,
        ip,
        model,
        psu: { type: 'standalone', capacity_watts: 25, safe_watts: 20, warning_watts: 17.5 },
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
            <Select value={model} onValueChange={setModel}>
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
