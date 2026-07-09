import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

const DENSITY = 1 / 14_000; // 每平方像素的粒子数，约等于 1920×1080 下 ~148 个
const MAX_PARTICLES = 110;
const LINK_DISTANCE = 130;
const PARALLAX = 14; // 鼠标视差的最大位移（px）

/**
 * 品牌墙上的稀疏粒子与连线，随鼠标轻微视差位移。
 *
 * 用 canvas 而非 DOM 节点：上百个元素的位置每帧都在变，交给 GPU 合成层去做
 * 会在低端集显的工位机上明显掉帧。
 *
 * 尊重 prefers-reduced-motion —— 该设置下直接不渲染，而不是画一帧静态图：
 * 这层纯装饰，缺席比留一片静止的噪点更干净。
 */
export function ParticleField({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 用 const + 箭头函数闭包捕获，而非 function 声明：后者会让 TS 丢掉上面的空值收窄
    const surface = canvas;
    const g = ctx;

    let particles: Particle[] = [];
    let frame = 0;
    // 目标视差与当前视差分开存：每帧向目标缓动，鼠标猛甩时画面不会跟着抽搐
    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = (): void => {
      const host = surface.parentElement ?? surface;
      const w = host.clientWidth;
      const h = host.clientHeight;

      surface.width = w * dpr;
      surface.height = h * dpr;
      surface.style.width = `${w}px`;
      surface.style.height = `${h}px`;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.min(MAX_PARTICLES, Math.round(w * h * DENSITY));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        r: Math.random() * 1.6 + 0.7,
      }));
    };

    const onPointerMove = (e: PointerEvent): void => {
      const rect = surface.getBoundingClientRect();
      // 归一化到 [-1, 1]
      target.x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      target.y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    };

    const draw = (): void => {
      const w = surface.clientWidth;
      const h = surface.clientHeight;
      g.clearRect(0, 0, w, h);

      current.x += (target.x - current.x) * 0.05;
      current.y += (target.y - current.y) * 0.05;
      const ox = current.x * PARALLAX;
      const oy = current.y * PARALLAX;

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        // 环绕而非反弹：反弹会让粒子在边缘聚堆
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;
      }

      // 连线。O(n²) 在 n≤110 时是每帧约 6000 次比较，可以接受；
      // 若要提高密度，得先上空间网格分桶。
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distSq = dx * dx + dy * dy;
          if (distSq > LINK_DISTANCE * LINK_DISTANCE) continue;

          const alpha = (1 - Math.sqrt(distSq) / LINK_DISTANCE) * 0.22;
          g.strokeStyle = `rgba(31, 84, 151, ${alpha})`;
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(a.x + ox, a.y + oy);
          g.lineTo(b.x + ox, b.y + oy);
          g.stroke();
        }
      }

      g.fillStyle = 'rgba(31, 84, 151, 0.25)';
      for (const p of particles) {
        g.beginPath();
        g.arc(p.x + ox, p.y + oy, p.r, 0, Math.PI * 2);
        g.fill();
      }

      frame = requestAnimationFrame(draw);
    };

    resize();
    frame = requestAnimationFrame(draw);

    const observer = new ResizeObserver(resize);
    if (surface.parentElement) observer.observe(surface.parentElement);
    window.addEventListener('pointermove', onPointerMove);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden />;
}
