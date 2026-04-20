/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Serif Approved Colors
        serif: {
          cyan: '#89CCF0',       // Primary brand cyan
          'cyan-light': '#b8e4f7',
          'cyan-dark': '#5ba8d4',
          blue: '#96b9d0',       // Muted blue-gray
          'blue-light': '#c4d8e6',
          'blue-dark': '#6a95b3',
          pink: '#f8c8dc',       // Accent pink
          'pink-light': '#fce4ee',
          'pink-dark': '#e99bbe',
          lavender: '#b8aadd',   // Accent purple/lavender
          'lavender-light': '#d9d0ed',
          'lavender-dark': '#9182c4',
        },
        // Primary brand - using Serif cyan
        primary: {
          50: '#eef9fd',
          100: '#d4eff9',
          200: '#b8e4f7',
          300: '#89CCF0',        // Serif cyan
          400: '#5ba8d4',
          500: '#3d8fbd',
          600: '#2d7399',
          700: '#255d7a',
          800: '#1e4a61',
          900: '#183c4f',
        },
        // Secondary - using Serif lavender
        secondary: {
          50: '#f5f3fa',
          100: '#e9e4f4',
          200: '#d9d0ed',
          300: '#b8aadd',        // Serif lavender
          400: '#9182c4',
          500: '#7363a8',
          600: '#5c4d8a',
          700: '#4a3e6f',
          800: '#3c335a',
          900: '#312b49',
        },
        // Accent - using Serif pink
        accent: {
          50: '#fef5f8',
          100: '#fce4ee',
          200: '#f8c8dc',        // Serif pink
          300: '#e99bbe',
          400: '#d66e9a',
          500: '#c04d7d',
          600: '#a03963',
          700: '#832e51',
          800: '#6b2743',
          900: '#582238',
        },
        // Muted blue from Serif
        muted: {
          50: '#f4f7f9',
          100: '#e4ebf0',
          200: '#c4d8e6',
          300: '#96b9d0',        // Serif blue
          400: '#6a95b3',
          500: '#4f7691',
          600: '#3f5e74',
          700: '#344c5e',
          800: '#2c3f4d',
          900: '#263541',
        },
        // Dark backgrounds (navy)
        navy: {
          700: '#2d3a4f',
          800: '#1e293b',
          900: '#0f172a',        // Hero background
          950: '#020617',
        },
        // Insight categories - using Serif palette
        insight: {
          sleep: '#b8aadd',      // Serif lavender
          metabolic: '#e99bbe',  // Serif pink dark
          cardio: '#f8c8dc',     // Serif pink
          recovery: '#89CCF0',   // Serif cyan
          mood: '#96b9d0',       // Serif blue
          nutrition: '#b8e4f7',  // Serif cyan light
          cognitive: '#9182c4',  // Serif lavender dark
          activity: '#5ba8d4',   // Serif cyan dark
          stress: '#d66e9a',     // Accent pink dark
        },
        // Status colors - softer Serif-aligned versions
        status: {
          optimal: '#89CCF0',    // Serif cyan
          attention: '#f8c8dc',  // Serif pink
          risk: '#e99bbe',       // Pink dark
          neutral: '#96b9d0',    // Serif blue
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      borderRadius: {
        'xl': '12px',
        '2xl': '16px',
        '3xl': '24px',
      },
      boxShadow: {
        'card': '0 4px 20px rgba(0, 0, 0, 0.08)',
        'card-hover': '0 8px 30px rgba(0, 0, 0, 0.12)',
        'glow-cyan': '0 0 20px rgba(137, 204, 240, 0.4)',
        'glow-lavender': '0 0 20px rgba(184, 170, 221, 0.4)',
        'glow-pink': '0 0 20px rgba(248, 200, 220, 0.4)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-soft': 'pulseSoft 2s infinite',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
    },
  },
  plugins: [],
}
