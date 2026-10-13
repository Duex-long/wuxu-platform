# Infrastructure

开发基础设施由仓库根目录的 `compose.yaml` 和 `Dockerfile.dev` 管理，当前包括：

- 固定版本的 Node.js 与 pnpm 开发镜像
- MySQL 8.4 用户与身份数据
- MongoDB 8.0 物品领域数据
- SeaweedFS 3.94 本地 S3 兼容对象存储
- NestJS、用户端和管理后台热更新容器

敏感配置不得提交到仓库；仅提供 `.env.example`。

详细使用方法见 `docs/development.md`。

单机部署由 `compose.production.yaml` 和 `Dockerfile` 管理，Nginx 在同一域名下提供用户端 `/`、
管理后台 `/admin/`，并将 `/api/` 反向代理到 NestJS。详细说明见 `docs/deployment.md`。

