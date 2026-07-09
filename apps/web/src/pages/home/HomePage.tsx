import { LogoutOutlined } from '@ant-design/icons';
import { App, Button, Card, Descriptions, Space, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import { authApi, useHealth } from '@/api/auth';
import { useAuthStore } from '@/stores/auth';

/**
 * M1 的落地页占位：证明登录链路通了。
 * M2 会用带侧边导航、面包屑和页签的主框架布局替换掉它。
 */
export default function HomePage() {
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { data } = useHealth();

  const logout = async () => {
    try {
      await authApi.logout();
    } finally {
      clear();
      message.success('已退出登录');
      navigate('/login', { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">
              欢迎，{user?.displayName ?? '—'}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {user?.deptName ?? '未分配部门'} · {user?.roles.join('、') || '无角色'}
            </p>
          </div>
          <Button icon={<LogoutOutlined />} onClick={() => void logout()}>
            退出登录
          </Button>
        </div>

        <Card title="账号信息" size="small">
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="账号">{user?.username}</Descriptions.Item>
            <Descriptions.Item label="数据范围">
              <Tag color="blue">{user?.dataScope}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="权限点">
              <Space size={[4, 4]} wrap>
                {user?.permissions.length ? (
                  user.permissions.map((p) => (
                    <Tag key={p} className="!mr-0">
                      {p}
                    </Tag>
                  ))
                ) : (
                  <span className="text-slate-400">无</span>
                )}
              </Space>
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Card title="链路自检" size="small">
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="服务状态">
              <Tag color={data?.status === 'ok' ? 'green' : 'orange'}>{data?.status ?? '—'}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="数据库">
              <Tag color={data?.database === 'up' ? 'green' : 'red'}>{data?.database ?? '—'}</Tag>
            </Descriptions.Item>
          </Descriptions>
        </Card>
      </div>
    </div>
  );
}
