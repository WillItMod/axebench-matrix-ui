import { useState, useEffect } from 'react';
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
  editPsu?: { id: string; name: string; wattage: number } | null;
}

export default function PsuModal({ open, onClose, onSave, editPsu }: PsuModalProps) {
  const [name, setName] = useState('');
  const [wattage, setWattage] = useState(25);
  const [loading, setLoading] = useState(false);
  
  // Update form when editPsu changes
  useEffect(() => {
    if (editPsu) {
      setName(editPsu.name);
      setWattage(editPsu.wattage);
    } else {
      setName('');
      setWattage(25);
    }
  }, [editPsu, open]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('PSU name is required');
      return;
    }

    if (wattage < 10 || wattage > 1000) {
      toast.error('Wattage must be between 10W and 1000W');
      return;
    }

    try {
      setLoading(true);
      if (editPsu) {
        await api.psus.update(editPsu.id, {
          name: name.trim(),
          wattage,
        });
        toast.success('PSU updated successfully');
      } else {
        await api.psus.create({
          name: name.trim(),
          wattage,
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
    setWattage(25);
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
