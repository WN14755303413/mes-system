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
      },
    },
    server: {
      port: Number(env.WEB_PORT ?? 5173),
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
