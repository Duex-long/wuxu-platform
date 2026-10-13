# Wuxu Platform

物序个人物品管理系统的主 Monorepo，也是产品代码的唯一事实来源。

## 仓库职责

- `apps/user-web`：Vue 3 用户端，负责物品登记、查询和个人统计。
- `apps/admin-web`：Vue 3 管理后台，负责跨用户只读查询和汇总。
- `apps/api`：NestJS API，负责认证、权限、物品、类目、图片和统计。
- `packages/shared-types`：前后端共享的数据类型与枚举。
- `infrastructure`：本地开发和部署基础设施。
- `docs`：需求、架构和仓库管理说明。

## 关联仓库

| 目录 | 拆分仓库 |
| --- | --- |
| `apps/user-web` | `Duex-long/wuxu-user-web` |
| `apps/admin-web` | `Duex-long/wuxu-admin-web` |
| `apps/api` | `Duex-long/wuxu-api` |

日常开发应在本仓库完成。三个拆分仓库用于独立部署、权限隔离或交付，不作为并行开发源。

## 当前阶段

首个可运行版本已经完成：

- 用户端：登录、个人统计、两级类目维护、受控存放位置选择与内容查看、登记与筛选物品、顺序多图上传、图片预览、状态变更、软删除。
- 管理后台：管理员登录、存放位置和位置照片管理、全局统计、状态和类目分布、跨用户只读查询、位置筛选和图片预览。
- API：JWT 认证与角色权限、MySQL 用户、MongoDB 类目/位置/物品/图片元数据、S3 图片文件、状态变更历史、统计、健康检查和 Swagger 文档。
- 开发环境：固定 Node、pnpm、MySQL、MongoDB 和 S3 兼容对象存储版本的 Docker Compose。

## 快速启动

```bash
cp .env.example .env
docker compose build
docker compose up -d
```

启动后访问：

- 用户端：http://localhost:5173
- 管理后台：http://localhost:5174
- API：http://localhost:3100/api
- Swagger：http://localhost:3100/api/docs

详细说明、固定版本与默认开发账号见 [`docs/development.md`](docs/development.md)。

## 单机部署

GitHub Actions 会将生产镜像分别发布到 GHCR，部署机上的 Compose 只负责拉取并启动。Nginx
通过统一入口对外提供服务：

- 用户端：`/`
- 管理后台：`/admin/`（访问 `/admin` 会跳转到 `/admin/`）
- API：`/api/`

部署命令、环境变量和路由说明见 [`docs/deployment.md`](docs/deployment.md)。

