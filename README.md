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

仓库结构和公共领域类型已初始化。下一步将在 `apps` 下分别创建 Vue 3 与 NestJS 工程，并补充 Docker 开发环境。

