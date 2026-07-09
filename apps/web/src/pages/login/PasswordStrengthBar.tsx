import { evaluatePassword } from '@mes/shared';

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#16a34a'];

/** 密码强度条。规则与后端共用 evaluatePassword，不会出现前端放行、后端拒绝的割裂。 */
export function PasswordStrengthBar({ value }: { value: string }) {
  if (!value) return null;

  const { score, label, issues } = evaluatePassword(value);

  return (
    <div className="mt-2">
      <div className="flex items-center gap-1.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="h-1 flex-1 rounded-full transition-colors duration-300"
            style={{ background: i <= score ? COLORS[score] : '#e2e8f0' }}
          />
        ))}
        <span className="ml-1 w-8 shrink-0 text-right text-xs" style={{ color: COLORS[score] }}>
          {label}
        </span>
      </div>
      {issues.length > 0 && (
        <div className="mt-1.5 text-xs leading-relaxed text-slate-500">
          还需：{issues.join('、')}
        </div>
      )}
    </div>
  );
}
