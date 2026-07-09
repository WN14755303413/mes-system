import { ReloadOutlined, SafetyOutlined } from '@ant-design/icons';
import { Input, Spin, Tooltip } from 'antd';
import { useEffect } from 'react';
import { useCaptcha } from '@/api/auth';

interface Props {
  value?: string;
  onChange?: (value: string) => void;
  /** 图片刷新后回传新的 captchaId，提交时要一并带上 */
  onIdChange: (captchaId: string) => void;
  enabled: boolean;
  /** 提交失败时由父组件递增，触发重新取图——验证码是一次性的，用过即废 */
  refreshKey: number;
}

export function CaptchaInput({ value, onChange, onIdChange, enabled, refreshKey }: Props) {
  const { data, isFetching, refetch } = useCaptcha(enabled);
  const captchaId = data?.captchaId;

  // 取到新图就把 id 抬给父组件。必须放在 effect 里——渲染期间调用父组件的 setState
  // 会触发一轮额外渲染，进而无限循环。
  useEffect(() => {
    if (captchaId) onIdChange(captchaId);
  }, [captchaId, onIdChange]);

  // 验证码一次性消费，父组件在提交失败后递增 refreshKey 换一张新图
  useEffect(() => {
    if (refreshKey > 0 && enabled) {
      onChange?.('');
      void refetch();
    }
    // onChange / refetch 不入依赖：它们每次渲染都是新引用，会让本 effect 反复执行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const reload = () => {
    onChange?.('');
    void refetch();
  };

  return (
    <div className="flex items-stretch gap-2.5">
      <Input
        size="large"
        allowClear
        autoComplete="off"
        placeholder="验证码"
        prefix={<SafetyOutlined className="text-slate-400" />}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        maxLength={6}
      />

      <Tooltip title="点击刷新">
        <button
          type="button"
          onClick={reload}
          aria-label="刷新验证码"
          className="group relative flex h-10 w-[120px] shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50 transition-colors hover:border-industrial-400"
        >
          {isFetching || !data ? (
            <Spin size="small" />
          ) : (
            // 后端返回 SVG 源码，直接内联，省掉一次图片请求
            <span
              className="flex h-full w-full items-center justify-center [&>svg]:h-full [&>svg]:w-full"
              // eslint-disable-next-line react/no-danger -- 内容来自本系统后端的 svg-captcha，不含用户输入
              dangerouslySetInnerHTML={{ __html: data.svg }}
            />
          )}
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/70 opacity-0 backdrop-blur-[1px] transition-opacity group-hover:opacity-100">
            <ReloadOutlined className="text-industrial-600" />
          </span>
        </button>
      </Tooltip>
    </div>
  );
}
