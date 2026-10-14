# 物序本地部署指南

本指南用于在个人电脑或单机服务器上运行完整的物序系统。项目的 Node.js、pnpm、MySQL、MongoDB 和对象存储版本均由 Docker 固定，宿主机不需要单独安装这些运行时。

物序提供两种本地运行方式：

| 模式 | 适用场景 | 对外端口 | Web 来源 |
| --- | --- | --- | --- |
| 源码开发模式 | 修改代码、调试、热更新 | `5173`、`5174`、`3100`，并暴露数据库和对象存储端口 | 本地源码构建 |
| 单机运行模式 | 个人长期使用、模拟正式部署 | 默认只暴露 `8080` | 从 GHCR 拉取已构建镜像 |
| 远程源码构建模式 | 部署机自动拉取指定 Git 版本并自行构建 | 默认只暴露 `8080` | Docker BuildKit 从 Git 获取源码 |

如果只是使用系统而不修改代码，建议选择单机运行模式。如果需要继续开发功能，选择源码开发模式。只有明确要求部署机自行编译时，才选择远程源码构建模式。

## 部署前准备

宿主机需要安装：

- Docker Desktop，或 Docker Engine 与 Docker Compose v2

源码开发模式还需要 Git。单机镜像模式和远程源码构建模式可以只保存部署配置文件，不要求在宿主机克隆完整源码。

先确认 Docker 可以正常使用：

```bash
docker version
docker compose version
```

克隆主 Monorepo：

```bash
git clone https://github.com/Duex-long/wuxu-platform.git
cd wuxu-platform
```

日常部署只需要 `wuxu-platform`，不需要分别克隆用户端、管理后台和 API 仓库。

## 方式一 源码开发模式

### 1. 创建本地环境配置

macOS 或 Linux：

```bash
cp .env.example .env
mkdir -p data/mysql data/mongodb data/mongodb-config
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env
New-Item -ItemType Directory -Force data/mysql, data/mongodb, data/mongodb-config
```

开发环境可以直接使用示例账号。建议至少将 `.env` 中的 `JWT_SECRET` 改为长度不低于 32 个字符的随机值。数据库默认写入上述本地目录；如需改到其他磁盘，编辑 `.env` 中的 `MYSQL_DATA_PATH`、`MONGODB_DATA_PATH` 和 `MONGODB_CONFIG_PATH`。

### 2. 构建并启动服务

```bash
docker compose up -d --build
```

首次构建需要下载基础镜像并安装依赖，完成后检查容器状态：

```bash
docker compose ps
```

`mysql`、`mongodb`、`object-storage` 和 `api` 应显示为 `healthy`，两个 Web 服务应显示为 `running`。

### 3. 检查 API

```bash
curl http://localhost:3100/api/health/live
```

接口返回成功后，可以访问：

| 功能 | 地址 |
| --- | --- |
| 用户端首页 | http://localhost:5173/ |
| 用户端查找物品 | http://localhost:5173/items/search |
| 用户端新增物品 | http://localhost:5173/items/new |
| 用户端查找位置 | http://localhost:5173/locations/search |
| 用户端新增位置 | http://localhost:5173/locations/new |
| 后台数据中心 | http://localhost:5174/ |
| 后台类目管理 | http://localhost:5174/categories |
| 后台位置管理 | http://localhost:5174/locations |
| Swagger API 文档 | http://localhost:3100/api/docs |
| SeaweedFS 控制页 | http://localhost:9333/ |

默认开发账号：

| 角色 | 邮箱 | 密码 |
| --- | --- | --- |
| 普通用户 | `user@wuxu.local` | `wuxu-user-123456` |
| 管理员 | `admin@wuxu.local` | `wuxu-admin-123456` |

这些账号和密码仅用于本地开发，不应在可被其他人访问的环境中使用。

### 4. 首次使用顺序

1. 使用管理员账号进入后台类目管理页面，创建大类目和小类目。
2. 按需进入后台位置管理页面，创建所有用户可见的全局位置并上传位置照片。
3. 使用普通用户账号登录用户端。
4. 如需个人位置，在用户端“新增位置”页面创建并上传照片，再到“查找位置”确认结果。
5. 在新增物品页面登记物品，并从后台维护的类目、全局位置或本人的个人位置中选择。
6. 在查找物品页面确认登记结果，或更新使用中、未使用、已损坏和已消耗状态。

系统在没有后台类目时会提供“未分类”兜底类目，但建议先完成正式类目配置。

### 5. 开发时同步代码

普通的 `docker compose up -d --build` 使用构建时的源码。需要自动同步 `src` 目录并热更新时，在另一个终端运行：

```bash
docker compose watch
```

如果修改了 `package.json`、`pnpm-lock.yaml`、Dockerfile 或构建配置，需要重新构建：

```bash
docker compose up -d --build
```

提交代码前可以在固定 Docker 环境中执行完整构建检查：

```bash
docker build --target verification -f Dockerfile.dev .
```

## 方式二 单机运行模式

单机运行模式直接拉取公开的多架构镜像，支持常见的 amd64 和 arm64 主机。宿主机不需要 Node.js、pnpm，也不会对外暴露 MySQL、MongoDB 和对象存储端口。

### 1. 创建部署配置

macOS 或 Linux：

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

Windows PowerShell：

```powershell
Copy-Item .env.production.example .env.production
```

编辑 `.env.production`，至少替换以下内容：

- `MYSQL_PASSWORD`
- `MYSQL_ROOT_PASSWORD`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `JWT_SECRET`
- `INITIAL_USER_PASSWORD`
- `INITIAL_ADMIN_PASSWORD`

数据库文件默认保存在部署目录的 `data/mysql`、`data/mongodb` 和 `data/mongodb-config`。如需放到单独的本地磁盘或备份盘，可以把以下变量改为宿主机绝对路径：

```dotenv
MYSQL_DATA_PATH=/srv/wuxu-data/mysql
MONGODB_DATA_PATH=/srv/wuxu-data/mongodb
MONGODB_CONFIG_PATH=/srv/wuxu-data/mongodb-config
```

这些目录应位于本地磁盘，不要放入 Git、网盘同步目录或多台主机同时写入的共享目录。首次启动前创建目录；相对路径以 Compose 文件所在目录为基准：

```bash
mkdir -p data/mysql data/mongodb data/mongodb-config
```

macOS 或 Linux 可以使用以下命令生成随机值：

```bash
openssl rand -hex 32
```

`.env.production` 包含密码和密钥，不要提交到 Git，也不要将 `docker compose config` 的完整输出发送给他人。

### 2. 校验并拉取镜像

```bash
docker compose --env-file .env.production -f compose.production.yaml config --quiet
docker compose --env-file .env.production -f compose.production.yaml pull
```

默认拉取：

- `ghcr.io/duex-long/wuxu-web:latest`
- `ghcr.io/duex-long/wuxu-server:latest`

需要固定版本时，将 `WEB_IMAGE_TAG` 和 `SERVER_IMAGE_TAG` 设置为相同发布版本，或者对应的 `sha-<短提交号>` 标签。

### 3. 启动服务

```bash
docker compose --env-file .env.production -f compose.production.yaml up -d --pull always
```

检查状态：

```bash
docker compose --env-file .env.production -f compose.production.yaml ps
```

默认访问地址：

| 功能 | 地址 |
| --- | --- |
| 用户端 | http://localhost:8080/ |
| 用户端查找位置 | http://localhost:8080/locations/search |
| 用户端新增位置 | http://localhost:8080/locations/new |
| 后台数据中心 | http://localhost:8080/admin/ |
| 后台类目管理 | http://localhost:8080/admin/categories |
| 后台位置管理 | http://localhost:8080/admin/locations |
| Swagger API 文档 | http://localhost:8080/api/docs |

Nginx 在同一入口下代理用户端、管理后台和 API。直接刷新 `/admin/categories` 或 `/admin/locations` 也会正确返回后台应用。

### 4. 关闭初始化账号功能

首次启动时，`SEED_INITIAL_USERS=true` 会创建 `.env.production` 中配置的普通用户和管理员。确认两个账号可以登录后，将其改为：

```dotenv
SEED_INITIAL_USERS=false
```

然后重新应用配置：

```bash
docker compose --env-file .env.production -f compose.production.yaml up -d
```

### 5. 更新版本

```bash
git pull --ff-only
docker compose --env-file .env.production -f compose.production.yaml pull
docker compose --env-file .env.production -f compose.production.yaml up -d --pull always
```

更新容器不会删除 MySQL、MongoDB 的宿主机数据目录或对象存储卷。

## 方式三 运行 Compose 时自动拉取源码

Docker Compose 本身不应在已经启动的业务容器中执行 `git pull`。项目通过 `compose.source-build.yaml` 将 Git 仓库配置为 Docker BuildKit 的远程构建上下文；每次执行构建时，Docker 会获取 `SOURCE_GIT_REF` 指定的源码版本，再生成并启动 Web 与 Server 镜像。

该模式仍然使用 `compose.production.yaml` 中的 MySQL、MongoDB、对象存储、健康检查和统一 Nginx 入口。

### 1. 准备最小部署目录

部署机不需要克隆完整仓库，只需保存两个 Compose 文件和一份本地环境文件：

```bash
mkdir wuxu-deploy
cd wuxu-deploy
curl -fsSL https://raw.githubusercontent.com/Duex-long/wuxu-platform/main/compose.production.yaml -o compose.production.yaml
curl -fsSL https://raw.githubusercontent.com/Duex-long/wuxu-platform/main/compose.source-build.yaml -o compose.source-build.yaml
curl -fsSL https://raw.githubusercontent.com/Duex-long/wuxu-platform/main/.env.production.example -o .env.production
chmod 600 .env.production
```

Compose 文件负责描述部署，业务源码会在后续构建阶段由 BuildKit 从 `SOURCE_GIT_URL` 获取。

### 2. 配置源码版本

在 `.env.production` 中设置：

```dotenv
SOURCE_GIT_URL=https://github.com/Duex-long/wuxu-platform.git
SOURCE_GIT_REF=main
SOURCE_IMAGE_TAG=local
SOURCE_WEB_IMAGE=wuxu/web-source
SOURCE_SERVER_IMAGE=wuxu/server-source
```

`SOURCE_GIT_REF` 可以是：

- `main` 等分支名：每次构建获取该分支当前代码。
- `v1.0.0` 等标签：部署明确发布版本。
- 完整 Git commit SHA：获得最稳定、可重复的构建结果。

正式使用时建议固定标签或完整 commit SHA，避免同一条命令在不同时间构建出不同版本。

### 3. 自动拉取源码并部署

```bash
docker compose \
  --env-file .env.production \
  -f compose.production.yaml \
  -f compose.source-build.yaml \
  up -d --build
```

这条命令会：

1. 从 `SOURCE_GIT_URL` 获取 `SOURCE_GIT_REF` 对应代码。
2. 使用仓库根目录的 `Dockerfile` 构建 `api-runtime` 和 `web-runtime`。
3. 等待 MySQL、MongoDB、对象存储和 API 健康检查通过。
4. 启动统一的 Nginx 入口。

此模式不要附加 `--pull always`；`pull_policy: build` 已明确要求本地构建服务镜像。Docker 仍会按需拉取 Dockerfile 使用的 Node 和 Nginx 基础镜像。

### 4. 更新远程源码部署

修改 `SOURCE_GIT_REF`，或者保持分支名不变并重新执行：

```bash
docker compose \
  --env-file .env.production \
  -f compose.production.yaml \
  -f compose.source-build.yaml \
  up -d --build
```

BuildKit 会检查远程 Git 引用；源码提交没有变化时可以复用构建缓存。更新容器不会删除数据库宿主机目录或对象存储卷。

停止服务时必须继续同时传入两个 Compose 文件：

```bash
docker compose \
  --env-file .env.production \
  -f compose.production.yaml \
  -f compose.source-build.yaml \
  down
```

## 日常运维命令

源码开发模式：

```bash
docker compose ps
docker compose logs -f api
docker compose logs --tail=200 admin-web
docker compose restart api
docker compose down
```

单机运行模式：

```bash
docker compose --env-file .env.production -f compose.production.yaml ps
docker compose --env-file .env.production -f compose.production.yaml logs -f api
docker compose --env-file .env.production -f compose.production.yaml logs --tail=200 gateway
docker compose --env-file .env.production -f compose.production.yaml restart api gateway
docker compose --env-file .env.production -f compose.production.yaml down
```

`down` 只停止并移除容器和网络，不会删除持久化数据。

## 数据保留、迁移与备份

默认存储位置：

- `data/mysql`：MySQL 用户、角色和登录信息。
- `data/mongodb`：MongoDB 类目、存放位置、物品、状态记录和图片元数据。
- `data/mongodb-config`：MongoDB 本地配置数据。
- SeaweedFS 图片文件仍保存在 Docker 命名卷 `object_data` 或 `object_production_data`。

`docker compose down` 和 `docker compose down -v` 都不会删除上述宿主机数据库目录；但 `down -v` 会删除 SeaweedFS 命名卷，因此有图片数据时仍然禁止使用 `-v`。

### 从旧 Docker 数据卷迁移

2026-10-14 之前创建的环境可能仍使用 `wuxu_mysql_data`、`wuxu_mongo_data`、`wuxu-production_mysql_production_data` 或 `wuxu-production_mongo_production_data`。切换新 Compose 前先从仍连接旧卷的 MySQL 容器做逻辑导出，再停止 API 和数据库。MySQL 不能直接把底层文件从 Linux Docker volume 复制到 macOS 或 Windows bind mount，否则可能因为文件系统大小写规则不同而无法启动。

```bash
mkdir -p data/backups data/mysql data/mongodb data/mongodb-config
docker compose exec -T mysql sh -c 'exec mysqldump -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" --single-transaction --routines --events --no-tablespaces --databases "$MYSQL_DATABASE"' > data/backups/mysql-volume-migration.sql

docker compose stop api mysql mongodb
docker run --rm -v wuxu_mongo_data:/from:ro -v "$PWD/data/mongodb:/to" alpine:3.22 sh -c 'cp -a /from/. /to/'

docker compose up -d mysql mongodb
docker cp data/backups/mysql-volume-migration.sql wuxu-mysql-1:/tmp/mysql-volume-migration.sql
docker compose exec -T mysql sh -c 'exec mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" -e "source /tmp/mysql-volume-migration.sql"'
docker compose up -d
```

卷名和容器名取决于 `COMPOSE_PROJECT_NAME`。执行迁移前先用 `docker volume ls` 和 `docker inspect <数据库容器>` 确认实际来源，并保证三个目标目录为空；生产模式执行命令时要带上 `--env-file .env.production -f compose.production.yaml`。MongoDB 的旧 `/data/configdb` 匿名卷通常不含业务数据，可以从空目录重新生成；如需完整迁移，可从 `docker inspect` 返回的对应卷按相同方式复制。

迁移后分别核对 MySQL 用户数量和 MongoDB 各集合数量，再验证 API 就绪检查。旧卷不要立即删除，至少保留到新目录经过一次完整备份和恢复演练之后。

### 目录级备份

数据库目录只能在 MySQL 和 MongoDB 已停止写入时直接打包，避免获得不一致的文件快照：

```bash
docker compose stop api mysql mongodb
mkdir -p backups
tar -czf "backups/wuxu-databases-$(date +%Y%m%d-%H%M%S).tar.gz" data/mysql data/mongodb data/mongodb-config
docker compose start mysql mongodb api
```

生产环境使用相同原则，并换成 `.env.production` 中配置的实际目录。恢复前应停止 API 和数据库，先保留现有目录，再从同一版本的完整备份恢复；不要只复制数据库运行中的单个文件。

## 常见问题

### 端口已被占用

源码开发模式默认使用 `5173`、`5174`、`3100`、`3306`、`27017`、`8333` 和 `9333`。用户端、后台和 API 端口可以在 `.env` 中通过 `USER_WEB_PORT`、`ADMIN_WEB_PORT` 和 `API_PORT` 修改。

如果 `3306` 或 `27017` 与本机已有数据库冲突，可以先停止本机数据库服务，或修改 `compose.yaml` 对应端口映射左侧的宿主机端口。单机运行模式默认只对外占用 `8080`，可通过 `.env.production` 中的 `WEB_PORT` 修改。

### API 一直处于 unhealthy

先查看依赖服务和 API 日志：

```bash
docker compose ps
docker compose logs --tail=200 mysql mongodb object-storage api
```

常见原因包括 Docker 可用内存不足、数据库首次启动尚未完成、数据目录权限错误、环境变量错误，或者旧数据目录中的账号密码与新配置不一致。

### 远程源码无法拉取

先确认部署机可以访问 `SOURCE_GIT_URL`，并确认 `SOURCE_GIT_REF` 是存在的分支、标签或提交。当前默认仓库是公开仓库；如果将来改为私有仓库，需要额外配置 BuildKit 的 Git 身份验证，不能只依赖业务镜像使用的 GHCR 登录状态。

### 修改代码后页面没有变化

确认正在运行 `docker compose watch`。如果改动涉及依赖、构建配置或 Dockerfile，应重新执行：

```bash
docker compose up -d --build
```

### 登录失败

确认使用的是当前 `.env` 或 `.env.production` 中配置的邮箱和密码，并检查 API 日志。初始化账号只在启用 `SEED_DEV_USERS` 或 `SEED_INITIAL_USERS` 时创建，不会在每次启动时覆盖已有用户密码。

### 图片无法上传

检查 `object-storage` 是否健康，以及 API 是否能够访问 S3 接口：

```bash
docker compose ps object-storage api
docker compose logs --tail=200 object-storage api
```

系统支持 JPEG、PNG、WebP 和 GIF；单张图片不得超过 10MB，每件物品最多选择 8 张图片。
