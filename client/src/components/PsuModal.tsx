import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { toast } from 'sonner';

interface PsuModalProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  editPsu?: { id: string; name: string; wattage: number; voltage?: number; amperage?: number } | null;
}

export default function PsuModal({ open, onClose, onSave, editPsu }: PsuModalProps) {
  const [name, setName] = useState('');
  const [voltage, setVoltage] = useState(5);
  const [amperage, setAmperage] = useState(3);
  const [loading, setLoading] = useState(false);

  const derivedWattage = useMemo(() => {
    const watts = voltage * amperage;
    if (!Number.isFinite(watts) || watts <= 0) return 0;
    return Number(watts.toFixed(1));
  }, [voltage, amperage]);
  
  // Update form when editPsu changes
  useEffect(() => {
    if (editPsu) {
      setName(editPsu.name);
      if (editPsu.voltage && editPsu.amperage) {
        setVoltage(editPsu.voltage);
        setAmperage(editPsu.amperage);
      } else {
        // Derive a reasonable default voltage/amp from stored wattage (assume 5V profile if unknown)
        const assumedVoltage = 5;
        const derivedAmp = Number((editPsu.wattage / assumedVoltage).toFixed(1));
        setVoltage(assumedVoltage);
        setAmperage(derivedAmp || 3);
      }
    } else {
      setName('');
      setVoltage(5);
      setAmperage(3);
    }
  }, [editPsu, open]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('PSU name is required');
      return;
    }

    if (voltage <= 0 || amperage <= 0) {
      toast.error('Enter valid voltage and amperage values');
      return;
    }

    if (derivedWattage < 5 || derivedWattage > 2000) {
      toast.error('Calculated wattage must be between 5W and 2000W');
      return;
    }

    try {
      setLoading(true);
      if (editPsu) {
        await api.psus.update(editPsu.id, {
          name: name.trim(),
          wattage: derivedWattage,
          voltage,
          amperage,
        });
        toast.success('PSU updated successfully');
      } else {
        await api.psus.create({
          name: name.trim(),
          wattage: derivedWattage,
          voltage,
          amperage,
        });
        toast.success('PSU created successfully');
      }
      onSave();
      handleClose();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create PSU');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setName('');
    setVoltage(5);
    setAmperage(3);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-[var(--dark-gray)] border-[var(--matrix-green)] text-[var(--text-primary)] max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-glow-green">⚡ {editPsu ? 'EDIT_PSU' : 'CREATE_PSU'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* PSU Name */}
          <div>
            <Label className="text-[var(--text-secondary)]">PSU Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Main PSU, Backup PSU, Rack PSU 1"
              className="mt-1 bg-[var(--bg-primary)] border-[var(--grid-gray)] text-[var(--text-primary)]"
            />
          </div>

          {/* Voltage / Amperage */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[var(--text-secondary)]">Voltage (V)</Label>
              <Input
                type="number"
                value={voltage}
                onChange={(e) => setVoltage(parseFloat(e.target.value) || 0)}
                min={1}
                max={60}
                step="0.1"
                className="mt-1 bg-[var(--bg-primary)] border-[var(--grid-gray)] text-[var(--text-primary)]"
              />
            </div>
            <div>
              <Label className="text-[var(--text-secondary)]">Amperage (A)</Label>
              <Input
                type="number"
                value={amperage}
                onChange={(e) => setAmperage(parseFloat(e.target.value) || 0)}
                min={0.1}
                max={100}
                step="0.1"
                className="mt-1 bg-[var(--bg-primary)] border-[var(--grid-gray)] text-[var(--text-primary)]"
              />
            </div>
          </div>

          {/* Wattage */}
          <div>
            <Label className="text-[var(--text-secondary)]">Calculated Wattage</Label>
            <div className="mt-1 flex items-center justify-between rounded border border-[var(--grid-gray)] bg-[var(--bg-primary)] px-3 py-2">
              <div>
                <div className="text-[var(--text-primary)] font-semibold">{derivedWattage || 0} W</div>
                <div className="text-[var(--text-muted)] text-xs">
                  Based on Voltage × Amperage
                </div>
              </div>
              <div className="text-[var(--text-secondary)] text-xs">
                (Stock Gamma USB-C: 5V, 3A ≈ 15W)
              </div>
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-[var(--bg-primary)] border-l-4 border-[var(--neon-cyan)] p-3 rounded">
            <p className="text-sm text-[var(--text-secondary)]">
              <strong className="text-[var(--neon-cyan)]">ℹ️ Next Step:</strong>
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-2">
              After creating the PSU, assign devices to it using the device CONFIG button. 
              Devices can be set to "Standalone" (own PSU) or assigned to a shared PSU.
            </p>
          </div>

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
            {loading ? (editPsu ? 'UPDATING...' : 'CREATING...') : (editPsu ? 'UPDATE_PSU' : 'CREATE_PSU')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
