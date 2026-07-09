import { LockOutlined } from '@ant-design/icons';
import { Alert, App, Button, Form, Input, Modal } from 'antd';
import { PASSWORD_MIN_LENGTH, evaluatePassword } from '@mes/shared';
import { useState } from 'react';
import { useChangePassword } from '@/api/auth';
import { isApiError } from '@/api/client';
import { PasswordStrengthBar } from './PasswordStrengthBar';

interface Props {
  open: boolean;
  /** 改密成功后调用。此时后端已吊销全部会话，调用方应把用户送回登录页。 */
  onSuccess: () => void;
  onCancel: () => void;
}

interface FormValues {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/**
 * 强制修改密码。
 *
 * 触发时机：seed 出来的管理员首次登录，或管理员重置密码后下发了临时密码。
 * 此时后端除改密与登出外的所有接口都返回 403 PASSWORD_CHANGE_REQUIRED，
 * 所以这个对话框不可关闭——只能改密或登出。
 */
export function ChangePasswordModal({ open, onSuccess, onCancel }: Props) {
  const [form] = Form.useForm<FormValues>();
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { mutateAsync, isPending } = useChangePassword();
  const { message } = App.useApp();

  const handleSubmit = async (values: FormValues) => {
    setError(null);
    try {
      await mutateAsync({ oldPassword: values.oldPassword, newPassword: values.newPassword });
      message.success('密码已修改，请用新密码重新登录');
      form.resetFields();
      setNewPassword('');
      onSuccess();
    } catch (err) {
      setError(isApiError(err) ? err.message : '修改失败，请稍后再试');
    }
  };

  return (
    <Modal
      open={open}
      title="请先修改初始密码"
      footer={null}
      width={440}
      closable={false}
      maskClosable={false}
      keyboard={false}
    >
      <Alert
        type="warning"
        showIcon
        className="mb-5"
        message="当前密码是初始密码或管理员下发的临时密码"
        description="它曾以明文形式出现在部署配置或聊天记录中，必须更换后才能使用系统。"
      />

      <Form form={form} layout="vertical" onFinish={handleSubmit} requiredMark={false}>
        <Form.Item
          name="oldPassword"
          label="当前密码"
          rules={[{ required: true, message: '请输入当前密码' }]}
        >
          <Input.Password size="large" prefix={<LockOutlined className="text-slate-400" />} autoComplete="current-password" />
        </Form.Item>

        <Form.Item
          name="newPassword"
          label="新密码"
          rules={[
            { required: true, message: '请输入新密码' },
            { min: PASSWORD_MIN_LENGTH, message: `至少 ${PASSWORD_MIN_LENGTH} 位` },
            {
              // 与后端 evaluatePassword 同一套规则，避免前端放行、后端拒绝
              validator: (_, value: string) =>
                !value || evaluatePassword(value).score >= 2
                  ? Promise.resolve()
                  : Promise.reject(new Error('密码强度不足')),
            },
          ]}
        >
          <Input.Password
            size="large"
            prefix={<LockOutlined className="text-slate-400" />}
            autoComplete="new-password"
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </Form.Item>

        <PasswordStrengthBar value={newPassword} />

        <Form.Item
          name="confirmPassword"
          label="确认新密码"
          dependencies={['newPassword']}
          className="mt-4"
          rules={[
            { required: true, message: '请再次输入新密码' },
            ({ getFieldValue }) => ({
              validator: (_, value: string) =>
                !value || getFieldValue('newPassword') === value
                  ? Promise.resolve()
                  : Promise.reject(new Error('两次输入的密码不一致')),
            }),
          ]}
        >
          <Input.Password size="large" prefix={<LockOutlined className="text-slate-400" />} autoComplete="new-password" />
        </Form.Item>

        {error && <Alert type="error" showIcon message={error} className="mb-4" />}

        <div className="flex gap-3">
          <Button size="large" block onClick={onCancel} disabled={isPending}>
            退出登录
          </Button>
          <Button size="large" block type="primary" htmlType="submit" loading={isPending}>
            确认修改
          </Button>
        </div>
      </Form>
    </Modal>
  );
}
