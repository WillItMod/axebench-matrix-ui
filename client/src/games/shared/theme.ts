export const palette = {
  bg: '#050708',
  panel: '#0b1114',
  panelAlt: '#0e1418',
  line: '#1f2f2e',
  neon: '#2af598',
  neonSoft: '#6efacb',
  cyan: '#3ad5ff',
  amber: '#f6c35f',
  orange: '#ff914d',
  red: '#ff5555',
  white: '#e8f3ef',
};

export const gradients = {
  surface:
    'linear-gradient(140deg, rgba(16,185,129,0.08), rgba(14,116,144,0.05) 45%, rgba(255,145,77,0.06))',
  glow:
    'radial-gradient(circle at 20% 20%, rgba(46, 213, 115, 0.16), transparent 35%), radial-gradient(circle at 80% 30%, rgba(58, 213, 255, 0.12), transparent 35%)',
};

export const typography = {
  heading: { fontFamily: 'Inter, "IBM Plex Sans", system-ui', fontSize: 18 },
  mono: { fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular', fontSize: 12 },
};

export const fx = {
  glowShadow: [0, 0, 16, palette.neon],
  softShadow: [0, 0, 12, 'rgba(0,0,0,0.35)'],
};

export const accentCycle = [palette.neon, palette.cyan, palette.orange, palette.amber];

export const pickAccent = (index: number) => accentCycle[index % accentCycle.length];
