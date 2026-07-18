/** 与登录页 BrandMark 同源的品牌标记，主框架侧边栏使用 */
export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-industrial-500 to-industrial-700 shadow-lg shadow-industrial-500/25"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" style={{ width: size * 0.55, height: size * 0.55 }} fill="none" aria-hidden>
        <path
          d="M12 2.5 20.2 7v10L12 21.5 3.8 17V7L12 2.5Z"
          stroke="white"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="3.2" stroke="white" strokeWidth="1.4" />
        <path
          d="M12 8.8V5.2M12 18.8v-3.6M15.2 12h3.4M5.4 12h3.4"
          stroke="white"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
