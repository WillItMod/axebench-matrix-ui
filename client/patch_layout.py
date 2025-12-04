# -*- coding: utf-8 -*-
from pathlib import Path
import re
p = Path('src/components/Layout.tsx')
t = p.read_text(errors='ignore')
pattern = r"                  className=\"flex items-center gap-2 text-3xl font-bold text-\[var\(--theme-primary\)\] hover:text-\[var\(--theme-secondary\)\] transition\"\s*title=\{secretUnlocked \? \"Satoshi's Forge unlocked\" : '???'\}\s*>[\s\S]*?</button>"
repl = "                  className=\\\"flex items-center gap-2 text-3xl font-bold text-[var(--theme-primary)] hover:text-[var(--theme-secondary)] transition\\\"\n                  title={secretUnlocked ? \\\"Satoshi's Forge unlocked\\\" : 'Secret challenges'}\n                >\n                  <span className=\\\"text-foreground\\\">AXE</span>\n                  <span className=\\\"relative inline-flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 via-orange-500 to-yellow-400 text-slate-900 shadow-[0_0_18px_rgba(251,191,36,0.75)] border-2 border-amber-200\\\">\n                    ?\n                  </span>\n                  <span className=\\\"text-foreground\\\">ENCH</span>\n                </button>"
new = re.sub(pattern, repl, t)
p.write_text(new)
