/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Helvetica Neue', 'Arial', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"SF Mono"', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      colors: {
        swiss: {
          red: '#E30613',       // International Typographic signal red
          redHover: '#C20510',
          redLight: '#FDF2F2',
          redMuted: '#991B1B',
          black: '#111111',     // Stark Swiss near-black
          dark: '#0C0D0E',      // Dark background
          darkSurface: '#151619',
          darkBorder: '#27282D',
          white: '#FFFFFF',
          offwhite: '#F8F9FA',
          grayLight: '#F2F2F2',
          gray: '#989898',
          grayDark: '#4A4A4A',
          border: '#E5E5E5',
          borderDark: '#262626',
        },
        brand: {
          blue: '#1a73e8',
          blueHover: '#1557b0',
        }
      },
      borderRadius: {
        'none': '0px',
        'sm': '2px',
        'DEFAULT': '3px',
        'md': '4px',
        'lg': '6px',
      },
      boxShadow: {
        'subtle': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'swiss': '0 1px 3px 0 rgba(0, 0, 0, 0.06)',
        'swiss-hover': '0 4px 12px 0 rgba(0, 0, 0, 0.08)',
      }
    },
  },
  plugins: [],
}
