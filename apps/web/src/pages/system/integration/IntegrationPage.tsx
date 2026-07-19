import { Badge, Tabs } from 'antd';
import { useAuthStore } from '@/stores/auth';
import { useIntegrationStatus } from '@/api/integration';
import { PageContainer } from '../PageContainer';
import { AdapterPanel } from './AdapterPanel';
import { LogPanel } from './LogPanel';

/**
 * M11 系统集成：ERP / 钉钉适配器状态、手动同步、接口日志与异常池。
 *
 * 一期为「集成预留」——契约固化 + mock 实现；验收标准是
 * 「接口失败进异常池并可重试」，与真实外部系统是否接入无关。
 */
export default function IntegrationPage() {
  const canWrite = useAuthStore((s) => s.hasPermission('sys:integration:write'));
  const { data: status, isLoading } = useIntegrationStatus();

  return (
    <PageContainer
      title="系统集成"
      subtitle="ERP / 钉钉等外部系统的适配器状态、数据同步与接口异常池。一期为 mock 预留实现，二期替换为真实对接。"
    >
      <Tabs
        defaultActiveKey="adapters"
        items={[
          {
            key: 'adapters',
            label: '适配器与同步',
            children: (
              <AdapterPanel
                adapters={status?.adapters ?? []}
                loading={isLoading}
                canWrite={canWrite}
              />
            ),
          },
          {
            key: 'logs',
            label: (
              <span>
                接口日志与异常池
                <Badge
                  count={status?.pendingExceptions ?? 0}
                  size="small"
                  offset={[6, -2]}
                  title="异常池待处理数"
                />
              </span>
            ),
            children: <LogPanel canWrite={canWrite} />,
          },
        ]}
      />
    </PageContainer>
  );
}
