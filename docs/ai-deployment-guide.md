# 物序 AI 快速部署指南

把本文件完整交给能够操作目标服务器终端的 AI，即可部署物序系统。执行 AI 必须实际完成环境检查、代码获取、配置生成、容器启动和健康验证，不能只复述命令。

默认部署方式是：从主 Monorepo 获取部署配置，锁定一个 Git 提交，拉取该提交对应的 Web 和 Server 镜像，再通过 Docker Compose 启动完整系统。宿主机不需要安装 Node.js、pnpm、MySQL 或 MongoDB。

## 给执行 AI 的任务

你是物序系统的部署执行者。请在当前目标主机上完成部署，并遵守以下规则：

1. 先执行只读检查，再修改文件或启动服务。
2. 默认使用预构建镜像部署；只有用户明确要求从源码构建，或指定提交的镜像确实不存在时，才使用远程源码构建模式。
3. 只使用主仓库 `https://github.com/Duex-long/wuxu-platform.git`。不要分别克隆 `wuxu-user-web`、`wuxu-admin-web` 和 `wuxu-api`。
4. 默认部署 `main` 当前提交；镜像必须同时使用同一个 `sha-<7 位提交号>` 标签，禁止 Web 和 Server 使用不同版本。
5. 已存在的 `.env.production`、数据库宿主机目录、Docker volume 和用户数据必须保留。不要覆盖未知配置，不要执行 `git reset --hard`，不要执行 `docker compose down -v`，不要删除部署目录或 `data/`。
6. 不要在终端输出、聊天回复或日志摘要中展示 MySQL、S3、JWT 密钥和密码。部署完成后只向用户提供访问地址、初始账号邮箱，以及用户确实需要保存的初始登录密码。
7. 如果发现已有未提交代码、同名但来源不同的 Git 仓库、端口冲突、Docker 不可用，或无法确认旧数据目录/数据卷的归属，停止可能覆盖数据的步骤，说明具体冲突并询问用户。
8. 命令失败时先检查状态和日志，修复明确原因后重试；不得通过清空数据目录或数据卷规避错误。
9. 完成标准是容器状态正常、API 就绪检查成功、用户端和管理后台可访问、两个初始账号能够登录。

## 可选部署参数

用户可以在粘贴本指南时追加参数。未提供时使用默认值。

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `WUXU_DEPLOY_DIR` | 当前目录下的 `wuxu-platform` | Git 仓库与部署配置目录 |
| `WUXU_GIT_REF` | `main` | 分支、标签或完整提交 SHA |
| `WEB_PORT` | `8080` | 统一 Web 入口端口 |
| `PUBLIC_ORIGIN` | `http://localhost:8080` | 浏览器访问系统的完整 Origin；有域名时应填写真实 HTTPS 地址 |
| `INITIAL_USER_EMAIL` | `user@wuxu.local` | 初始普通用户邮箱 |
| `INITIAL_ADMIN_EMAIL` | `admin@wuxu.local` | 初始管理员邮箱 |
| `MYSQL_DATA_PATH` | `<部署目录>/data/mysql` | MySQL 宿主机数据目录 |
| `MONGODB_DATA_PATH` | `<部署目录>/data/mongodb` | MongoDB 宿主机数据目录 |
| `MONGODB_CONFIG_PATH` | `<部署目录>/data/mongodb-config` | MongoDB 宿主机配置目录 |
| `MONGODB_MODE` | `local` | `local` 使用 Compose 本地 MongoDB；`atlas` 使用 MongoDB Atlas |
| `DEPLOY_MODE` | `image` | `image` 拉取镜像；`source` 从 Git 远程构建 |

如果目标是远程服务器，但用户没有提供公网域名或访问地址，先用 `http://<服务器 IP>:8080` 向用户确认 `PUBLIC_ORIGIN`。仅在本机使用时可直接采用默认值。

## 系统组成和访问路径

Docker Compose 会启动以下服务：

- `gateway`：Nginx、Vue 用户端和 Vue 管理后台。
- `api`：NestJS API。
- `mysql`：用户和身份数据。
- `mongodb`：本地模式下保存类目、位置、物品、状态历史和图片元数据；Atlas 模式下不启动此服务。
- `object-storage`：物品图片和位置照片文件。

统一入口：

| 路径 | 内容 |
| --- | --- |
| `/` | 用户端 |
| `/admin/` | 管理后台；`/admin` 会跳转到 `/admin/` |
| `/api/docs` | Swagger API 文档 |
| `/api/health/ready` | API 及依赖服务就绪检查 |

生产 Compose 默认只向宿主机暴露 `WEB_PORT`。MySQL、MongoDB、对象存储和 API 仅在 Compose 内部网络通信。

## 第一步 环境预检

在目标主机执行：

```bash
docker version
docker compose version
git --version
curl --version
openssl version
```

要求：

- Docker Engine 或 Docker Desktop 可用。
- Docker Compose 必须是支持 `docker compose` 的 v2 版本；Atlas 模式必须为 `2.24.4` 或更高版本。
- Git、curl 和 OpenSSL 可用。
- 镜像部署需要能够访问 GitHub、GHCR 和 Docker Hub。
- 远程源码构建还需要 Docker BuildKit 能够访问 GitHub。

检查目标端口是否已占用。Linux 优先使用 `ss`，macOS 优先使用 `lsof`：

```bash
ss -ltn 2>/dev/null | grep ':8080 ' || true
lsof -nP -iTCP:8080 -sTCP:LISTEN 2>/dev/null || true
```

如果默认端口被占用，不要停止未知进程；改用用户指定端口，或向用户确认新的 `WEB_PORT`。

## 第二步 获取并固定代码版本

如果部署目录不存在，克隆主仓库。以下命令使用默认目录；用户指定 `WUXU_DEPLOY_DIR` 时，应把目标目录替换为该绝对路径：

```bash
git clone https://github.com/Duex-long/wuxu-platform.git wuxu-platform
cd wuxu-platform
```

如果目录已经是该仓库：

1. 用 `git remote get-url origin` 确认来源。
2. 用 `git status --short` 检查本地修改。
3. 工作区干净时才允许执行 `git pull --ff-only`。
4. 工作区有改动时不得覆盖，先向用户报告。

默认更新 `main`：

```bash
git fetch --prune origin
git switch main
git pull --ff-only origin main
```

如果用户指定标签或完整提交 SHA，获取对应引用后使用 detached HEAD，不要创建或改写远端分支。随后记录：

```bash
git rev-parse HEAD
git rev-parse --short=7 HEAD
```

将完整 SHA 记为部署版本，将 7 位短 SHA 组成镜像标签 `sha-<短 SHA>`。例如提交 `3388f745...` 对应 `sha-3388f74`。

## 第三步 检查发布镜像

镜像部署使用：

- `ghcr.io/duex-long/wuxu-web:sha-<短 SHA>`
- `ghcr.io/duex-long/wuxu-server:sha-<短 SHA>`

执行 AI 应使用实际短 SHA 检查两个镜像，不能原样复制占位符：

```bash
docker buildx imagetools inspect ghcr.io/duex-long/wuxu-web:sha-<短 SHA>
docker buildx imagetools inspect ghcr.io/duex-long/wuxu-server:sha-<短 SHA>
```

如果当前 Docker 发行版没有 `docker buildx imagetools`，可使用 `docker manifest inspect <完整镜像标签>` 完成同等的只读检查。

两个镜像均存在时继续镜像部署。如果其中一个不存在，不得把另一个版本与 `latest` 混用。先确认对应 GitHub Actions 是否仍在构建；用户要求立即部署时，可以切换到本指南的远程源码构建模式。

当前镜像为公开 GHCR Package，不需要登录。若未来仓库改为私有，在用户提供具有 `read:packages` 权限的凭据后执行 `docker login ghcr.io`；不要替用户创建或猜测访问令牌。

## 第四步 创建生产配置

如果 `.env.production` 不存在，这是首次部署：

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

如果文件已经存在，必须保留原文件，只补充缺失项。不要用示例文件覆盖它，也不要重新生成已经投入使用的数据库或对象存储凭据。

按以下规则修改 `.env.production`：

```dotenv
COMPOSE_PROJECT_NAME=wuxu-production
WEB_PORT=8080
PUBLIC_ORIGIN=http://localhost:8080

WEB_IMAGE=ghcr.io/duex-long/wuxu-web
WEB_IMAGE_TAG=sha-<短 SHA>
SERVER_IMAGE=ghcr.io/duex-long/wuxu-server
SERVER_IMAGE_TAG=sha-<短 SHA>

MYSQL_DATABASE=wuxu
MYSQL_USER=wuxu
MYSQL_SYNCHRONIZE=true
MONGODB_DATABASE=wuxu
MYSQL_DATA_PATH=./data/mysql
MONGODB_DATA_PATH=./data/mongodb
MONGODB_CONFIG_PATH=./data/mongodb-config

S3_REGION=us-east-1
S3_BUCKET=wuxu-items
JWT_EXPIRES_IN=2h

SEED_INITIAL_USERS=true
INITIAL_USER_EMAIL=user@wuxu.local
INITIAL_ADMIN_EMAIL=admin@wuxu.local
```

必须替换所有 `replace-with-...` 占位符。没有用户指定值时，使用 OpenSSL 生成加密安全随机值，并通过命令替换或安全文件编辑直接写入配置。不要单独执行会把随机值打印到日志的命令；下面是不会主动输出值的捕获方式示例：

```bash
WUXU_RANDOM_VALUE="$(openssl rand -hex 32)"
```

每个字段都要重新生成，不能重复使用示例变量中的同一个值，也不要启用 shell 调试输出 `set -x`。

需要独立生成并分别写入：

- `MYSQL_PASSWORD`
- `MYSQL_ROOT_PASSWORD`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `JWT_SECRET`，长度不得少于 32 个字符
- `INITIAL_USER_PASSWORD`
- `INITIAL_ADMIN_PASSWORD`

两个初始账号密码不能相同。不要把密码作为命令行参数传给可能长期运行的进程，不要提交 `.env.production`。完成后再次执行 `chmod 600 .env.production`。

`SEED_INITIAL_USERS=true` 只用于没有历史数据库的首次部署。已有部署应保留当前值，不得为了重置密码而重新启用种子账号。初始化逻辑不会覆盖已存在用户的密码。

本地数据库目录必须位于目标主机的本地磁盘。相对路径以 `compose.production.yaml` 所在目录为基准；如果用户指定备份盘，使用绝对路径。不得把数据库目录放到 Git、网盘同步目录或多台主机同时写入的共享目录。首次部署创建目录：

默认路径使用：

```bash
mkdir -p data/mysql data/mongodb data/mongodb-config
```

如果 `.env.production` 配置的是绝对路径，改为创建实际绝对目录，不要原样使用默认命令。Atlas 模式只需创建 MySQL 目录，不创建两个 MongoDB 目录。

如果已有部署仍使用 Docker 命名卷，不得直接用空目录启动。执行 AI 必须先从仍连接旧卷的 MySQL 容器生成包含 `--single-transaction` 和 `--no-tablespaces` 的逻辑 SQL 备份，再停止 `api`、`mysql` 和 `mongodb`。MySQL 底层数据文件不得从 Linux volume 直接复制到 macOS 或 Windows bind mount，因为文件系统大小写规则可能不兼容；新目录初始化后用 SQL 恢复。MongoDB 在干净停机后可通过只读源挂载完整复制到空目录。所有来源先通过 `docker inspect` 确认，迁移后核对表/集合数量和 API 健康状态，并保留旧卷，不自动删除。MongoDB `/data/configdb` 的旧匿名卷也应检查并按需复制。

项目当前还没有正式 TypeORM migration，因此个人单机部署必须保持 `MYSQL_SYNCHRONIZE=true` 才能自动建表。若要作为面向公网的正式生产系统使用，应先补齐数据库迁移，再评估关闭自动同步，不能直接在现有指南中改成 `false`。

### MongoDB Atlas 分支

仅当用户明确指定 `MONGODB_MODE=atlas` 时启用。执行 AI 必须确认：Atlas 项目中已有集群和数据库用户，目标主机公网 IP/CIDR 已加入 IP Access List，并取得 Atlas Connect 页面生成的驱动连接串。Atlas 网页登录、Admin API 或 AI 密钥都不是数据库连接串，不能填入 `MONGODB_URI`。

将实际连接串只写入权限为 `600` 的 `.env.production`，不要在终端输出、聊天回复、Git 提交或完整 Compose 配置中展示：

```dotenv
MONGODB_URI='mongodb+srv://<database-user>:<url-encoded-password>@<cluster>.mongodb.net/wuxu?retryWrites=true&w=majority'
```

密码中的 URI 保留字符必须先 URL 编码。连接信息缺失时停止 Atlas 启动步骤，让用户直接在目标主机的 `.env.production` 中填写，不能要求用户把密码或完整连接串粘贴到聊天。

Atlas 模式下不创建或迁移本地 MongoDB 数据目录，除非用户另行要求迁移。所有生产 Compose 命令都必须在原有文件参数末尾追加：

```text
-f compose.mongodb-atlas.yaml
```

源码构建模式的文件顺序必须是 `compose.production.yaml`、`compose.source-build.yaml`、`compose.mongodb-atlas.yaml`。不得遗漏 Atlas 覆盖文件，否则会意外启动本地 MongoDB。

`PUBLIC_ORIGIN` 必须与用户实际访问的协议、主机和端口一致；修改 `WEB_PORT` 时也要同步修改本机 Origin。使用 HTTPS 域名时写成真实地址，例如 `https://inventory.example.com`，不要添加末尾斜杠。TLS 通常由服务器外层的 Caddy、Traefik、云负载均衡或反向代理负责，并将流量转发到 `WEB_PORT`。

## 第五步 校验并启动

只校验配置，不打印包含秘密的完整展开结果：

```bash
docker compose --env-file .env.production -f compose.production.yaml config --quiet
```

Atlas 模式改为：

```bash
docker compose --env-file .env.production -f compose.production.yaml -f compose.mongodb-atlas.yaml config --quiet
```

拉取并启动固定版本镜像：

```bash
docker compose --env-file .env.production -f compose.production.yaml pull
docker compose --env-file .env.production -f compose.production.yaml up -d --pull always
```

Atlas 模式的 `pull` 和 `up` 也必须追加 `-f compose.mongodb-atlas.yaml`。

不要执行 `docker compose config` 后把完整输出发到聊天，因为展开后的环境变量可能包含密钥。

## 第六步 验证部署

查看容器状态：

```bash
docker compose --env-file .env.production -f compose.production.yaml ps
```

预期结果：

- 本地模式下 `mysql`、`mongodb`、`object-storage`、`api` 显示为 `healthy`。
- Atlas 模式下 `mongodb` 不启动，`mysql`、`object-storage`、`api` 显示为 `healthy`。
- `gateway` 显示为 `running` 或 `healthy`。
- 不应出现持续重启、`unhealthy` 或 `exited`。

从部署主机通过统一入口验证，实际端口应取自 `.env.production`：

```bash
curl -fsS http://127.0.0.1:8080/api/health/ready
curl -fsS -o /dev/null http://127.0.0.1:8080/
curl -fsS -o /dev/null http://127.0.0.1:8080/admin/
curl -fsS -o /dev/null http://127.0.0.1:8080/api/docs
```

`/api/health/ready` 应返回 `status: ok`，并且 MySQL、MongoDB、对象存储均为 `up`。

使用 `.env.production` 中的初始邮箱和密码分别调用登录接口，验证普通用户与管理员账号。不要把登录响应中的 JWT 输出到聊天或日志：

```text
POST /api/auth/login
Content-Type: application/json

{"email":"<邮箱>","password":"<密码>"}
```

两个账号都登录成功后，将 `.env.production` 中的：

```dotenv
SEED_INITIAL_USERS=false
```

然后重新应用配置：

```bash
docker compose --env-file .env.production -f compose.production.yaml up -d
```

再次执行就绪检查。关闭种子功能不会删除已经创建的账号，也不会改变其密码。

## 远程源码构建模式

仅在用户指定 `DEPLOY_MODE=source`，或固定提交镜像不可用且用户希望立即部署时使用。

在 `.env.production` 中设置：

```dotenv
SOURCE_GIT_URL=https://github.com/Duex-long/wuxu-platform.git
SOURCE_GIT_REF=<完整提交 SHA>
SOURCE_IMAGE_TAG=local
SOURCE_WEB_IMAGE=wuxu/web-source
SOURCE_SERVER_IMAGE=wuxu/server-source
```

使用同一个生产 Compose 和源码构建覆盖文件：

```bash
docker compose \
  --env-file .env.production \
  -f compose.production.yaml \
  -f compose.source-build.yaml \
  config --quiet

docker compose \
  --env-file .env.production \
  -f compose.production.yaml \
  -f compose.source-build.yaml \
  up -d --build
```

该模式由 Docker BuildKit 从 `SOURCE_GIT_URL` 拉取 `SOURCE_GIT_REF`，构建 `web-runtime` 与 `api-runtime`。不要附加 `--pull always`；覆盖文件使用 `pull_policy: build`。

后续的状态、健康检查和登录验证与镜像部署相同。停止或更新时也必须同时传入两个 Compose 文件，避免操作到错误的 Compose 模型。

## 更新部署

更新前先记录当前完整提交 SHA、当前镜像标签和容器状态。已有 `.env.production` 必须保留。

```bash
git status --short
git fetch --prune origin
git pull --ff-only origin main
git rev-parse HEAD
git rev-parse --short=7 HEAD
```

确认新提交的 Web 与 Server 镜像均存在后，同时修改 `WEB_IMAGE_TAG` 和 `SERVER_IMAGE_TAG`，再执行：

```bash
docker compose --env-file .env.production -f compose.production.yaml pull
docker compose --env-file .env.production -f compose.production.yaml up -d --pull always
```

更新容器不会删除数据库宿主机目录或对象存储卷。更新后必须重新运行全部健康检查。

## 回滚

回滚时把 `WEB_IMAGE_TAG` 和 `SERVER_IMAGE_TAG` 同时改回上一个已验证的 `sha-<短 SHA>`，然后执行：

```bash
docker compose --env-file .env.production -f compose.production.yaml pull
docker compose --env-file .env.production -f compose.production.yaml up -d --pull always
```

不要为回滚删除数据库目录或数据卷。应用版本回滚不等于数据库结构回滚；如果未来引入不可逆数据库迁移，应先依据对应版本的迁移说明处理。

## 故障诊断

先执行：

```bash
docker compose --env-file .env.production -f compose.production.yaml ps
docker compose --env-file .env.production -f compose.production.yaml logs --tail=200 api
docker compose --env-file .env.production -f compose.production.yaml logs --tail=200 gateway
docker compose --env-file .env.production -f compose.production.yaml logs --tail=200 mysql mongodb object-storage
```

常见情况：

- API 一直不健康：检查数据库或对象存储是否健康、数据库目录权限、配置是否仍有占位符，以及旧数据中的密码是否与当前配置一致。
- 登录失败：初始化账号只会创建不存在的账号，不会覆盖旧账号密码。已有数据库应使用原密码。
- 页面可以打开但上传图片失败：检查 `object-storage` 与 `api` 日志；图片上限为 10MB。
- `/admin/` 返回 404：确认访问路径包含末尾斜杠，并确认运行的是 `gateway` Web 镜像。
- GHCR 拉取失败：先确认镜像标签存在以及 Package 是否公开；私有 Package 需要用户提供凭据。

## 数据安全边界

数据默认保存在：

- `MYSQL_DATA_PATH`（默认 `./data/mysql`）：账号和身份。
- `MONGODB_DATA_PATH`（默认 `./data/mongodb`）：类目、位置、物品、状态历史和图片元数据。
- `MONGODB_CONFIG_PATH`（默认 `./data/mongodb-config`）：MongoDB 本地配置数据。
- `object_production_data` Docker volume：图片文件。

上述 MongoDB 目录只适用于 `MONGODB_MODE=local`。`MONGODB_MODE=atlas` 时物品领域数据在 Atlas，执行 AI 必须确认 Atlas 备份策略或逻辑导出方案；空的本地 `data/mongodb*` 目录不是云端数据备份。MySQL 和图片数据仍按本地目录/卷保护。

以下命令禁止在有用数据的环境执行：

```bash
docker compose down -v
docker volume rm <物序数据卷>
rm -rf <数据库数据目录>
```

普通停止命令不会删除数据：

```bash
docker compose --env-file .env.production -f compose.production.yaml down
```

本地 MongoDB 模式的目录级备份必须先停止 `api`、`mysql` 和 `mongodb`，再整体复制或打包三个数据库目录；运行中的数据库文件不能直接复制。Atlas 模式不复制本地 MongoDB 目录，必须使用 Atlas 备份或逻辑导出。图片还需要单独备份 `object_production_data`。如果需要清空、迁移或恢复数据，必须先明确列出将受影响的目录、云端集群和数据卷并获得用户确认。

## 执行完成后的回复格式

部署成功后向用户报告：

1. 部署的完整 Git SHA 和镜像标签。
2. 用户端、管理后台和 Swagger 的访问地址。
3. 普通用户与管理员邮箱；若密码由 AI 生成，分别提供初始登录密码并提醒用户妥善保存。
4. `docker compose ps` 的概括结果和 API 就绪检查结果，不输出密钥或 JWT。
5. 部署目录和 `.env.production` 路径。
6. 数据库目录与对象存储卷已保留、`SEED_INITIAL_USERS` 已关闭。
7. 更新、查看日志和停止服务的常用命令。

如果部署失败，报告失败步骤、相关服务、经过脱敏的关键日志、已经完成的操作，以及下一步需要用户提供的唯一信息。不要声称部署成功。

## 可直接追加给 AI 的参数示例

仅本机访问：

```text
请严格执行本指南完成部署。使用默认目录、main、8080 端口和镜像部署模式。初始账号邮箱使用默认值，密码请安全随机生成。
```

域名部署：

```text
请严格执行本指南完成部署。
WUXU_DEPLOY_DIR=/opt/wuxu-platform
WUXU_GIT_REF=main
WEB_PORT=8080
PUBLIC_ORIGIN=https://inventory.example.com
DEPLOY_MODE=image
INITIAL_USER_EMAIL=user@example.com
INITIAL_ADMIN_EMAIL=admin@example.com
```
