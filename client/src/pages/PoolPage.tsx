import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Layers, Plus, Save, Trash2, Globe, User, Key } from "lucide-react";
import { toast } from "sonner";

export default function PoolPage() {
  const [pools, setPools] = useState<any[]>([]);
  const [newPool, setNewPool] = useState({ name: "", url: "", user: "", pass: "" });

  const PRESETS = [
    { name: "Ocean Pool", url: "stratum+tcp://ocean.pk:3333" },
    { name: "Lincoin", url: "stratum+tcp://lincoin.com:3333" },
    { name: "CKPool", url: "stratum+tcp://solo.ckpool.org:3333" },
    { name: "Public Pool", url: "stratum+tcp://public-pool.io:21496" },
    { name: "Braiins Pool", url: "stratum+tcp://stratum.braiins.com:3333" },
    { name: "NiceHash", url: "stratum+tcp://sha256.auto.nicehash.com:9200" },
  ];

  useState(() => {
    fetchPools();
  });

  async function fetchPools() {
    try {
      const res = await fetch('/pool/api/pools');
      if (res.ok) {
        const data = await res.json();
        setPools(data);
      }
    } catch (err) {
      console.error(err);
    }
  }

  const handleAddPool = async () => {
    if (!newPool.name || !newPool.url) {
      toast.error("Pool Name and URL are required");
      return;
    }
    
    try {
      const res = await fetch('/pool/api/pools', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(newPool)
      });
      
      if (res.ok) {
        toast.success("Pool configuration saved");
        setNewPool({ name: "", url: "", user: "", pass: "" });
        fetchPools();
      } else {
        toast.error("Failed to save pool");
      }
    } catch (err) {
      toast.error("Error saving pool");
    }
  };

  const handleDeletePool = async (id: number) => {
    if (!confirm("Delete this pool?")) return;
    try {
      await fetch(`/pool/api/pools/${id}`, { method: 'DELETE' });
      toast.success("Pool configuration removed");
      fetchPools();
    } catch (err) {
      toast.error("Error removing pool");
    }
  };

  const applyPreset = (preset: any) => {
    setNewPool({ ...newPool, name: preset.name, url: preset.url });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold font-mono text-white glow-text">POOL MANAGEMENT</h1>
          <p className="text-muted-foreground font-mono text-sm">Configure mining stratums and failover rules.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Add New Pool Form */}
        <Card className="glass-panel border-neon-cyan/30 h-fit">
          <CardHeader>
            <CardTitle className="text-neon-cyan font-mono flex items-center gap-2">
              <Plus className="h-5 w-5" /> ADD NEW POOL
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-mono text-muted-foreground">QUICK PRESETS</Label>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map(p => (
                  <Button 
                    key={p.name} 
                    variant="outline" 
                    size="sm" 
                    className="text-xs h-6 border-white/10 hover:bg-white/10"
                    onClick={() => applyPreset(p)}
                  >
                    {p.name}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-mono text-muted-foreground">POOL NAME</Label>
              <Input 
                className="font-mono bg-black/40 border-white/10" 
                placeholder="e.g. Primary Pool"
                value={newPool.name}
                onChange={e => setNewPool({...newPool, name: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-mono text-muted-foreground">STRATUM URL</Label>
              <div className="relative">
                <Globe className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  className="font-mono bg-black/40 border-white/10 pl-9" 
                  placeholder="stratum+tcp://..."
                  value={newPool.url}
                  onChange={e => setNewPool({...newPool, url: e.target.value})}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-mono text-muted-foreground">USERNAME / WALLET</Label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  className="font-mono bg-black/40 border-white/10 pl-9" 
                  placeholder="Wallet Address or User.Worker"
                  value={newPool.user}
                  onChange={e => setNewPool({...newPool, user: e.target.value})}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-mono text-muted-foreground">PASSWORD</Label>
              <div className="relative">
                <Key className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  type="password"
                  className="font-mono bg-black/40 border-white/10 pl-9" 
                  placeholder="x"
                  value={newPool.pass}
                  onChange={e => setNewPool({...newPool, pass: e.target.value})}
                />
              </div>
            </div>
            <Button 
              onClick={handleAddPool}
              className="w-full bg-neon-cyan text-black hover:bg-neon-cyan/80 font-bold font-mono mt-4"
            >
              <Save className="mr-2 h-4 w-4" /> SAVE CONFIGURATION
            </Button>
          </CardContent>
        </Card>

        {/* Pool List */}
        <Card className="lg:col-span-2 glass-panel border-white/10">
          <CardHeader>
            <CardTitle className="text-white font-mono flex items-center gap-2">
              <Layers className="h-5 w-5" /> ACTIVE CONFIGURATIONS
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-white/5">
                  <TableHead className="font-mono text-neon-cyan">NAME</TableHead>
                  <TableHead className="font-mono text-neon-cyan">URL</TableHead>
                  <TableHead className="font-mono text-neon-cyan">USER</TableHead>
                  <TableHead className="font-mono text-neon-cyan text-right">ACTIONS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pools.map((pool) => (
                  <TableRow key={pool.id} className="border-white/5 hover:bg-white/5">
                    <TableCell className="font-mono font-bold text-white">{pool.name}</TableCell>
                    <TableCell className="font-mono text-muted-foreground text-xs">{pool.url}</TableCell>
                    <TableCell className="font-mono text-muted-foreground text-xs">{pool.user}</TableCell>
                    <TableCell className="text-right">
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        onClick={() => handleDeletePool(pool.id)}
                        className="h-8 w-8 hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
