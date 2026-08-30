/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base: '#0a0e14',
          surface: '#111722',
          elevated: '#161d2b',
          hover: '#1b2435',
          border: '#222c3d',
        },
        ink: {
          primary: '#e6edf6',
          secondary: '#9fb0c8',
          muted: '#6b7c96',
          faint: '#475569',
        },
        accent: {
          DEFAULT: '#22d3ee',
          soft: '#0e7490',
          glow: 'rgba(34,211,238,0.35)',
        },
        success: { DEFAULT: '#34d399', soft: '#065f46' },
        warning: { DEFAULT: '#fbbf24', soft: '#78350f' },
        danger: { DEFAULT: '#f87171', soft: '#7f1d1d' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(34,211,238,0.25), 0 0 24px rgba(34,211,238,0.15)',
        panel: '0 8px 32px rgba(0,0,0,0.45)',
      },
      keyframes: {
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.7' },
          '70%': { transform: 'scale(1.3)', opacity: '0' },
          '100%': { transform: 'scale(1.3)', opacity: '0' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in': {
          from: { opacity: '0', transform: 'translateX(-8px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'blink': {
          '0%,100%': { opacity: '1' },
          '50%': { opacity: '0.2' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 1.4s ease-out infinite',
        'fade-in': 'fade-in 0.25s ease-out',
        'slide-in': 'slide-in 0.2s ease-out',
        'blink': 'blink 1s step-end infinite',
      },
    },
  },
  plugins: [],
};
