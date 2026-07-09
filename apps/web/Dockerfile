# ---------- 构建阶段 ----------
FROM node:20-alpine AS builder
WORKDIR /repo

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN npm ci

COPY packages/shared packages/shared
RUN npm run build --workspace=packages/shared

COPY apps/web apps/web
RUN npm run build --workspace=apps/web

# ---------- 运行阶段 ----------
FROM nginx:1.27-alpine AS runtime
COPY --from=builder /repo/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
