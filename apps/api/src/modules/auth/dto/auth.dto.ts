import { IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { PASSWORD_MIN_LENGTH } from '@mes/shared';

export class LoginDto {
  // 初始管理员是 FAE@ADMIN，用户名允许字母数字与 @._- ；上限避免超长输入拖慢哈希路径
  @IsString()
  @Length(3, 64, { message: '账号长度应为 3-64 位' })
  @Matches(/^[\w.@-]+$/, { message: '账号含有非法字符' })
  username!: string;

  @IsString()
  @Length(1, 128, { message: '密码长度非法' })
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  captchaId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  captchaCode?: string;
}

export class ChangePasswordDto {
  @IsString()
  @Length(1, 128)
  oldPassword!: string;

  @IsString()
  @Length(PASSWORD_MIN_LENGTH, 128, { message: `新密码长度应为 ${PASSWORD_MIN_LENGTH}-128 位` })
  newPassword!: string;
}

export class PasswordResetRequestDto {
  @IsString()
  @Length(3, 64)
  @Matches(/^[\w.@-]+$/, { message: '账号含有非法字符' })
  username!: string;

  @IsString()
  @Length(2, 32, { message: '请填写真实姓名' })
  displayName!: string;

  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '请填写有效的手机号' })
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: '说明不超过 200 字' })
  reason?: string;

  @IsString()
  @MaxLength(64)
  captchaId!: string;

  @IsString()
  @MaxLength(16)
  captchaCode!: string;
}
