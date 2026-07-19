import { useState } from 'react';
import { Alert, App, Button, Switch, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { SyncOutlined } from '@ant-design/icons';
import type { IntegrationActionInfo, IntegrationAdapterStatus } from '@mes/shared';
import { isApiError } from '@/api/client';
import { useTriggerSync } from '@/api/integration';

/**
 * 适配器状态与手动同步面板（M11 集成预留）。
 *
 * mock 模式下手动同步只演示「调用 → 日志 → 异常池 → 重试」链路，不落业务数据；
 * 「模拟失败」开关用于现场验收补偿闭环。
 */
export function AdapterPanel({
  adapters,
  loading,
  canWrite,
}: {
  adapters: IntegrationAdapterStatus[];
  loading: boolean;
  canWrite: boolean;
}) {
  const { message } = App.useApp();
  const [simulateFail, setSimulateFail] = useState(false);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const triggerSync = useTriggerSync();

  const runSync = (row: IntegrationActionInfo) => {
    setRunningAction(row.action);
    triggerSync.mutate(
      { action: row.action, body: simulateFail ? { simulateFail: true } : {} },
      {
        onSuccess: (result) => {
          if (result.success) {
            message.success(`「${row.name}」同步完成`);
          } else {
            message.warning(`「${row.name}」失败，已进入异常池，可在日志页重试：${result.errorMsg ?? ''}`);
          }
        },
        onError: (err: unknown) => {
          message.error(isApiError(err) ? err.message : '触发同步失败');
        },
        onSettled: () => setRunningAction(null),
      },
    );
  };

  const columns: ColumnsType<IntegrationActionInfo> = [
    { title: '接口', dataIndex: 'name', width: 220 },
    {
      title: '方向',
      dataIndex: 'direction',
      width: 150,
      render: (v: string) => <span className="text-xs text-slate-500">{v}</span>,
    },
    {
      title: '触发方式',
      dataIndex: 'trigger',
      width: 110,
      render: (v: IntegrationActionInfo['trigger']) =>
        v === 'manual' ? (
          <Tag className="!m-0">定时 / 手动</Tag>
        ) : (
          <Tag color="geekblue" className="!m-0">
            业务事件
          </Tag>
        ),
    },
    {
      title: '最近执行',
      dataIndex: 'lastRun',
      width: 210,
      render: (v: IntegrationActionInfo['lastRun']) =>
        v ? (
          <span className="text-xs">
            {new Date(v.at).toLocaleString('zh-CN')}{' '}
            {v.success ? (
              <Tag color="green" className="!m-0">
                成功
              </Tag>
            ) : (
              <Tag color="red" className="!m-0">
                失败
              </Tag>
            )}
          </span>
        ) : (
          <span className="text-slate-400">从未执行</span>
        ),
    },
    {
      title: '操作',
      key: 'op',
      width: 110,
      render: (_, row) =>
        row.trigger === 'manual' ? (
          <Button
            size="small"
            icon={<SyncOutlined />}
            disabled={!canWrite}
            loading={runningAction === row.action}
            onClick={() => runSync(row)}
          >
            立即同步
          </Button>
        ) : (
          <Tooltip title="由派工、异常上报、质量分派等业务动作自动触发">
            <span className="text-xs text-slate-400">自动触发</span>
          </Tooltip>
        ),
    },
  ];

  return (
    <div className="space-y-5">
      <Alert
        type="info"
        showIcon
        message="一期集成预留（mock 模式）"
        description="适配器接口契约已固化，当前为模拟实现：手动同步不读写真实外部系统，业务通知打印在服务端日志。二期填入真实凭据并替换适配器实现后，本页与异常池无需改动。"
      />

      {canWrite && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3">
          <Switch checked={simulateFail} onChange={setSimulateFail} />
          <div className="text-sm text-amber-800">
            模拟失败演示：开启后手动同步将失败并进入异常池；在日志页对该记录「重试」即成功，
            用于验证「接口失败进异常池并可重试」的验收标准。
          </div>
        </div>
      )}

      {adapters.map((adapter) => (
        <div key={adapter.key} className="rounded-xl border border-slate-200 p-4">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold text-slate-800">{adapter.title}</span>
            <Tag color="orange" className="!m-0">
              Mock 预留
            </Tag>
            {adapter.configured ? (
              <Tag color="green" className="!m-0">
                凭据已配置
              </Tag>
            ) : (
              <Tag className="!m-0">凭据未配置</Tag>
            )}
          </div>
          <p className="mb-3 text-xs leading-5 text-slate-500">{adapter.note}</p>
          <Table<IntegrationActionInfo>
            rowKey="action"
            size="small"
            loading={loading}
            columns={columns}
            dataSource={adapter.actions}
            pagination={false}
          />
        </div>
      ))}
    </div>
  );
}
