import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Clock, Save, Trash2, Zap, Moon, Sun } from "lucide-react";
import { toast } from "sonner";

export default function ShedPage() {
  const [schedules, setSchedules] = useState([
    { id: 1, timeStart: "08:00", timeEnd: "18:00", action: "Solar Mode (Max Hash)", icon: Sun },
    { id: 2, timeStart: "18:00", timeEnd: "08:00", action: "Eco Mode (Low Power)", icon: Moon }
  ]);

  const [newSchedule, setNewSchedule] = useState({ start: "", end: "", action: "Eco Mode" });

  const handleAddSchedule = () => {
    if (!newSchedule.start || !newSchedule.end) {
      toast.error("Start and End times are required");
      return;
    }
    setSchedules([...schedules, { 
      id: Date.now(), 
      timeStart: newSchedule.start, 
      timeEnd: newSchedule.end, 
      action: newSchedule.action,
      icon: Zap 
    }]);
    setNewSchedule({ start: "", end: "", action: "Eco Mode" });
    toast.success("Schedule rule added");
  };

  const handleDelete = (id: number) => {
    setSchedules(schedules.filter(s => s.id !== id));
    toast.success("Schedule rule removed");
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold font-mono text-white glow-text">FLEET SCHEDULER</h1>
          <p className="text-muted-foreground font-mono text-sm">Automate profile switching based on time of day.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Add Schedule Form */}
        <Card className="glass-panel border-neon-green/30 h-fit">
          <CardHeader>
            <CardTitle className="text-neon-green font-mono flex items-center gap-2">
              <Clock className="h-5 w-5" /> NEW RULE
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-mono text-muted-foreground">START TIME</Label>
                <Input 
                  type="time"
                  className="font-mono bg-black/40 border-white/10" 
                  value={newSchedule.start}
                  onChange={e => setNewSchedule({...newSchedule, start: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-mono text-muted-foreground">END TIME</Label>
                <Input 
                  type="time"
                  className="font-mono bg-black/40 border-white/10" 
                  value={newSchedule.end}
                  onChange={e => setNewSchedule({...newSchedule, end: e.target.value})}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-mono text-muted-foreground">ACTION PROFILE</Label>
              <Select 
                value={newSchedule.action} 
                onValueChange={v => setNewSchedule({...newSchedule, action: v})}
              >
                <SelectTrigger className="font-mono bg-black/40 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Eco Mode">Eco Mode (Low Power)</SelectItem>
                  <SelectItem value="Turbo Mode">Turbo Mode (Max Hash)</SelectItem>
                  <SelectItem value="Silent Mode">Silent Mode (Low Fan)</SelectItem>
                  <SelectItem value="Stop Mining">Stop Mining</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button 
              onClick={handleAddSchedule}
              className="w-full bg-neon-green text-black hover:bg-neon-green/80 font-bold font-mono mt-4"
            >
              <Save className="mr-2 h-4 w-4" /> ADD TO TIMELINE
            </Button>
          </CardContent>
        </Card>

        {/* Timeline Visualization */}
        <Card className="lg:col-span-2 glass-panel border-white/10">
          <CardHeader>
            <CardTitle className="text-white font-mono flex items-center gap-2">
              <Calendar className="h-5 w-5" /> DAILY TIMELINE
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {schedules.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground font-mono border border-dashed border-white/10 rounded-lg">
                NO ACTIVE SCHEDULES. ADD A RULE TO BEGIN.
              </div>
            ) : (
              <div className="space-y-3">
                {schedules.map((schedule) => (
                  <div 
                    key={schedule.id} 
                    className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/5 hover:border-neon-green/30 transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-neon-green/10 flex items-center justify-center text-neon-green">
                        <schedule.icon className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="font-mono font-bold text-white text-lg">
                          {schedule.timeStart} - {schedule.timeEnd}
                        </div>
                        <div className="font-mono text-xs text-neon-green">
                          {schedule.action}
                        </div>
                      </div>
                    </div>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      onClick={() => handleDelete(schedule.id)}
                      className="h-8 w-8 hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
