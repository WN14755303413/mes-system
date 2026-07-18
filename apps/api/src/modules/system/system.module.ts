import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  DeptController,
  LogController,
  RoleController,
  UserController,
} from './system.controller';
import { DeptService } from './services/dept.service';
import { LogService } from './services/log.service';
import { RoleService } from './services/role.service';
import { UserService } from './services/user.service';

/**
 * M3 系统管理：用户 / 角色 / 部门 / 审计日志 / 接口日志。
 *
 * PrismaService 由全局 PrismaModule 提供；PasswordService 与 TokenService
 * 从 AuthModule 导入（重置密码要哈希，禁用/改角色要吊销会话）。
 */
@Module({
  imports: [AuthModule],
  controllers: [UserController, RoleController, DeptController, LogController],
  providers: [UserService, RoleService, DeptService, LogService],
})
export class SystemModule {}
