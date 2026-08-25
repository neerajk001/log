import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        graphite: '#15171b',
        surface: '#1e2227',
        surfaceRaised: '#262b32',
        chalk: '#ece8e0',
        chalkDim: '#9a978f',
        rust: '#c1440e',
        rustSoft: '#e0603a',
        steel: '#5b6470',
        moss: '#6f9d6a',
        hairline: '#2c313a',
      },
      fontFamily: {
        display: ['var(--font-oswald)', 'sans-serif'],
        body: ['var(--font-inter)', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'monospace'],
      },
      borderRadius: {
        card: '12px',
        cardLg: '18px',
      },
    },
  },
  plugins: [],
};

export default config;
