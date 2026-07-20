import { CheckCircleFilled, IdcardOutlined, MobileOutlined, UserOutlined } from '@ant-design/icons';
import { Alert, Button, Form, Input, Modal } from 'antd';
import { useEffect, useState } from 'react';
import { usePasswordResetRequest } from '@/api/auth';
import { isApiError } from '@/api/client';
import { CaptchaInput } from './CaptchaInput';

interface Props {
  open: boolean;
  onClose: () => void;
  /** 从登录框带过来的账号，省得用户再输一遍 */
  defaultUsername?: string;
}

interface FormValues {
  username: string;
  displayName: string;
  phone: string;
  reason?: string;
  captchaCode: string;
}

export function ForgotPasswordModal({ open, onClose, defaultUsername }: Props) {
  const [form] = Form.useForm<FormValues>();
  const [captchaId, setCaptchaId] = useState('');
  const [captchaRefresh, setCaptchaRefresh] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { mutateAsync, isPending } = usePasswordResetRequest();

  useEffect(() => {
    if (open) {
      setSubmitted(false);
      setError(null);
      form.setFieldsValue({ username: defaultUsername ?? '' });
    }
  }, [open, defaultUsername, form]);

  const handleSubmit = async (values: FormValues) => {
    setError(null);
    try {
      await mutateAsync({ ...values, captchaId });
      setSubmitted(true);
    } catch (err) {
      setError(isApiError(err) ? err.message : '提交失败，请稍后再试');
      // 验证码已被后端消费，无论成败都得换一张
      setCaptchaRefresh((n) => n + 1);
    }
  };

  return (
    <Modal
      maskClosable={false}
      keyboard={false}
      open={open}
      onCancel={onClose}
      footer={null}
      width={460}
      // 关闭即销毁：验证码是一次性的，下次打开必须重新取图，不能复用上次的 DOM
      destroyOnHidden
      title={submitted ? '申请已提交' : '找回密码'}
    >
      {submitted ? (
        <div className="py-4 text-center">
          <CheckCircleFilled className="text-5xl text-emerald-500" />
          <div className="mt-4 text-base font-medium text-slate-800">重置申请已登记</div>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
            系统管理员会核实你的身份后重置密码，并通过钉钉将临时密码发给你。
            首次使用临时密码登录时，系统会要求你立即设置新密码。
          </p>
          <Button type="primary" size="large" block className="mt-6" onClick={onClose}>
            返回登录
          </Button>
        </div>
      ) : (
        <>
          <Alert
            type="info"
            showIcon
            className="mb-5"
            message="本系统不使用邮件重置"
            description="为避免钓鱼邮件冒充重置链接，密码重置一律由系统管理员人工核实身份后办理。请填写以下信息以便核对。"
          />

          <Form form={form} layout="vertical" onFinish={handleSubmit} requiredMark={false}>
            <Form.Item
              name="username"
              label="账号"
              rules={[{ required: true, message: '请输入账号' }]}
            >
              <Input size="large" prefix={<UserOutlined className="text-slate-400" />} placeholder="登录账号 / 工号" />
            </Form.Item>

            <Form.Item
              name="displayName"
              label="真实姓名"
              rules={[{ required: true, message: '请输入真实姓名' }]}
            >
              <Input size="large" prefix={<IdcardOutlined className="text-slate-400" />} placeholder="与人事档案一致" />
            </Form.Item>

            <Form.Item
              name="phone"
              label="手机号"
              rules={[
                { required: true, message: '请输入手机号' },
                { pattern: /^1[3-9]\d{9}$/, message: '手机号格式不正确' },
              ]}
            >
              <Input size="large" prefix={<MobileOutlined className="text-slate-400" />} placeholder="用于管理员联系你核实身份" />
            </Form.Item>

            <Form.Item name="reason" label="补充说明">
              <Input.TextArea rows={2} maxLength={200} showCount placeholder="选填，例如：更换手机后无法登录" />
            </Form.Item>

            <Form.Item
              name="captchaCode"
              label="验证码"
              rules={[{ required: true, message: '请输入验证码' }]}
            >
              <CaptchaInput enabled={open} onIdChange={setCaptchaId} refreshKey={captchaRefresh} />
            </Form.Item>

            {error && <Alert type="error" showIcon message={error} className="mb-4" />}

            <div className="flex gap-3">
              <Button size="large" block onClick={onClose}>
                取消
              </Button>
              <Button size="large" block type="primary" htmlType="submit" loading={isPending}>
                提交申请
              </Button>
            </div>
          </Form>
        </>
      )}
    </Modal>
  );
}
