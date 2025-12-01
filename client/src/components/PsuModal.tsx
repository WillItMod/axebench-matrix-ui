import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import { toast } from 'sonner';

interface PsuModalProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
}

export default function PsuModal({ open, onClose, onSave }: PsuModalProps) {
  const [name, setName] = useState('');
  const [wattage, setWattage] = useState(25);
  const [type, setType] = useState<'shared' | 'independent'>('independent');
  const [devices, setDevices] = useState<any[]>([]);
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      loadDevices();
    }
  }, [open]);

  const loadDevices = async () => {
    try {
      const deviceList = await api.devices.list();
      setDevices(deviceList);
    } catch (error: any) {
      toast.error('Failed to load devices');
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('PSU name is required');
      return;
    }

    if (wattage < 10 || wattage > 1000) {
      toast.error('Wattage must be between 10W and 1000W');
      return;
    }

    if (type === 'shared' && selectedDevices.length === 0) {
      toast.error('Select at least one device for shared PSU');
      return;
    }

    try {
      setLoading(true);
      await api.psus.create({
        name: name.trim(),
        wattage,
        type,
        devices: type === 'shared' ? selectedDevices : [],
      });
      toast.success('PSU configuration saved');
      onSave();
      handleClose();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save PSU');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setName('');
    setWattage(25);
    setType('independent');
    setSelectedDevices([]);
    onClose();
  };

  const toggleDevice = (deviceName: string) => {
    setSelectedDevices(prev =>
      prev.includes(deviceName)
        ? prev.filter(d => d !== deviceName)
        : [...prev, deviceName]
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-[var(--dark-gray)] border-[var(--matrix-green)] text-[var(--text-primary)] max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-glow-green">⚡ PSU_CONFIGURATION</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* PSU Name */}
          <div>
            <Label className="text-[var(--text-secondary)]">PSU Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Main PSU, Backup PSU"
              className="mt-1 bg-[var(--bg-primary)] border-[var(--grid-gray)] text-[var(--text-primary)]"
            />
          </div>

          {/* Wattage */}
          <div>
            <Label className="text-[var(--text-secondary)]">Maximum Wattage (W)</Label>
            <Input
              type="number"
              value={wattage}
              onChange={(e) => setWattage(parseInt(e.target.value) || 25)}
              min={10}
              max={1000}
              className="mt-1 bg-[var(--bg-primary)] border-[var(--grid-gray)] text-[var(--text-primary)]"
            />
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Stock BitAxe PSU: 25W | Upgraded PSU: 30-50W
            </p>
          </div>

          {/* PSU Type */}
          <div>
            <Label className="text-[var(--text-secondary)]">PSU Mode</Label>
            <Select value={type} onValueChange={(v: any) => setType(v)}>
              <SelectTrigger className="mt-1 bg-[var(--bg-primary)] border-[var(--grid-gray)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[var(--dark-gray)] border-[var(--matrix-green)]">
                <SelectItem value="independent">Independent (Each device has own PSU)</SelectItem>
                <SelectItem value="shared">Shared (Multiple devices share this PSU)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Device Selection (Shared Mode) */}
          {type === 'shared' && (
            <div>
              <Label className="text-[var(--text-secondary)] mb-2 block">Select Devices</Label>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 bg-[var(--bg-primary)] border border-[var(--grid-gray)] rounded">
                {devices.map((device) => (
                  <button
                    key={device.name}
                    onClick={() => toggleDevice(device.name)}
                    className={`px-3 py-2 rounded text-sm font-mono transition-colors ${
                      selectedDevices.includes(device.name)
                        ? 'bg-[var(--matrix-green)] text-black'
                        : 'bg-[var(--dark-gray)] text-[var(--text-secondary)] hover:bg-[var(--grid-gray)]'
                    }`}
                  >
                    {device.name}
                  </button>
                ))}
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Selected: {selectedDevices.length} device(s)
              </p>
            </div>
          )}

          {/* Safety Warnings */}
          <div className="bg-[var(--bg-primary)] border-l-4 border-yellow-500 p-3 rounded">
            <p className="text-sm text-[var(--text-secondary)]">
              <strong className="text-yellow-500">⚠️ Safety Limits:</strong>
            </p>
            <ul className="text-xs text-[var(--text-muted)] mt-2 space-y-1 ml-4 list-disc">
              <li><strong className="text-yellow-500">70% load:</strong> Yellow warning - approaching limit</li>
              <li><strong className="text-red-500">80% load:</strong> Red warning - dangerous territory</li>
              <li>Stock 25W PSU safe limit: ~20W per device</li>
              <li>Upgraded 30W+ PSU recommended for overclocking</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={handleClose}
            variant="outline"
            className="border-[var(--grid-gray)] text-[var(--text-secondary)]"
          >
            CANCEL
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading}
            className="btn-matrix"
          >
            {loading ? 'SAVING...' : 'SAVE_PSU'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
