/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // 关闭 preflight：Ant Design 自带 reset，两者同时生效会互相破坏
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        // 取自登录背景图的工业蓝色系
        industrial: {
          50: '#eef4fb',
          100: '#d7e5f5',
          200: '#aecbea',
          300: '#7fabdb',
          400: '#4f89ca',
          500: '#2f6cb5',
          600: '#1f5497',
          700: '#17417a',
          800: '#122f5c',
          900: '#0c1f3f',
          950: '#061224',
        },
      },
      keyframes: {
        'ken-burns': {
          '0%': { transform: 'scale(1) translate(0, 0)' },
          '100%': { transform: 'scale(1.06) translate(-1%, -1%)' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(200%)' },
        },
        // 右侧留白处缓慢漂移的极光色斑，给大面积浅色背景一点呼吸感
        drift: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(3%, -4%) scale(1.08)' },
          '66%': { transform: 'translate(-3%, 3%) scale(0.95)' },
        },
        // 品牌墙上自左向右扫过的一道极淡光带
        sweep: {
          '0%': { transform: 'translateX(-30%) skewX(-12deg)', opacity: '0' },
          '15%, 40%': { opacity: '0.22' },
          '100%': { transform: 'translateX(130%) skewX(-12deg)', opacity: '0' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.35', transform: 'scale(0.8)' },
        },
      },
      animation: {
        'ken-burns': 'ken-burns 20s ease-in-out infinite alternate',
        shimmer: 'shimmer 2.5s ease-in-out infinite',
        drift: 'drift 18s ease-in-out infinite',
        'drift-slow': 'drift 26s ease-in-out infinite reverse',
        sweep: 'sweep 7s ease-in-out infinite',
        'pulse-dot': 'pulse-dot 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
