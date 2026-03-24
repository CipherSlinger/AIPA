/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/renderer/**/*.{html,js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ["'Cascadia Code'", "'Fira Code'", 'Consolas', 'monospace'],
      },
      colors: {
        bg: {
          primary: '#1e1e1e',
          secondary: '#252526',
          sidebar: '#2c2c2c',
          input: '#3c3c3c',
          hover: '#2a2d2e',
          active: '#37373d',
        },
        text: {
          primary: '#cccccc',
          muted: '#858585',
          bright: '#ffffff',
        },
        accent: {
          DEFAULT: '#007acc',
          hover: '#1f8ad2',
        },
        border: '#404040',
        success: '#4ec9b0',
        warning: '#d7ba7d',
        error: '#f44747',
      },
    },
  },
  plugins: [],
}
