import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // 环境变量在仓库根目录，前后端共用
  const env = loadEnv(mode, path.resolve(__dirname, '../..'), '');

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        // 直接指向源码，而不是 packages/shared/dist。
        //
        // shared 为了给 NestJS 用而编译成 CommonJS，其 index.js 用 __exportStar 转发导出，
        // Rollup 静态分析不出具名导出，任何**运行时**值（如 evaluatePassword）都会报
        // "is not exported by"。类型导入因为会被擦除，反而看不出问题。
        //
        // 让 Vite 直接编译 TS 源码，既绕开了这层 CJS 互操作，也让 shared 的改动能热更新。
        '@mes/shared': path.resolve(__dirname, '../../packages/shared/src'),
      },
    },
    server: {
      port: Number(env.WEB_PORT ?? 5173),
      // 项目在 /mnt/d（Windows 盘 drvfs）：WSL 的 inotify 收不到文件变更事件，
      // 不开 polling 时改完代码 vite 仍 serve 旧的模块缓存，HMR 与刷新都拿不到新代码
      watch: { usePolling: true, interval: 300 },
      // 开发期走同源代理，Cookie 无需跨域，与生产 nginx 反代行为一致
      proxy: {
        '/api': {
          target: `http://localhost:${env.API_PORT ?? 3000}`,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false, // 不向生产环境泄露源码结构
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            antd: ['antd', '@ant-design/icons'],
            charts: ['echarts', 'echarts-for-react'],
          },
        },
      },
    },
  };
});
