import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntdApp, ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from './router';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#1f5497',
          borderRadius: 8,
          fontSize: 14,
          colorBgLayout: 'transparent',
        },
        components: {
          // 登录卡片是半透明玻璃，输入框须为纯白才有足够对比度
          Input: { colorBgContainer: '#ffffff' },
          Menu: {
            itemBorderRadius: 10,
            itemMarginInline: 10,
            itemHeight: 42,
            itemSelectedBg: '#1f5497',
            itemSelectedColor: '#ffffff',
            itemColor: '#475569',
            itemHoverBg: '#eef4fb',
            itemHoverColor: '#1f5497',
            subMenuItemBg: 'transparent',
            iconSize: 16,
            fontSize: 14,
          },
          Breadcrumb: { fontSize: 13 },
          Card: { borderRadiusLG: 16 },
        },
      }}
    >
      <AntdApp>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </QueryClientProvider>
      </AntdApp>
    </ConfigProvider>
  </React.StrictMode>,
);
