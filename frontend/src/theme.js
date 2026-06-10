export const FINANCE_TABS = new Set([
  'dashboard', 'analysis', 'investments', 'personal', 'loans', 'history'
])

export const THEMES = {
  // ── Capital — флагман: частен wealth terminal (ink + brass + sage) ──────────
  capital: {
    label: 'Capital',
    hint: 'частна банка · brass',
    icon: '◇',
    vars: {
      '--page-bg': '#091310',
      '--page-fg': '#ECE6D7',
      '--shell-bg': '#0C1A15',
      '--shell-fg': '#9AA59C',
      '--shell-fg-strong': '#ECE6D7',
      '--shell-hover-bg': 'rgba(216,182,106,0.10)',
      '--accent': '#D8B66A',
      '--accent-fg': '#091310',
      '--surface': '#163026',
      '--surface-border': 'rgba(236,230,215,0.20)',
      '--muted': '#9AA69B',
      '--font-display': "'Fraunces', Georgia, serif",
      '--font-sans': "'Hanken Grotesk', system-ui, sans-serif",
      '--font-mono': "'Space Mono', ui-monospace, monospace",
      '--radius': '14px',
      '--shadow-card': '0 18px 50px -28px rgba(0,0,0,0.65)',
    }
  },
  // ── Ivory — светъл премиум: ink masthead + топла хартия + brass ────────────
  ivory: {
    label: 'Ivory',
    hint: 'светло · хартия · brass',
    icon: '◈',
    vars: {
      '--page-bg': '#F2EEE3',
      '--page-fg': '#1B201C',
      '--shell-bg': '#0F1E18',
      '--shell-fg': '#B8BEB2',
      '--shell-fg-strong': '#F2EEE3',
      '--shell-hover-bg': 'rgba(216,182,106,0.14)',
      '--accent': '#B5872F',
      '--accent-fg': '#FFFBF2',
      '--surface': '#FBF8F1',
      '--surface-border': '#E6DFCF',
      '--muted': '#6E746A',
      '--font-display': "'Fraunces', Georgia, serif",
      '--font-sans': "'Hanken Grotesk', system-ui, sans-serif",
      '--font-mono': "'Space Mono', ui-monospace, monospace",
      '--radius': '12px',
      '--shadow-card': '0 1px 2px rgba(20,15,5,0.05), 0 8px 24px -18px rgba(20,15,5,0.18)',
    }
  },
  current: {
    label: 'Sky Capital',
    hint: 'оригинална визия',
    icon: '🏠',
    vars: {
      '--page-bg': '#f0f2f8',
      '--page-fg': '#0f172a',
      '--shell-bg': '#1a1a2e',
      '--shell-fg': '#cbd5e1',
      '--shell-fg-strong': '#ffffff',
      '--shell-hover-bg': 'rgba(255,255,255,0.10)',
      '--accent': '#4AABCC',
      '--accent-fg': '#ffffff',
      '--surface': '#ffffff',
      '--surface-border': '#e2e8f0',
      '--muted': '#64748b',
      '--font-display': "'Fraunces', Georgia, serif",
      '--font-sans': 'system-ui, -apple-system, sans-serif',
      '--font-mono': 'ui-monospace, SFMono-Regular, monospace',
      '--radius': '8px',
      '--shadow-card': '0 1px 2px rgba(0,0,0,0.06)',
    }
  },
  linear: {
    label: 'Linear',
    hint: 'минимално, чисто',
    icon: '◐',
    vars: {
      '--page-bg': '#ffffff',
      '--page-fg': '#111827',
      '--shell-bg': '#ffffff',
      '--shell-fg': '#6b7280',
      '--shell-fg-strong': '#111827',
      '--shell-hover-bg': '#f3f4f6',
      '--accent': '#6366f1',
      '--accent-fg': '#ffffff',
      '--surface': '#ffffff',
      '--surface-border': '#e5e7eb',
      '--muted': '#9ca3af',
      '--font-sans': "'Inter', system-ui, sans-serif",
      '--font-mono': "'JetBrains Mono', ui-monospace, monospace",
      '--radius': '6px',
      '--shadow-card': 'none',
    }
  },
  stripe: {
    label: 'Stripe',
    hint: 'премиум SaaS',
    icon: '◑',
    vars: {
      '--page-bg': '#fafafa',
      '--page-fg': '#111827',
      '--shell-bg': '#ffffff',
      '--shell-fg': '#6b7280',
      '--shell-fg-strong': '#111827',
      '--shell-hover-bg': '#f3f4f6',
      '--accent': '#10b981',
      '--accent-fg': '#ffffff',
      '--surface': '#ffffff',
      '--surface-border': '#e5e7eb',
      '--muted': '#9ca3af',
      '--font-sans': "'Inter', system-ui, sans-serif",
      '--font-mono': "'JetBrains Mono', ui-monospace, monospace",
      '--radius': '12px',
      '--shadow-card': '0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.06)',
    }
  },
  bloomberg: {
    label: 'Bloomberg',
    hint: 'тъмен, dense, mono',
    icon: '●',
    vars: {
      '--page-bg': '#0B0F17',
      '--page-fg': '#e5e7eb',
      '--shell-bg': '#0F1622',
      '--shell-fg': '#94a3b8',
      '--shell-fg-strong': '#ffffff',
      '--shell-hover-bg': 'rgba(255,255,255,0.05)',
      '--accent': '#10b981',
      '--accent-fg': '#0B0F17',
      '--surface': '#0F1622',
      '--surface-border': '#1f2937',
      '--muted': '#64748b',
      '--font-sans': "'Inter', system-ui, sans-serif",
      '--font-mono': "'JetBrains Mono', ui-monospace, monospace",
      '--radius': '4px',
      '--shadow-card': 'none',
    }
  }
}

export const THEME_ORDER = ['ivory', 'capital', 'current', 'linear', 'stripe', 'bloomberg']
