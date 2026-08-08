import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/hooks/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Nova's primary accent — a deep indigo/violet, distinct from
        // Telegram's signature blue. Used for the send button, active
        // states, own-message bubbles, and links.
        nova: {
          50: '#f2f1fe',
          100: '#e6e4fd',
          200: '#cdc9fb',
          300: '#aca4f7',
          400: '#9186f3',
          500: '#7361ec',
          600: '#5f45de',
          700: '#4f36bf',
          800: '#412e9b',
          900: '#382a7c',
          950: '#221850',
        },
        // Neutral surface scale used for panels, cards, and backgrounds.
        // Named "ink" to keep it distinct from Tailwind's default "slate".
        ink: {
          0: '#ffffff',
          50: '#f7f7f9',
          100: '#eeeef2',
          200: '#dcdce3',
          300: '#bcbcc9',
          400: '#8f8fa3',
          500: '#6c6c82',
          600: '#54546a',
          700: '#404054',
          800: '#292935',
          850: '#1e1e28',
          900: '#16161e',
          950: '#0d0d12',
        },
        // Semantic status colors.
        online: '#34d399',
        away: '#fbbf24',
        danger: '#f2555a',
        // CSS-variable-backed tokens so components can theme without
        // knowing whether the app is currently in light or dark mode.
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          raised: 'rgb(var(--surface-raised) / <alpha-value>)',
          sunken: 'rgb(var(--surface-sunken) / <alpha-value>)',
        },
        border: 'rgb(var(--border) / <alpha-value>)',
        foreground: {
          DEFAULT: 'rgb(var(--foreground) / <alpha-value>)',
          muted: 'rgb(var(--foreground-muted) / <alpha-value>)',
          subtle: 'rgb(var(--foreground-subtle) / <alpha-value>)',
        },
        bubble: {
          own: 'rgb(var(--bubble-own) / <alpha-value>)',
          'own-foreground': 'rgb(var(--bubble-own-foreground) / <alpha-value>)',
          other: 'rgb(var(--bubble-other) / <alpha-value>)',
          'other-foreground': 'rgb(var(--bubble-other-foreground) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: [
          'var(--font-sans)',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
      },
      borderRadius: {
        bubble: '1.125rem',
        'bubble-tail': '0.25rem',
      },
      boxShadow: {
        composer: '0 -1px 0 0 rgb(var(--border))',
        panel: '0 4px 24px -4px rgb(0 0 0 / 0.12)',
        'panel-dark': '0 4px 24px -4px rgb(0 0 0 / 0.4)',
      },
      keyframes: {
        'message-in': {
          '0%': { opacity: '0', transform: 'translateY(6px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'typing-dot': {
          '0%, 60%, 100%': { transform: 'translateY(0)', opacity: '0.4' },
          '30%': { transform: 'translateY(-3px)', opacity: '1' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.6' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-468px 0' },
          '100%': { backgroundPosition: '468px 0' },
        },
      },
      animation: {
        'message-in': 'message-in 180ms cubic-bezier(0.16, 1, 0.3, 1)',
        'typing-dot': 'typing-dot 1.2s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 1.6s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        shimmer: 'shimmer 1.5s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
