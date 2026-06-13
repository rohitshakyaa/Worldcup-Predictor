/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js}'],
  darkMode: 'media', // follow prefers-color-scheme
  theme: {
    extend: {
      colors: {
        // Palette driven by CSS custom properties (see src/style.css).
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
        card: 'rgb(var(--card) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        brand: 'rgb(var(--brand) / <alpha-value>)',
        'brand-ink': 'rgb(var(--brand-ink) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        gold: 'rgb(var(--gold) / <alpha-value>)',
        silver: 'rgb(var(--silver) / <alpha-value>)',
        bronze: 'rgb(var(--bronze) / <alpha-value>)'
      },
      fontFamily: {
        sans: ['Barlow', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Barlow Condensed"', 'Barlow', 'system-ui', 'sans-serif']
      },
      maxWidth: { app: '760px' }
    }
  },
  plugins: []
}
