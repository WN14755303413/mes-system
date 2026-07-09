import { useQuery } from '@tanstack/react-query';
import { Alert, Card, Descriptions, Spin, Tag } from 'antd';
import { http } from '@/api/client';

interface Health {
  status: string;
  database: string;
  uptime: number;
}

/**
 * M0 占位页：验证前端 dev server、Vite 代理、后端、数据库这条链路是否全线打通。
 * M2 会被真正的主框架布局替换掉。
 */
export default function App() {
  const { data, isLoading, error } = useQuery<Health>({
    queryKey: ['health'],
    queryFn: () => http.get('/health'),
    refetchInterval: 10_000,
  });

  return (
    <div className="flex min-h-full items-center justify-center bg-industrial-50 p-8">
      <Card title="MES 系统 · 链路自检" className="w-[520px] shadow-lg">
        {isLoading && <Spin />}

        {error && (
          <Alert
            type="error"
            showIcon
            message="无法连接后端"
            description="请确认 API 已启动，且根目录 .env 中已配置 DATABASE_URL。"
          />
        )}

        {data && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="服务状态">
              <Tag color={data.status === 'ok' ? 'green' : 'orange'}>{data.status}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="数据库">
              <Tag color={data.database === 'up' ? 'green' : 'red'}>{data.database}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="运行时长">{data.uptime} 秒</Descriptions.Item>
          </Descriptions>
        )}
      </Card>
    </div>
  );
}
