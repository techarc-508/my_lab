import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        /* Neon palette from v4 design */
        'neon-pink': '#ff007f',
        'neon-cyan': '#00f3ff',
        'neon-purple': '#7a00ff',
        'neon-yellow': '#ffb703',

        /* Legacy brand aliases (keep for existing components) */
        'hot-pink': '#FF006E',
        'purple': '#8338EC',
        'electric-blue': '#3A86FF',
        'brand': '#ff007f',
        'brand-light': '#ff3399',
        'brand-logo-ring': '#C026D3',
        'accent-link': '#ff007f',
        'accent-like': '#EF4444',

        /* Retro palette */
        'retro-sand': '#fbf7f0',
        'retro-terracotta': '#e07a5f',
        'retro-sage': '#81b29a',
        'retro-navy': '#3d5a80',

        /* Themed surfaces — CSS vars for dark/light switching */
        'surface-base': 'var(--color-surface-base)',
        'surface-raised': 'var(--color-surface-raised)',
        'surface-sunken': 'var(--color-surface-sunken)',
        'surface-overlay': 'var(--color-surface-overlay)',
        'surface-queue': 'var(--color-surface-queue)',

        /* Light surfaces */
        'surface-light': '#F7F7FB',
        'surface-light-hover': '#EEEEF5',
        'surface-light-card': '#FFFFFF',

        /* Borders */
        'border-default': 'var(--color-border-default)',
        'border-strong': 'var(--color-border-strong)',
        'border-light': '#E2E2EC',
        'border-light-strong': '#C4C0D8',

        /* Text — themed */
        'content-primary': 'var(--color-content-primary)',
        'content-secondary': 'var(--color-content-secondary)',
        'content-tertiary': 'var(--color-content-tertiary)',

        /* Text — light bg */
        'text-light-primary': '#111028',
        'text-light-secondary': '#6B6887',
        'text-light-muted': '#B0AEBF',

        /* v2 semantic tokens */
        'surface-card': 'var(--color-surface-card)',
        'surface-deep': 'var(--color-surface-deep)',
        'text-muted': 'var(--color-text-muted)',
        'border-subtle': 'var(--color-border-subtle)',
        'surface-dropdown': 'var(--color-surface-dropdown)',

        /* Misc */
        'rank': '#C4C0D8',
        'success': '#00F5A0',
        'warning': '#FFD700',
        'error': '#FF3366',
        'info': '#3A86FF',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
        body: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Mono"', 'monospace'],
        serif: ['"Playfair Display"', 'serif'],
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
        'glow-pink-sm': '0 0 8px rgba(255, 0, 127, 0.4)',
        'glow-pink-md': '0 0 20px rgba(255, 0, 127, 0.5)',
        'glow-cyan-sm': '0 0 8px rgba(0, 243, 255, 0.4)',
        'glow-cyan-md': '0 0 20px rgba(0, 243, 255, 0.5)',
        'glow-purple-sm': '0 0 8px rgba(122, 0, 255, 0.4)',
        'glow-combo': '0 0 20px rgba(255, 0, 127, 0.3), 0 0 40px rgba(122, 0, 255, 0.2)',
        'neon-pink': '0 0 8px rgba(255, 0, 127, 0.3), inset 0 0 8px rgba(255, 0, 127, 0.2)',
        'neon-cyan': '0 0 8px rgba(0, 243, 255, 0.3), inset 0 0 8px rgba(0, 243, 255, 0.2)',
        'brushed-metal': 'inset 0 1px 1px rgba(255,255,255,0.1), 0 10px 25px -5px rgba(0,0,0,0.5)',
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #ff007f, #7a00ff)',
        'gradient-brand': 'linear-gradient(135deg, #ff007f, #00f3ff)',
        'gradient-neon': 'linear-gradient(135deg, #ff007f, #7a00ff, #00f3ff)',
        'gradient-dark': 'linear-gradient(135deg, #07060e, #12101f)',
        'gradient-light': 'linear-gradient(135deg, #fbf7f0, #FFFFFF)',
        'gradient-brushed': 'linear-gradient(145deg, #18181b, #09090b)',
      },
      backdropBlur: {
        'glass': '24px',
      },
      animation: {
        'spin-slow': 'spin 12s linear infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'crt-flicker': 'crt-flicker 0.15s infinite',
        'grid-travel': 'grid-travel 20s linear infinite',
      },
      keyframes: {
        'crt-flicker': {
          '0%': { opacity: '0.98' },
          '50%': { opacity: '1' },
          '100%': { opacity: '0.99' },
        },
        'grid-travel': {
          '0%': { backgroundPosition: '0 0' },
          '100%': { backgroundPosition: '0 40px' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config
