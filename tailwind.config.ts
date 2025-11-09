import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: {
        '2xl': '1400px'
      }
    },
    extend: {
      colors: {
        background: {
          DEFAULT: '#0E0E10',
          surface: '#1A1D21',
          card: 'rgba(255, 255, 255, 0.08)'
        },
        border: 'rgba(255, 255, 255, 0.1)',
        brand: {
          DEFAULT: '#0EA5E9',
          foreground: '#0F172A',
          soft: '#06B6D4',
          accent: '#EAB308'
        },
        muted: {
          DEFAULT: 'rgba(255, 255, 255, 0.06)',
          foreground: 'rgba(255, 255, 255, 0.55)'
        },
        foreground: {
          DEFAULT: '#F8FAFC',
          muted: '#94A3B8'
        },
        destructive: {
          DEFAULT: '#EF4444',
          foreground: '#F8FAFC'
        },
        success: {
          DEFAULT: '#10B981',
          foreground: '#F8FAFC'
        }
      },
      fontFamily: {
        sans: [
          'Inter',
          '"HarmonyOS Sans SC"',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'sans-serif'
        ]
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #0E0E10 0%, #1A1D21 100%)'
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.5rem',
        '3xl': '2rem'
      },
      boxShadow: {
        glass: '0 20px 45px -20px rgba(15, 23, 42, 0.45)',
        focus: '0 0 0 3px rgba(14, 165, 233, 0.35)'
      },
      backdropBlur: {
        12: '12px'
      },
      transitionTimingFunction: {
        'out-ease': 'cubic-bezier(0.16, 1, 0.3, 1)'
      },
      transitionDuration: {
        200: '200ms',
        250: '250ms',
        300: '300ms'
      },
      keyframes: {
        'fade-slide-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        'pulse-border': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(14, 165, 233, 0.45)' },
          '50%': { boxShadow: '0 0 0 6px rgba(14, 165, 233, 0)' }
        }
      },
      animation: {
        'fade-in': 'fade-slide-up 0.25s ease-out both',
        'pulse-border': 'pulse-border 2.5s ease-out infinite'
      }
    }
  },
  plugins: [animate]
};

export default config;
