import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useTheme, themes, type ThemeName } from '@/contexts/ThemeContext';
import { Check } from 'lucide-react';

export default function Settings() {
  const { themeName, setTheme } = useTheme();

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-glow-cyan mb-2">SETTINGS</h1>
        <p className="text-[var(--text-secondary)]">Configure your AxeBench experience</p>
      </div>

      {/* Theme Selection */}
      <Card className="p-6 bg-black/80 border-neon-cyan">
        <h2 className="text-xl font-bold text-neon-cyan mb-4">THEME</h2>
        <p className="text-[var(--text-secondary)] mb-6">Choose your preferred color scheme</p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(themes).map(([key, theme]) => {
            const isSelected = themeName === key;
            
            return (
              <button
                key={key}
                onClick={() => setTheme(key as ThemeName)}
                className={`
                  relative p-4 rounded-lg border-2 transition-all
                  ${isSelected ? 'border-[var(--theme-primary)] shadow-lg' : 'border-gray-700 hover:border-gray-500'}
                `}
                style={{
                  background: `linear-gradient(135deg, ${theme.colors.background} 0%, ${theme.colors.surface} 100%)`
                }}
              >
                {/* Theme Preview */}
                <div className="space-y-3 mb-4">
                  <div className="flex items-center justify-between">
                    <div 
                      className="w-12 h-12 rounded-full"
                      style={{ background: theme.colors.primary }}
                    />
                    <div 
                      className="w-8 h-8 rounded"
                      style={{ background: theme.colors.accent }}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <div 
                      className="h-3 rounded"
                      style={{ background: theme.colors.primary, opacity: 0.8 }}
                    />
                    <div 
                      className="h-3 rounded w-2/3"
                      style={{ background: theme.colors.secondary, opacity: 0.6 }}
                    />
                  </div>

                  <div className="flex gap-2">
                    <div 
                      className="flex-1 h-8 rounded flex items-center justify-center text-xs font-bold"
                      style={{ 
                        background: theme.colors.primary,
                        color: theme.colors.background
                      }}
                    >
                      Button
                    </div>
                    <div 
                      className="flex-1 h-8 rounded border flex items-center justify-center text-xs"
                      style={{ 
                        borderColor: theme.colors.border,
                        color: theme.colors.text
                      }}
                    >
                      Outline
                    </div>
                  </div>
                </div>

                {/* Theme Name */}
                <div className="flex items-center justify-between">
                  <Label 
                    className="text-sm font-bold cursor-pointer"
                    style={{ color: theme.colors.text }}
                  >
                    {theme.label}
                  </Label>
                  {isSelected && (
                    <div 
                      className="w-6 h-6 rounded-full flex items-center justify-center"
                      style={{ background: theme.colors.success }}
                    >
                      <Check className="w-4 h-4" style={{ color: theme.colors.background }} />
                    </div>
                  )}
                </div>

                {/* Selected Border Glow */}
                {isSelected && (
                  <div 
                    className="absolute inset-0 rounded-lg pointer-events-none"
                    style={{
                      boxShadow: `0 0 20px ${theme.colors.primary}40`
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Additional Settings Placeholder */}
      <Card className="p-6 bg-black/80 border-neon-cyan">
        <h2 className="text-xl font-bold text-neon-cyan mb-4">PREFERENCES</h2>
        <p className="text-[var(--text-secondary)]">More settings coming soon...</p>
      </Card>
    </div>
  );
}
