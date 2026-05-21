import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Indigo Ledger - Precision Tonal Architecture
        'primary': '#001567',
        'primary-container': '#0a2896',
        'primary-fixed': '#dee1ff',
        'primary-fixed-dim': '#bac3ff',
        'on-primary': '#ffffff',
        'on-primary-container': '#8699ff',
        'on-primary-fixed': '#001159',
        'on-primary-fixed-variant': '#233ba6',

        'secondary': '#555f71',
        'secondary-container': '#d9e3f9',
        'secondary-fixed': '#d9e3f9',
        'secondary-fixed-dim': '#bdc7dc',
        'on-secondary': '#ffffff',
        'on-secondary-container': '#5b6577',
        'on-secondary-fixed': '#121c2b',
        'on-secondary-fixed-variant': '#3d4759',

        'tertiary': '#6f5d25',
        'tertiary-container': '#c0a969',
        'tertiary-fixed': '#fae09b',
        'tertiary-fixed-dim': '#ddc582',
        'on-tertiary': '#ffffff',
        'on-tertiary-container': '#ffd2be',
        'on-tertiary-fixed': '#351000',
        'on-tertiary-fixed-variant': '#7b2f00',

        'error': '#ba1a1a',
        'error-container': '#ffdad6',
        'on-error': '#ffffff',
        'on-error-container': '#93000a',

        // Surface hierarchy (tonal layering, no borders)
        'surface': '#f7f9fc',
        'surface-bright': '#f7f9fc',
        'surface-dim': '#d8dadd',
        'surface-variant': '#e0e3e6',
        'surface-container-lowest': '#ffffff',
        'surface-container-low': '#f2f4f7',
        'surface-container': '#eceef1',
        'surface-container-high': '#e6e8eb',
        'surface-container-highest': '#e0e3e6',
        'surface-tint': '#3f55bf',

        'on-surface': '#191c1e',
        'on-surface-variant': '#47464e',
        'on-background': '#191c1e',
        'background': '#f7f9fc',

        'outline': '#78767f',
        'outline-variant': '#c8c5cf',

        'inverse-surface': '#2d3133',
        'inverse-on-surface': '#eff1f3',
        'inverse-primary': '#bac3ff',
      },
      fontFamily: {
        headline: ['Manrope', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        label: ['Inter', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        lg: '1rem',
        xl: '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
        full: '9999px',
      },
      boxShadow: {
        'ambient': '0 12px 32px rgba(25, 28, 30, 0.06)',
        'ambient-lg': '0 12px 48px rgba(25, 28, 30, 0.08)',
        'primary-glow': '0 8px 20px rgba(0, 21, 103, 0.15)',
        'primary-glow-lg': '0 12px 24px rgba(0, 21, 103, 0.25)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
