export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        kanit: ['"Kanit"', 'sans-serif'],
        dm: ['"DM Sans"', 'sans-serif'],
      },
      colors: {
        bg:      '#0C0C0E',
        surface: '#141416',
        card:    '#161618',
        border:  '#222226',
        lime:    '#C8FF00',
        'lime-dim': '#A8D800',
        muted:   '#52525E',
        soft:    '#1E1E22',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.25rem',
        '4xl': '1.75rem',
      },
      boxShadow: {
        'lime-glow': '0 0 16px rgba(200,255,0,0.12)',
        'lime-sm':   '0 0 8px rgba(200,255,0,0.08)',
        'card':      '0 1px 12px rgba(0,0,0,0.35)',
      },
    },
  },
  plugins: [],
}
