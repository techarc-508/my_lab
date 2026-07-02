import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        /* Brand / Accent — Retrowave */
        'hot-pink': '#FF006E',
        'purple': '#8338EC',
        'electric-blue': '#3A86FF',
        'brand': '#8B5CF6',
        'brand-light': '#A78BFA',
        'brand-logo-ring': '#C026D3',
        'accent-link': '#7C3AED',
        'accent-like': '#EF4444',

        /* Dark surfaces (sidebar, player panel) */
        'surface-base': '#1B1A30',
        'surface-raised': '#211F38',
        'surface-sunken': '#0A0A2E',
        'surface-overlay': '#2A2847',
        'surface-queue': '#2E2C4A',

        /* Light surfaces (content panel) */
        'surface-light': '#F7F7FB',
        'surface-light-hover': '#EEEEF5',
        'surface-light-card': '#FFFFFF',

        /* Borders */
        'border-default': '#2A2A5A',
        'border-strong': '#4A4A7A',
        'border-light': '#E2E2EC',
        'border-light-strong': '#C4C0D8',

        /* Text — dark bg */
        'content-primary': '#FFFFFF',
        'content-secondary': '#A09DC0',
        'content-tertiary': '#6B6887',

        /* Text — light bg */
        'text-light-primary': '#111028',
        'text-light-secondary': '#6B6887',
        'text-light-muted': '#B0AEBF',

        /* Misc */
        'rank': '#C4C0D8',
        'success': '#00F5A0',
        'warning': '#FFD700',
        'error': '#FF3366',
        'info': '#3A86FF',
      },
      fontFamily: {
        display: ['Inter', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Mono"', 'monospace'],
      },
      fontSize: {
        'xs': '11px',
        'sm': '13px',
        'base': '15px',
        'lg': '18px',
        'xl': '24px',
        '2xl': '28px',
        '3xl': '34px',
        'hero': '52px',
      },
      borderRadius: {
        'sm': '8px',
        'md': '12px',
        'lg': '16px',
        'xl': '24px',
        '2xl': '32px',
        'full': '9999px',
      },
      spacing: {
        'sp-1': '4px',
        'sp-2': '8px',
        'sp-3': '12px',
        'sp-4': '16px',
        'sp-5': '20px',
        'sp-6': '24px',
        'sp-8': '32px',
        'sp-10': '40px',
        'sp-12': '48px',
      },
      boxShadow: {
        'card': '0 4px 24px rgba(0,0,0,0.32)',
        'panel': '0 8px 48px rgba(0,0,0,0.48)',
        'shell': '0 24px 64px rgba(0,0,0,0.60)',
        'btn': '0 2px 8px rgba(0,0,0,0.24)',
        'glow-pink-sm': '0 0 8px rgba(255, 0, 110, 0.4)',
        'glow-pink-md': '0 0 20px rgba(255, 0, 110, 0.5)',
        'glow-purple-sm': '0 0 8px rgba(131, 56, 236, 0.4)',
        'glow-combo': '0 0 20px rgba(255, 0, 110, 0.3), 0 0 40px rgba(131, 56, 236, 0.2)',
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #FF006E, #8338EC)',
        'gradient-brand': 'linear-gradient(135deg, #8B5CF6, #C026D3)',
        'gradient-dark': 'linear-gradient(135deg, #1B1A30, #211F38)',
        'gradient-light': 'linear-gradient(135deg, #F7F7FB, #FFFFFF)',
      },
      backdropBlur: {
        'glass': '24px',
      },
    },
  },
  plugins: [],
} satisfies Config
