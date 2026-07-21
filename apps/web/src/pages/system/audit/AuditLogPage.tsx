import { useMemo, useState } from 'react';
import { Button, DatePicker, Descriptions, Drawer, Input, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined } from '@ant-design/icons';
import type { AuditLogItem } from '@mes/shared';
import { useAuditLogs } from '@/api/system';
import { PageContainer } from '../PageContainer';

const { RangePicker } = DatePicker;

/**
 * 动作码 → 中文，让审计列表可读。未知动作原样显示。
 * 动作码来源：auth 模块手写的 auth.* 与各 controller 上的 @Audit() 标注。
 */
const ACTION_LABEL: Record<string, string> = {
  // 认证
  'auth.login': '登录',
  'auth.logout': '登出',
  'auth.change_password': '修改密码',
  'auth.password_reset_request': '申请重置密码',
  // 用户
  'user.create': '新建用户',
  'user.update': '编辑用户',
  'user.set-status': '启用/停用用户',
  'user.reset-password': '重置密码',
  'user.assign-roles': '分配角色',
  'user.delete': '删除用户',
  // 角色与部门
  'role.create': '新建角色',
  'role.update': '编辑角色',
  'role.set-permissions': '设置角色权限',
  'role.delete': '删除角色',
  'dept.create': '新建部门',
  'dept.update': '编辑部门',
  'dept.delete': '删除部门',
  // 项目
  'project.create': '新建项目',
  'project.update': '编辑项目',
  'project.change-status': '变更项目状态',
  'project.delete': '删除项目',
  'project.member.add': '添加项目成员',
  'project.member.remove': '移除项目成员',
  'project.milestone.create': '新建里程碑',
  'project.milestone.update': '编辑里程碑',
  'project.milestone.delete': '删除里程碑',
  'project.task.create': '新建项目任务',
  'project.task.update': '编辑项目任务',
  'project.task.delete': '删除项目任务',
  'project.risk.create': '登记项目风险',
  'project.risk.update': '编辑项目风险',
  'project.risk.delete': '删除项目风险',
  'project.issue.create': '登记项目问题',
  'project.issue.update': '编辑项目问题',
  'project.issue.delete': '删除项目问题',
  // BOM 与图纸
  'bom.create': '新建 BOM',
  'bom.update': '编辑 BOM',
  'bom.change-status': '变更 BOM 状态',
  'bom.delete': '删除 BOM',
  'bom.item.create': '新增 BOM 行项',
  'bom.item.batch-create': '批量导入 BOM 行项',
  'bom.item.update': '编辑 BOM 行项',
  'bom.item.delete': '删除 BOM 行项',
  'drawing.upload': '上传图纸',
  'drawing.download': '下载图纸',
  'drawing.void': '作废图纸',
  // 物料与供应
  'material.create': '新建物料',
  'material.update': '编辑物料',
  'material.import': '导入物料',
  'supply.po.import': '导入采购单',
  'supply.po-item.update': '编辑采购单行项',
  'supply.arrival.import': '导入到货记录',
  'supply.stock.import': '导入库存',
  'requisition.create': '新建领料单',
  'requisition.confirm': '确认领料',
  'requisition.cancel': '取消领料单',
  // 生产执行
  'workorder.create': '新建工单',
  'workorder.update': '编辑工单',
  'workorder.status': '变更工单状态',
  'worktask.create': '新建装配任务',
  'worktask.update': '编辑装配任务',
  'worktask.assign': '指派装配任务',
  'worktask.delete': '删除装配任务',
  'workreport.create': '提交报工',
  'exception.create': '上报异常',
  'exception.assign': '指派异常处理人',
  'exception.resolve': '异常处理完成',
  'exception.close': '关闭异常单',
  'exception.reopen': '重开异常单',
  'exception.photo.upload': '上传异常照片',
  // 质量
  'inspection.create': '新建检验单',
  'inspection.update': '编辑检验单',
  'inspection.judge': '检验判定',
  'inspection.void': '作废检验单',
  'inspection.photo.upload': '上传检验照片',
  'quality-issue.create': '登记质量问题',
  'quality-issue.update': '编辑质量问题',
  'quality-issue.assign': '指派质量问题',
  'quality-issue.submit': '提交质量问题处理',
  'quality-issue.recheck': '质量问题复核',
  'quality-issue.void': '作废质量问题',
  'quality-issue.photo.upload': '上传质量问题照片',
  // 调试与验收
  'debug-record.create': '新建调试记录',
  'debug-record.update': '编辑调试记录',
  'debug-record.complete': '完成调试',
  'debug-record.void': '作废调试记录',
  'debug-record.photo.upload': '上传调试照片',
  'debug-issue.create': '登记调试问题',
  'debug-issue.update': '编辑调试问题',
  'debug-issue.assign': '指派调试问题',
  'debug-issue.submit': '提交调试问题处理',
  'debug-issue.recheck': '调试问题复核',
  'debug-issue.void': '作废调试问题',
  'debug-issue.photo.upload': '上传调试问题照片',
  'acceptance.create': '新建验收单',
  'acceptance.update': '编辑验收单',
  'acceptance.conclude': '出具验收结论',
  'acceptance.report': '生成验收报告',
  'acceptance.void': '作废验收单',
  // 系统集成与反馈
  'integration.sync': '触发集成同步',
  'integration.retry': '重试集成接口',
  'integration.resolve': '标记接口异常已处理',
  'feedback.create': '提交反馈',
  'feedback.reply': '回复反馈',
  'feedback.transition': '反馈状态流转',
  'feedback.attachment.upload': '上传反馈附件',
};

/** 对象类型 → 中文。未知类型原样显示。 */
const TARGET_LABEL: Record<string, string> = {
  user: '用户',
  role: '角色',
  dept: '部门',
  project: '项目',
  project_member: '项目成员',
  project_milestone: '里程碑',
  project_task: '项目任务',
  project_risk: '项目风险',
  project_issue: '项目问题',
  bom: 'BOM',
  bom_item: 'BOM 行项',
  drawing: '图纸',
  material: '物料',
  purchase_order: '采购单',
  purchase_order_item: '采购单行项',
  arrival: '到货记录',
  stock: '库存',
  requisition: '领料单',
  workOrder: '工单',
  assemblyTask: '装配任务',
  exception: '异常单',
  inspection: '检验单',
  'quality-issue': '质量问题',
  'debug-record': '调试记录',
  'debug-issue': '调试问题',
  acceptance: '验收单',
  integration: '集成接口',
  integrationLog: '接口日志',
  feedback: '反馈',
};

const actionLabel = (code: string): string => ACTION_LABEL[code] ?? code;
const targetLabel = (type: string): string => TARGET_LABEL[type] ?? type;

function ResultTag({ row }: { row: AuditLogItem }) {
  return row.success ? (
    <Tag color="green" className="!m-0">
      成功
    </Tag>
  ) : (
    <Tag color="red" className="!m-0">
      失败
    </Tag>
  );
}

/** 变更内容既可能是对象（diff），也可能是字符串，统一转成可读文本。 */
function formatChanges(changes: unknown): string | null {
  if (changes == null) return null;
  if (typeof changes === 'string') return changes;
  try {
    return JSON.stringify(changes, null, 2);
  } catch {
    return String(changes);
  }
}

/** 单条审计记录的完整信息。列表里被截断/省略的字段（完整对象 ID、UA、失败原因、变更 diff）都在这里。 */
function AuditDetailDrawer({
  log,
  open,
  onClose,
}: {
  log: AuditLogItem | null;
  open: boolean;
  onClose: () => void;
}) {
  const changesText = formatChanges(log?.changes);

  return (
    <Drawer
      title="审计详情"
      width={620}
      open={open}
      onClose={onClose}
      maskClosable={false}
      keyboard={false}
    >
      {log && (
        <>
          <Descriptions
            column={1}
            bordered
            size="small"
            styles={{ label: { width: 110 } }}
            items={[
              {
                key: 'time',
                label: '时间',
                children: new Date(log.createdAt).toLocaleString('zh-CN'),
              },
              {
                key: 'operator',
                label: '操作人',
                children: log.username ? (
                  <span>
                    {log.username}
                    {log.userId && (
                      <Typography.Text
                        className="!ml-2 !text-xs !text-slate-400"
                        copyable={{ text: log.userId, tooltips: ['复制用户 ID', '已复制'] }}
                      >
                        {log.userId}
                      </Typography.Text>
                    )}
                  </span>
                ) : (
                  <span className="text-slate-400">系统/匿名</span>
                ),
              },
              {
                key: 'action',
                label: '动作',
                children: (
                  <span>
                    {actionLabel(log.action)}
                    <span className="ml-2 font-mono text-xs text-slate-400">{log.action}</span>
                  </span>
                ),
              },
              {
                key: 'target',
                label: '对象',
                children: log.targetType ? (
                  <span>
                    {targetLabel(log.targetType)}
                    {log.targetId && (
                      <Typography.Text
                        className="!ml-2 !font-mono !text-xs"
                        copyable={{ text: log.targetId, tooltips: ['复制对象 ID', '已复制'] }}
                      >
                        {log.targetId}
                      </Typography.Text>
                    )}
                  </span>
                ) : (
                  '—'
                ),
              },
              { key: 'result', label: '结果', children: <ResultTag row={log} /> },
              ...(log.errorMsg
                ? [
                    {
                      key: 'error',
                      label: '失败原因',
                      children: <span className="text-red-500">{log.errorMsg}</span>,
                    },
                  ]
                : []),
              { key: 'ip', label: 'IP', children: log.ip ?? '—' },
              {
                key: 'ua',
                label: 'User-Agent',
                children: log.userAgent ? (
                  <span className="break-all text-xs text-slate-500">{log.userAgent}</span>
                ) : (
                  '—'
                ),
              },
              {
                key: 'id',
                label: '日志 ID',
                children: (
                  <Typography.Text
                    className="!font-mono !text-xs"
                    copyable={{ tooltips: ['复制', '已复制'] }}
                  >
                    {log.id}
                  </Typography.Text>
                ),
              },
            ]}
          />

          {changesText && (
            <div className="mt-4">
              <div className="mb-1.5 text-sm font-medium text-slate-600">变更内容</div>
              <pre className="max-h-80 overflow-auto rounded-lg bg-slate-50 p-3 font-mono text-xs leading-5 text-slate-600">
                {changesText}
              </pre>
            </div>
          )}
        </>
      )}
    </Drawer>
  );
}

export default function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [range, setRange] = useState<[string, string] | undefined>();
  // detail 在关闭后保留，抽屉的收起动画期间内容不消失
  const [detail, setDetail] = useState<AuditLogItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const query = useMemo(
    () => ({
      page,
      pageSize,
      keyword: keyword || undefined,
      from: range?.[0],
      to: range?.[1],
    }),
    [page, pageSize, keyword, range],
  );
  const { data, isFetching } = useAuditLogs(query);

  const showDetail = (row: AuditLogItem) => {
    setDetail(row);
    setDetailOpen(true);
  };

  const columns: ColumnsType<AuditLogItem> = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 170,
      render: (v: string) => new Date(v).toLocaleString('zh-CN'),
    },
    {
      title: '操作人',
      dataIndex: 'username',
      width: 140,
      render: (v: string | null) => v ?? <span className="text-slate-400">系统/匿名</span>,
    },
    {
      title: '动作',
      dataIndex: 'action',
      width: 150,
      render: (v: string) => actionLabel(v),
    },
    {
      title: '对象',
      key: 'target',
      width: 200,
      render: (_, row) =>
        row.targetType ? (
          <span className="text-slate-600">
            {targetLabel(row.targetType)}
            {row.targetId && <span className="ml-1 font-mono text-xs text-slate-400">#{row.targetId.slice(0, 8)}</span>}
          </span>
        ) : (
          '—'
        ),
    },
    {
      title: '结果',
      dataIndex: 'success',
      width: 90,
      render: (_, row) =>
        row.success ? (
          <ResultTag row={row} />
        ) : (
          <Tooltip title={row.errorMsg ?? ''}>
            <ResultTag row={row} />
          </Tooltip>
        ),
    },
    { title: 'IP', dataIndex: 'ip', width: 130, render: (v) => v ?? '—' },
    {
      title: '操作',
      key: 'ops',
      width: 70,
      render: (_, row) => (
        <Button
          type="link"
          size="small"
          className="!px-0"
          onClick={(e) => {
            e.stopPropagation();
            showDetail(row);
          }}
        >
          详情
        </Button>
      ),
    },
  ];

  return (
    <PageContainer
      title="审计日志"
      subtitle="记录关键写操作的操作人、动作、对象与结果。成功与失败都留痕，用于安全追溯。点击任意一行查看详情。"
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input.Search
          allowClear
          placeholder="搜索操作人 / 动作 / 对象 ID"
          className="!w-72"
          onSearch={(v) => {
            setKeyword(v);
            setPage(1);
          }}
        />
        <RangePicker
          showTime
          onChange={(_, strings) => {
            setRange(strings[0] && strings[1] ? [strings[0], strings[1]] : undefined);
            setPage(1);
          }}
        />
        <Button
          icon={<ReloadOutlined />}
          onClick={() => {
            setKeyword('');
            setRange(undefined);
            setPage(1);
          }}
        >
          重置
        </Button>
      </div>

      <Table<AuditLogItem>
        rowKey="id"
        size="middle"
        loading={isFetching}
        columns={columns}
        dataSource={data?.items ?? []}
        scroll={{ x: 960 }}
        rowClassName="cursor-pointer"
        onRow={(row) => ({ onClick: () => showDetail(row) })}
        pagination={{
          current: page,
          pageSize,
          total: data?.total ?? 0,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
      />

      <AuditDetailDrawer log={detail} open={detailOpen} onClose={() => setDetailOpen(false)} />
    </PageContainer>
  );
}
