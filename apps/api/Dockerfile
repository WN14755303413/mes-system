# ---------- 构建阶段 ----------
FROM node:20-alpine AS builder
WORKDIR /repo

# monorepo：先只拷贝清单文件，让依赖层能被 Docker 缓存
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci

COPY packages/shared packages/shared
RUN npm run build --workspace=packages/shared

COPY apps/api apps/api
# prisma generate 只读 schema，不需要连接数据库
RUN npx prisma generate --schema apps/api/prisma/schema.prisma
RUN npm run build --workspace=apps/api

# 剔除 devDependencies，减小运行镜像。
# prisma CLI 与 tsx 在 dependencies 里：启动时的 migrate deploy 和运维执行 seed
# 都要在容器内离线可用，不能依赖 npx 临时从 registry 拉取（版本漂移 + 断网即挂）
RUN npm prune --omit=dev

# ---------- 运行阶段 ----------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# 不以 root 运行
RUN addgroup -S mes && adduser -S mes -G mes

COPY --from=builder --chown=mes:mes /repo/node_modules ./node_modules
COPY --from=builder --chown=mes:mes /repo/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=mes:mes /repo/packages/shared/package.json ./packages/shared/
COPY --from=builder --chown=mes:mes /repo/apps/api/dist ./dist
COPY --from=builder --chown=mes:mes /repo/apps/api/prisma ./prisma
COPY --from=builder --chown=mes:mes /repo/apps/api/package.json ./

USER mes
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# 启动前执行迁移，保证 schema 与代码版本一致
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
