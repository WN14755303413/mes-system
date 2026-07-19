# MES 项目管理系统

面向半导体湿法装备制造企业的项目型制造执行系统。

- 业务方案：[`项目管理型MES系统建设方案.md`](./项目管理型MES系统建设方案.md)
- 技术方案：[`docs/技术方案与实施计划.md`](./docs/技术方案与实施计划.md)

## 技术栈

前端 React 18 + TypeScript + Vite + Ant Design 5 · 后端 NestJS + Prisma · 数据库 Supabase (PostgreSQL)

## 架构要点

浏览器**不持有任何密钥**，也不直连数据库。Supabase 在本项目中只承担托管 Postgres 与对象存储的角色，
业务逻辑与权限校验全部在 NestJS 后端完成。因此前端 F12 中不存在可用于绕过鉴权的凭据。

```text
浏览器 ──HTTPS + httpOnly Cookie──> NestJS ──直连 PG──> Supabase
```

## 目录结构

```text
apps/api        NestJS 后端
apps/web        React 前端
packages/shared 前后端共享的枚举、权限点与接口类型
docs            技术文档
```

## 本地启动

### 1. 准备 Supabase

新建一个独立的 Supabase 项目，在 SQL Editor 中执行：

```sql
CREATE SCHEMA IF NOT EXISTS mes;
```

### 2. 配置环境变量

`.env` 已在首次搭建时生成（JWT 密钥为随机值）。需要补全其中标注 `REPLACE_ME` 的项：

| 变量 | 从哪里获取 |
|---|---|
| `DATABASE_URL` | Supabase → Project Settings → Database → Connection string → **Transaction pooler**（端口 6543），末尾保留 `?schema=mes&pgbouncer=true&connection_limit=1` |
| `DIRECT_URL` | 同上，改用 **Session pooler / Direct**（端口 5432），末尾保留 `?schema=mes` |
| `SUPABASE_URL` | Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | 同上。**仅后端使用，切勿下发前端** |
| `BOOTSTRAP_ADMIN_PASSWORD` | 自行设定，seed 完成后建议清空该行 |

### 3. 安装与运行

```bash
npm install
npm run db:migrate     # 创建 mes schema 下的表
npm run db:seed        # 创建初始管理员（M1 后可用）
npm run dev            # 前端 :5173，后端 :3000
```

访问 http://localhost:5173 。

## ⚠ WSL 用户请注意性能问题

本项目当前位于 `/mnt/d/...`，即 Windows 磁盘。WSL2 通过 9p 协议访问 Windows 文件系统，
`node_modules` 这类海量小文件的读写会慢一到两个数量级。实测影响：

- 后端启动需 **40 秒以上**（Prisma engine 加载）
- `vite build` 超过 5 分钟仍未完成

**建议把仓库迁到 WSL 原生文件系统**，例如：

```bash
cp -r "/mnt/d/vscode/Projects/EMS系统" ~/ems && cd ~/ems
rm -rf node_modules && npm install
```

之后在 VS Code 中用 `code ~/ems` 打开（Remote-WSL 会自动接管）。
Windows 侧仍可通过 `\\wsl$\Ubuntu\home\<用户名>\ems` 访问这些文件。

若坚持留在 `/mnt/d`，开发时请只用 `npm run dev`（dev server 首次启动慢但可用），
生产构建交给 Docker 在容器内完成即可。

## 部署

```bash
docker compose up -d --build
```

前端经 nginx 暴露在 `8080` 端口，并将 `/api` 反代到后端容器；后端不对宿主机暴露端口。
生产环境请在 nginx 之前再套一层 TLS 终结（或直接在本 nginx 配置证书），
因为 `COOKIE_SECURE=true` 要求 HTTPS。

## 实施进度

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M0 | 脚手架、Docker、Prisma 初始化、健康检查 | ✅ 已完成 |
| M1 | 认证与权限：登录页、Argon2、JWT Cookie、限流、RBAC | ✅ 已完成 |
| M2 | 主框架布局与主题 | ✅ 已完成 |
| M3 | 系统管理：用户/角色/部门/审计日志 | ✅ 已完成 |
| M4 | 项目管理：台账、里程碑、WBS、甘特图 | ✅ 已完成 |
| M5 | BOM 与图纸版本管理 | ✅ 已完成 |
| M6 | 物料齐套看板 | ✅ 已完成 |
| M7 | 生产计划与装配执行报工 | ✅ 已完成 |
| M8 | 质量管理：检验单、质量问题 8D 闭环 | ✅ 已完成 |
| M9 | 调试与 FAT/SAT 验收：调试记录、问题多轮整改复测、验收报告 PDF | ✅ 已完成 |
| M10 | 数据看板 | |
| M11 | ERP / 钉钉集成与生产部署 | |
