# 单机 Docker Compose 部署

如果要把部署任务直接交给能够操作服务器的 AI，请使用 [`ai-deployment-guide.md`](ai-deployment-guide.md)。该文档包含可直接执行的版本锁定、配置生成、健康验证、回滚和数据保护约束。

当前部署方案面向个人探索或单机部署。Web 和 Server 镜像由 GitHub Actions 构建并发布到 GHCR，
部署机上的 Docker Compose 只拉取镜像，不需要 Node.js、pnpm 或项目源码。一个 Nginx 容器提供统一
入口，NestJS、MySQL、本地 MongoDB 和对象存储只在 Compose 内部网络通信，不直接暴露端口。物品领域数据也可以切换到 MongoDB Atlas；Atlas 模式不会启动本地 MongoDB 容器。

如果部署机必须自行获取源码并构建，可以在本文件基础上叠加
[`compose.source-build.yaml`](../compose.source-build.yaml)。该覆盖文件把 Git 仓库作为 BuildKit 远程构建上下文，具体命令见[本地部署指南](local-deployment.md#方式三-运行-compose-时自动拉取源码)。

## 镜像发布

推送到 `main` 后，[`publish-images.yml`](../.github/workflows/publish-images.yml) 会发布两个多架构镜像：

| 镜像 | Dockerfile target | 内容 |
| --- | --- | --- |
| `ghcr.io/duex-long/wuxu-web` | `web-runtime` | Nginx、用户端、`/admin/` 管理后台 |
| `ghcr.io/duex-long/wuxu-server` | `api-runtime` | NestJS API |

每次构建发布 `latest` 和 `sha-<commit>` 标签；Git tag 触发时还会发布同名版本标签。生产环境可通过
`WEB_IMAGE_TAG` 和 `SERVER_IMAGE_TAG` 独立固定版本，避免两个容器必须同时升级。

## 访问路径

| 路径 | 服务 | 说明 |
| --- | --- | --- |
| `/` | 用户端 | Vue 单页应用 |
| `/admin/` | 管理后台 | Vue 单页应用；`/admin` 自动跳转到 `/admin/` |
| `/api/` | NestJS API | Nginx 原样保留 `/api` 前缀反向代理 |

管理后台构建时的 Vite base 和 Vue Router history base 都是 `/admin/`。Nginx 对
`/admin/*` 使用 `/admin/index.html` 作为 SPA fallback，因此直接刷新后台子路由不会返回 404。

## 首次启动

```bash
cp .env.production.example .env.production
```

编辑 `.env.production`，至少替换 MySQL、S3、JWT 和初始账号密码。公开镜像无需登录；如果后续将
GHCR Package 改为私有，需要先在部署机执行 `docker login ghcr.io`。MySQL 和 MongoDB 默认写入部署目录下的 `data/`，也可以通过 `MYSQL_DATA_PATH`、`MONGODB_DATA_PATH` 和 `MONGODB_CONFIG_PATH` 指向其他本地磁盘。然后执行：

```bash
docker compose --env-file .env.production -f compose.production.yaml config
docker compose --env-file .env.production -f compose.production.yaml pull
docker compose --env-file .env.production -f compose.production.yaml up -d
```

默认入口：

- 用户端：http://localhost:8080/
- 管理后台：http://localhost:8080/admin/
- Swagger：http://localhost:8080/api/docs

初始账号创建成功后，将 `SEED_INITIAL_USERS` 改为 `false` 并再次启动，避免部署配置长期保留
初始化行为。

## 数据库说明

项目当前还没有正式迁移脚本，所以个人部署示例默认使用 `MYSQL_SYNCHRONIZE=true` 自动建表。
在面向公网或正式生产部署前，应先补齐 TypeORM migration，再将该值固定为 `false`。

### MongoDB Atlas 在线数据库

Atlas 模式需要 Docker Compose `2.24.4` 或更高版本，以及 Atlas 项目中的集群、数据库用户和允许部署机访问的 IP Access List。Atlas 控制台/API/AI 密钥不能作为数据库连接串使用。

从 Atlas 的 Connect 页面复制驱动连接串，在本地且不会提交 Git 的 `.env.production` 中填写：

```dotenv
MONGODB_URI='mongodb+srv://<database-user>:<url-encoded-password>@<cluster>.mongodb.net/wuxu?retryWrites=true&w=majority'
```

数据库用户密码中的保留字符必须进行 URL 编码。不要把真实连接串写入 Compose 文件、提交到 Git 或发送到日志。使用 Atlas 覆盖文件校验、拉取并启动：

```bash
docker compose --env-file .env.production -f compose.production.yaml -f compose.mongodb-atlas.yaml config --quiet
docker compose --env-file .env.production -f compose.production.yaml -f compose.mongodb-atlas.yaml pull
docker compose --env-file .env.production -f compose.production.yaml -f compose.mongodb-atlas.yaml up -d --pull always
```

Atlas 模式下 `mongodb` 服务不会启动，`api` 会直接通过 TLS 连接 Atlas。用 `/api/health/ready` 验证 MongoDB 状态；备份和恢复应使用 Atlas 自身的备份能力或逻辑导出，`MONGODB_DATA_PATH` 与 `MONGODB_CONFIG_PATH` 不再承载物品数据。

## 停止服务

```bash
docker compose --env-file .env.production -f compose.production.yaml down
```

Atlas 模式停止、更新或查看状态时，继续追加 `-f compose.mongodb-atlas.yaml`，确保操作的是同一个 Compose 模型。

该命令不会删除数据库宿主机目录或对象存储卷。不要使用 `down -v`，因为它会删除图片对象存储卷；MySQL 与 MongoDB 的 bind mount 目录需要单独管理和备份。

## 反向代理与 HTTPS

如果服务器外层还有 Caddy、Traefik 或云负载均衡，只需将域名流量转发到 `WEB_PORT`，并把
`PUBLIC_ORIGIN` 改为真实的 HTTPS 域名，例如 `https://inventory.example.com`。内部 Nginx 仍保持
`/`、`/admin/` 和 `/api/` 三条路径不变。
