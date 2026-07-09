import { ArrowRightOutlined, LockOutlined, UserOutlined, WarningFilled } from '@ant-design/icons';
import type { LoginFailureDetail } from '@mes/shared';
import { Alert, Form, Input } from 'antd';
import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { authApi, useLogin } from '@/api/auth';
import { isApiError } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import { CaptchaInput } from './CaptchaInput';

interface FormValues {
  username: string;
  password: string;
  captchaCode?: string;
}

interface Props {
  onNeedPasswordChange: () => void;
  onSuccess: () => void;
  onForgotPassword: (username: string) => void;
}

export function LoginForm({ onNeedPasswordChange, onSuccess, onForgotPassword }: Props) {
  const [form] = Form.useForm<FormValues>();
  const setUser = useAuthStore((s) => s.setUser);

  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [captchaId, setCaptchaId] = useState('');
  const [captchaRefresh, setCaptchaRefresh] = useState(0);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedSeconds, setLockedSeconds] = useState(0);

  const { mutateAsync, isPending } = useLogin();

  // 账号被锁定时的倒计时。归零后自动清掉错误提示，让用户可以直接重试。
  useEffect(() => {
    if (lockedSeconds <= 0) return;
    const timer = setInterval(() => {
      setLockedSeconds((s) => {
        if (s <= 1) {
          setError(null);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockedSeconds]);

  /**
   * 用户填完账号后先问一次是否需要验证码，这样验证码框在提交前就已出现，
   * 而不是等提交被拒后才冒出来——后者会白白浪费用户一次输入。
   */
  const probeCaptcha = useCallback(async (username: string) => {
    const name = username.trim();
    if (name.length < 3) return;
    try {
      const { required } = await authApi.captchaRequired(name);
      setCaptchaRequired(required);
    } catch {
      // 探测失败无所谓：真需要验证码时，提交会被拒并带回 captchaRequired
    }
  }, []);

  const detectCapsLock = (e: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsLock(e.getModifierState?.('CapsLock') ?? false);
  };

  const handleSubmit = async (values: FormValues) => {
    setError(null);
    try {
      const res = await mutateAsync({
        username: values.username.trim(),
        password: values.password,
        ...(captchaRequired ? { captchaId, captchaCode: values.captchaCode } : {}),
      });

      if (res.mustChangePassword) {
        onNeedPasswordChange();
        return;
      }

      setUser(res.user);
      onSuccess();
    } catch (err) {
      if (!isApiError(err)) {
        setError('登录失败，请稍后再试');
        return;
      }

      setError(err.message);

      const detail = err.data as LoginFailureDetail | null;
      if (detail?.captchaRequired) setCaptchaRequired(true);
      if (detail?.lockedForSeconds) setLockedSeconds(detail.lockedForSeconds);

      // 验证码一次性消费，无论校验通过与否后端都已把它作废
      if (captchaRequired) {
        setCaptchaRefresh((n) => n + 1);
        form.setFieldValue('captchaCode', '');
      }

      form.setFieldValue('password', '');
    }
  };

  const locked = lockedSeconds > 0;

  return (
    <Form form={form} layout="vertical" onFinish={handleSubmit} requiredMark={false} size="large">
      <Form.Item
        name="username"
        label={<span className="text-sm text-slate-600">账号</span>}
        rules={[{ required: true, message: '请输入账号' }]}
      >
        <Input
          prefix={<UserOutlined className="text-slate-400" />}
          placeholder="工号或企业账号"
          autoComplete="username"
          autoFocus
          onBlur={(e) => void probeCaptcha(e.target.value)}
        />
      </Form.Item>

      <Form.Item
        name="password"
        label={<span className="text-sm text-slate-600">密码</span>}
        rules={[{ required: true, message: '请输入密码' }]}
        className="mb-2"
      >
        <Input.Password
          prefix={<LockOutlined className="text-slate-400" />}
          placeholder="登录密码"
          autoComplete="current-password"
          onKeyDown={detectCapsLock}
          onKeyUp={detectCapsLock}
          onBlur={() => setCapsLock(false)}
        />
      </Form.Item>

      {/* 大写锁定是密码输错的常见原因，而密码框看不出来，值得单独提示 */}
      <AnimatePresence>
        {capsLock && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-2 flex items-center gap-1.5 overflow-hidden text-xs text-amber-600"
          >
            <WarningFilled />
            大写锁定已开启
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {captchaRequired && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <Form.Item
              name="captchaCode"
              label={<span className="text-sm text-slate-600">验证码</span>}
              rules={[{ required: captchaRequired, message: '请输入验证码' }]}
              className="mt-2"
            >
              <CaptchaInput
                enabled={captchaRequired}
                onIdChange={setCaptchaId}
                refreshKey={captchaRefresh}
              />
            </Form.Item>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mb-4 mt-1 flex justify-end">
        <button
          type="button"
          onClick={() => onForgotPassword(form.getFieldValue('username') ?? '')}
          className="cursor-pointer border-0 bg-transparent p-0 text-sm text-industrial-600 transition-colors hover:text-industrial-500"
        >
          忘记密码？
        </button>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="mb-4"
          >
            <Alert
              type={locked ? 'warning' : 'error'}
              showIcon
              message={locked ? `账号已锁定，${formatCountdown(lockedSeconds)} 后可重试` : error}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <SubmitButton loading={isPending} disabled={locked} />
    </Form>
  );
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m} 分 ${s} 秒` : `${s} 秒`;
}

/** 提交按钮。hover 时一道光泽自左扫过；提交中换成 spinner 并锁死交互。 */
function SubmitButton({ loading, disabled }: { loading: boolean; disabled: boolean }) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className="group relative h-11 w-full overflow-hidden rounded-lg border-0 bg-gradient-to-r from-industrial-600 to-industrial-500 font-medium text-white shadow-lg shadow-industrial-500/25 transition-all duration-200 hover:shadow-xl hover:shadow-industrial-500/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-industrial-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none disabled:active:scale-100"
    >
      {/* 光泽带。disabled 时不出现，免得给出「可以点」的错误暗示。 */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 skew-x-12 bg-white/25 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-hover:animate-shimmer group-disabled:hidden"
      />
      <span className="relative flex items-center justify-center gap-2">
        {loading ? (
          <>
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            正在登录
          </>
        ) : (
          <>
            登 录
            <ArrowRightOutlined className="text-xs transition-transform duration-200 group-hover:translate-x-0.5" />
          </>
        )}
      </span>
    </button>
  );
}
