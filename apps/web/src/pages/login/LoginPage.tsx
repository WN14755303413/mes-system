import { SafetyCertificateOutlined } from '@ant-design/icons';
import { App, Divider } from 'antd';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/stores/auth';
import { BrandPanel } from './BrandPanel';
import { ChangePasswordModal } from './ChangePasswordModal';
import { ForgotPasswordModal } from './ForgotPasswordModal';
import { LoginForm } from './LoginForm';

const APP_VERSION = 'v1.0';

export default function LoginPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const clear = useAuthStore((s) => s.clear);

  // 会话有效但后端要求改密时（比如用户在改密对话框上刷新了页面），
  // useSessionBootstrap 会把这个标志置位，这里据此重新弹出对话框。
  const mustChangePassword = useAuthStore((s) => s.mustChangePassword);

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotUsername, setForgotUsername] = useState('');
  const [changePasswordRequested, setChangePasswordRequested] = useState(false);

  const changePasswordOpen = changePasswordRequested || mustChangePassword;

  const closeChangePassword = () => {
    setChangePasswordRequested(false);
    useAuthStore.getState().setMustChangePassword(false);
  };

  /** 强制改密对话框里点「退出登录」：会话必须真的作废，不能只关掉弹窗。 */
  const abandonSession = async () => {
    try {
      await authApi.logout();
    } finally {
      clear();
      closeChangePassword();
    }
  };

  const handlePasswordChanged = () => {
    // 后端在改密时吊销了全部会话（含当前这条），必须重新登录
    clear();
    closeChangePassword();
  };

  return (
    <div className="flex min-h-screen w-full bg-slate-50">
      <BrandPanel />

      {/* 右侧登录区 */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-6 py-10">
        {/* 大面积浅色背景容易发闷，用两团缓慢漂移的色斑撑开层次 */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 animate-drift rounded-full bg-industrial-200/40 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-16 h-[26rem] w-[26rem] animate-drift-slow rounded-full bg-sky-200/35 blur-3xl"
        />
        {/* 极淡的网格，暗示工业制图 */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              'linear-gradient(#1f549712 1px, transparent 1px), linear-gradient(90deg, #1f549712 1px, transparent 1px)',
            backgroundSize: '32px 32px',
            maskImage: 'radial-gradient(ellipse at center, black 40%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse at center, black 40%, transparent 75%)',
          }}
        />

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          className="relative z-10 w-full max-w-[420px]"
        >
          {/* 窄屏下品牌墙被隐藏，这里补一个精简的品牌标识 */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-industrial-500 to-industrial-700 shadow-lg shadow-industrial-500/25">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
                <path d="M12 2.5 20.2 7v10L12 21.5 3.8 17V7L12 2.5Z" stroke="white" strokeWidth="1.4" strokeLinejoin="round" />
                <circle cx="12" cy="12" r="3.2" stroke="white" strokeWidth="1.4" />
              </svg>
            </span>
            <div>
              <div className="font-semibold text-industrial-800">MES 项目管理系统</div>
              <div className="text-xs text-slate-500">半导体湿法装备制造执行平台</div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/70 bg-white/75 p-8 shadow-[0_20px_60px_-20px_rgba(31,84,151,0.28)] backdrop-blur-xl sm:p-9">
            <div className="mb-7">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-800">欢迎登录</h2>
              <p className="mt-1.5 text-sm text-slate-500">请使用企业统一分配的账号</p>
            </div>

            <LoginForm
              onNeedPasswordChange={() => setChangePasswordRequested(true)}
              onSuccess={() => {
                message.success('登录成功');
                navigate('/', { replace: true });
              }}
              onForgotPassword={(username) => {
                setForgotUsername(username);
                setForgotOpen(true);
              }}
            />

            <Divider className="!my-6 !text-xs !text-slate-400">安全提示</Divider>

            <div className="flex items-start gap-2 text-xs leading-relaxed text-slate-500">
              <SafetyCertificateOutlined className="mt-0.5 shrink-0 text-industrial-500" />
              <span>
                本系统仅限授权人员使用。图纸、BOM 与客户资料属核心资产，
                所有登录、下载与变更操作均留有审计记录。
              </span>
            </div>
          </div>

          <div className="mt-6 text-center text-xs text-slate-400">
            <div>MES 项目管理系统 {APP_VERSION} · 内部系统，请勿外传</div>
            <div className="mt-1">建议使用 Chrome / Edge 最新版本以获得最佳体验</div>
          </div>
        </motion.div>
      </div>

      <ForgotPasswordModal
        open={forgotOpen}
        onClose={() => setForgotOpen(false)}
        defaultUsername={forgotUsername}
      />

      <ChangePasswordModal
        open={changePasswordOpen}
        onSuccess={handlePasswordChanged}
        onCancel={() => void abandonSession()}
      />
    </div>
  );
}
