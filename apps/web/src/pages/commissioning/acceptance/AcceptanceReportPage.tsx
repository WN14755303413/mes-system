import { useEffect } from 'react';
import { Button, Result, Spin } from 'antd';
import { ArrowLeftOutlined, PrinterOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ACCEPTANCE_STATUS_LABEL,
  ACCEPTANCE_TYPE_LABEL,
  AcceptanceStatus,
  DEBUG_ISSUE_STATUS_LABEL,
  DEBUG_RECORD_STATUS_LABEL,
  DEBUG_STAGE_LABEL,
  DEBUG_TYPE_LABEL,
  INSPECTION_STATUS_LABEL,
  INSPECTION_TYPE_LABEL,
  ISSUE_SEVERITY_LABEL,
  type AcceptanceReport,
} from '@mes/shared';
import { useAcceptanceReport } from '@/api/debug';

const fmtDate = (iso: string | null) => (iso ? dayjs(iso).format('YYYY-MM-DD') : '—');
const fmtTime = (iso: string | null) => (iso ? dayjs(iso).format('YYYY-MM-DD HH:mm') : '—');

/**
 * FAT/SAT 验收报告打印视图（M9 验收标准「生成 FAT 报告 PDF」）。
 *
 * 独立于主框架的 A4 版式页面：屏幕上是带工具栏的预览，
 * 「导出 PDF」调用浏览器打印（中文排版由浏览器保证，服务端零重依赖）。
 * document.title 设为报告名——浏览器「另存为 PDF」的默认文件名即报告名。
 */
export default function AcceptanceReportPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: report, isLoading, error } = useAcceptanceReport(id);

  useEffect(() => {
    if (!report) return;
    const prev = document.title;
    document.title = `${report.acceptance.code}-${ACCEPTANCE_TYPE_LABEL[report.acceptance.type]}报告`;
    return () => {
      document.title = prev;
    };
  }, [report]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <Spin size="large" />
      </div>
    );
  }
  if (error || !report) {
    return (
      <Result
        status="404"
        title="报告不可用"
        subTitle="验收单不存在或无权查看"
        extra={<Button onClick={() => navigate('/commissioning/acceptance')}>返回验收列表</Button>}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-200 print:bg-white">
      {/* 打印版式：A4 纵向；工具栏与页面底色不进纸 */}
      <style>{`
        @page { size: A4 portrait; margin: 14mm 12mm; }
        @media print {
          .report-toolbar { display: none !important; }
          .report-paper { box-shadow: none !important; margin: 0 !important; width: auto !important; padding: 0 !important; }
          .report-section { break-inside: avoid; }
        }
      `}</style>

      <div className="report-toolbar sticky top-0 z-10 flex items-center justify-between border-b border-slate-300 bg-white/95 px-6 py-3 shadow-sm backdrop-blur">
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/commissioning/acceptance')}>
          返回
        </Button>
        <div className="text-sm text-slate-500">
          浏览器打印对话框中选择「另存为 PDF」即可生成报告文件
        </div>
        <Button type="primary" icon={<PrinterOutlined />} onClick={() => window.print()}>
          打印 / 导出 PDF
        </Button>
      </div>

      <div className="report-paper mx-auto my-6 w-[210mm] bg-white px-[12mm] py-[14mm] text-slate-900 shadow-lg">
        <ReportBody report={report} />
      </div>
    </div>
  );
}

function ReportBody({ report }: { report: AcceptanceReport }) {
  const { acceptance: acc, project } = report;
  const concluded = acc.status !== AcceptanceStatus.PENDING && acc.status !== AcceptanceStatus.VOIDED;

  return (
    <div className="text-[12px] leading-relaxed">
      {/* 报告抬头 */}
      <div className="border-b-2 border-slate-800 pb-3 text-center">
        <div className="text-xl font-bold tracking-widest">
          {ACCEPTANCE_TYPE_LABEL[acc.type]}报告
        </div>
        <div className="mt-1 text-[11px] text-slate-500">
          {acc.type === 'FAT' ? 'Factory Acceptance Test Report' : 'Site Acceptance Test Report'}
        </div>
      </div>
      <div className="mt-2 flex justify-between font-mono text-[11px] text-slate-600">
        <span>报告编号：{acc.code}</span>
        <span>生成时间：{fmtTime(report.generatedAt)}</span>
      </div>

      {/* 一、基本信息 */}
      <SectionTitle index="一" title="基本信息" />
      <table className="w-full border-collapse">
        <tbody>
          <InfoRow cells={[['项目编号', project.code], ['项目名称', project.name]]} />
          <InfoRow
            cells={[
              ['客户', project.customerName ?? '—'],
              ['合同 / 订单号', project.contractNo ?? '—'],
            ]}
          />
          <InfoRow
            cells={[
              ['设备编号', acc.equipmentNo ?? '—'],
              ['设备类型', project.projectType ?? '—'],
            ]}
          />
          <InfoRow
            cells={[
              ['项目经理', project.managerName ?? '—'],
              ['计划交期', fmtDate(project.planEndAt)],
            ]}
          />
          <InfoRow
            cells={[
              ['验收对象', acc.title],
              ['验收地点', acc.location ?? '—'],
            ]}
          />
          <InfoRow
            cells={[
              ['计划验收日期', fmtDate(acc.plannedAt)],
              ['客户代表', acc.customerRep ?? '—'],
            ]}
          />
        </tbody>
      </table>

      {/* 二、验收检查项 */}
      <SectionTitle index="二" title={`验收检查项（${acc.items.length} 项）`} />
      {acc.items.length ? (
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th className="w-8">#</Th>
              <Th>检查项</Th>
              <Th className="w-[30%]">验收标准</Th>
              <Th className="w-[22%]">实测 / 核查结果</Th>
              <Th className="w-14">判定</Th>
            </tr>
          </thead>
          <tbody>
            {acc.items.map((it) => (
              <tr key={it.id}>
                <Td className="text-center">{it.seq}</Td>
                <Td>{it.name}</Td>
                <Td>{it.standard ?? '—'}</Td>
                <Td>{it.actual ?? '—'}</Td>
                <Td className="text-center">
                  {it.passed === null || it.passed === undefined ? (
                    '—'
                  ) : it.passed ? (
                    '符合'
                  ) : (
                    <span className="font-bold text-red-600">不符合</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <Empty text="无检查项记录" />
      )}

      {/* 三、调试记录汇总 */}
      <SectionTitle index="三" title={`调试记录汇总（${report.debugRecords.length} 份）`} />
      {report.debugRecords.length ? (
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th className="w-[16%]">单号</Th>
              <Th className="w-16">类型</Th>
              <Th>调试对象</Th>
              <Th className="w-14">状态</Th>
              <Th className="w-16">调试人</Th>
              <Th className="w-[15%]">日期</Th>
              <Th className="w-[14%]">参数（未达标）</Th>
            </tr>
          </thead>
          <tbody>
            {report.debugRecords.map((r) => (
              <tr key={r.code}>
                <Td className="font-mono text-[10px]">{r.code}</Td>
                <Td>{DEBUG_TYPE_LABEL[r.type]}</Td>
                <Td>{r.title}</Td>
                <Td className="text-center">{DEBUG_RECORD_STATUS_LABEL[r.status]}</Td>
                <Td className="text-center">{r.executorName ?? '—'}</Td>
                <Td className="text-center">{fmtDate(r.debugAt)}</Td>
                <Td className="text-center">
                  {r.paramCount}
                  {r.failedParamCount > 0 && (
                    <span className="font-bold text-red-600">（{r.failedParamCount}）</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <Empty text="无调试记录" />
      )}

      {/* 四、调试问题闭环 */}
      <SectionTitle
        index="四"
        title={`调试问题闭环（共 ${report.debugIssues.length} 项，未关闭 ${report.openDebugIssueCount} 项）`}
      />
      {report.openDebugIssueCount > 0 && (
        <div className="report-section mb-1 border border-red-500 bg-red-50 px-2 py-1 text-[11px] font-medium text-red-700">
          注意：尚有 {report.openDebugIssueCount} 项调试问题未关闭，详见下表标红行。
        </div>
      )}
      {report.debugIssues.length ? (
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th className="w-[15%]">单号</Th>
              <Th>问题标题</Th>
              <Th className="w-16">阶段</Th>
              <Th className="w-14">严重度</Th>
              <Th className="w-14">状态</Th>
              <Th className="w-16">责任人</Th>
              <Th className="w-[15%]">关闭时间</Th>
            </tr>
          </thead>
          <tbody>
            {report.debugIssues.map((i) => {
              const open = i.status !== 'CLOSED';
              return (
                <tr key={i.code} className={open ? 'bg-red-50' : undefined}>
                  <Td className="font-mono text-[10px]">{i.code}</Td>
                  <Td>{i.title}</Td>
                  <Td className="text-center">{DEBUG_STAGE_LABEL[i.stage]}</Td>
                  <Td className="text-center">{ISSUE_SEVERITY_LABEL[i.severity]}</Td>
                  <Td className={`text-center ${open ? 'font-bold text-red-600' : ''}`}>
                    {DEBUG_ISSUE_STATUS_LABEL[i.status]}
                  </Td>
                  <Td className="text-center">{i.handlerName ?? '—'}</Td>
                  <Td className="text-center">{fmtDate(i.closedAt)}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <Empty text="无调试问题记录" />
      )}

      {/* 五、出厂 / 调试检验 */}
      <SectionTitle index="五" title={`出厂与调试检验（${report.inspections.length} 份）`} />
      {report.inspections.length ? (
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th className="w-[16%]">检验单号</Th>
              <Th className="w-20">类型</Th>
              <Th>检验对象</Th>
              <Th className="w-14">结果</Th>
              <Th className="w-[16%]">判定时间</Th>
            </tr>
          </thead>
          <tbody>
            {report.inspections.map((q) => (
              <tr key={q.code}>
                <Td className="font-mono text-[10px]">{q.code}</Td>
                <Td>{INSPECTION_TYPE_LABEL[q.type]}</Td>
                <Td>{q.title}</Td>
                <Td
                  className={`text-center ${q.status === 'REJECTED' ? 'font-bold text-red-600' : ''}`}
                >
                  {INSPECTION_STATUS_LABEL[q.status]}
                </Td>
                <Td className="text-center">{fmtDate(q.judgedAt)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <Empty text="无出厂/调试检验记录" />
      )}

      {/* 六、验收结论 */}
      <SectionTitle index="六" title="验收结论" />
      <div className="report-section border border-slate-800">
        <div className="border-b border-slate-800 px-3 py-2">
          <span className="mr-2 text-[11px] text-slate-500">结论：</span>
          <span className="text-sm font-bold">
            {concluded ? ACCEPTANCE_STATUS_LABEL[acc.status] : '待出具（本报告为过程预览）'}
          </span>
          {acc.concludedAt && (
            <span className="ml-3 text-[11px] text-slate-500">
              {acc.concludedByName} · {fmtTime(acc.concludedAt)}
            </span>
          )}
        </div>
        <div className="min-h-[48px] whitespace-pre-wrap px-3 py-2">
          {acc.conclusion || '（无补充说明）'}
        </div>
      </div>

      {/* 签字栏 */}
      <div className="report-section mt-6 grid grid-cols-3 gap-6">
        {[
          ['验收负责人', acc.concludedByName ?? ''],
          ['项目经理', project.managerName ?? ''],
          ['客户代表', acc.customerRep ?? ''],
        ].map(([label, name]) => (
          <div key={label}>
            <div className="text-[11px] text-slate-500">{label}</div>
            <div className="mt-8 border-b border-slate-400 pb-1 text-center">{name}</div>
            <div className="mt-1 text-center text-[10px] text-slate-400">签字 / 日期</div>
          </div>
        ))}
      </div>

      <div className="mt-6 border-t border-slate-300 pt-2 text-center text-[10px] text-slate-400">
        本报告由项目管理型 MES 系统生成 · {acc.code} · 打印时间以页眉为准
      </div>
    </div>
  );
}

function SectionTitle({ index, title }: { index: string; title: string }) {
  return (
    <div className="report-section mb-1.5 mt-4 border-l-4 border-slate-800 pl-2 text-[13px] font-bold">
      {index}、{title}
    </div>
  );
}

function Th({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={`border border-slate-400 bg-slate-100 px-1.5 py-1 text-left text-[11px] font-semibold ${className}`}
    >
      {children}
    </th>
  );
}

function Td({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <td className={`border border-slate-400 px-1.5 py-1 align-top ${className}`}>{children}</td>;
}

function Empty({ text }: { text: string }) {
  return (
    <div className="border border-dashed border-slate-300 px-3 py-2 text-center text-[11px] text-slate-400">
      {text}
    </div>
  );
}

function InfoRow({ cells }: { cells: [string, string][] }) {
  return (
    <tr>
      {cells.map(([label, value]) => (
        <InfoCell key={label} label={label} value={value} />
      ))}
    </tr>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <>
      <td className="w-[18%] border border-slate-400 bg-slate-100 px-1.5 py-1 text-[11px] font-semibold">
        {label}
      </td>
      <td className="w-[32%] border border-slate-400 px-1.5 py-1">{value}</td>
    </>
  );
}
