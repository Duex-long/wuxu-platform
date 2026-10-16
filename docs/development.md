# 本地开发环境

物序的开发环境以 Docker Image 为唯一运行基线，避免依赖宿主机的 Node、pnpm、MySQL 或 MongoDB 版本。

## 固定版本

| 组件 | 版本 |
| --- | --- |
| Node.js | `22.20.0-bookworm-slim` |
| pnpm | `10.18.3` |
| MySQL | `8.4.6` |
| MongoDB | `8.0.14` |
| SeaweedFS S3 | `3.94` |

SeaweedFS 仅作为本地 S3 兼容对象存储。业务代码只依赖 S3 协议，后续可以替换为 MinIO 或云对象存储。

## 启动

```bash
cp .env.example .env
mkdir -p data/mysql data/mongodb data/mongodb-config
docker compose up --build
```

MySQL 与 MongoDB 默认直接写入仓库旁的 `data/` 目录，便于查看、整体备份和迁移；该目录已被 Git 忽略。可以在 `.env` 中通过 `MYSQL_DATA_PATH`、`MONGODB_DATA_PATH` 和 `MONGODB_CONFIG_PATH` 改为其他本地绝对路径。

需要在开发环境连接 MongoDB Atlas 时，将 Atlas 驱动连接串写入未跟踪的 `.env` 的 `MONGODB_URI`，并运行：

```bash
docker compose -f compose.yaml -f compose.mongodb-atlas.yaml up --build
```

Atlas 模式要求 Docker Compose `2.24.4+`，不会启动本地 `mongodb` 服务。部署机网络必须在 Atlas IP Access List 中，连接串必须使用 Atlas 数据库用户；控制台/API/AI 密钥不能代替数据库连接串。

启动完成后：

- 用户端：http://localhost:5173
- 管理后台：http://localhost:5174
- API：http://localhost:3100/api
- OpenAPI：http://localhost:3100/api/docs
- SeaweedFS 控制页：http://localhost:9333

首次使用时先以管理员身份进入管理后台创建大类目和小类目，并按需创建全局位置；普通用户也可在用户端创建仅自己可见的个人位置。登记物品时只能选择全局位置或本人的个人位置。图片限制为 JPEG、PNG、WebP 或 GIF，单张不超过 10MB，每件物品最多选择 8 张；服务端会按文件内容签名重新识别类型。

全局位置由管理员在管理后台创建，个人位置由普通用户在 `/locations/new` 创建；两者都必须上传照片。用户端可在 `/locations/search` 搜索可见位置。物品表单仍不允许输入任意位置，只能选择已有的全局位置或本人个人位置；点击位置卡片可以筛选其中的个人物品。

用户端首页是功能入口，查找/新增物品分别位于 `/items/search` 与 `/items/new`，查找/新增位置分别位于 `/locations/search` 与 `/locations/new`，桌面端和移动端共用响应式界面。

开发账号默认由 `.env` 配置创建：

- 普通用户：`user@wuxu.local`
- 管理员：`admin@wuxu.local`

默认密码仅用于本地开发，不允许用于测试或生产环境。

## 常用命令

```bash
docker compose ps
docker compose logs -f api
docker compose exec api pnpm typecheck
docker build --target verification -f Dockerfile.dev .
docker compose down
```

Node、pnpm、依赖和构建配置均封装在固定开发镜像中，不读取宿主机的 `node_modules`。需要自动同步源码并热更新时运行：

```bash
docker compose watch
```

修改 `package.json`、锁文件或构建配置后，需要重新执行 `docker compose build`。

`verification` 阶段会在 Node 22.20.0 与 pnpm 10.18.3 环境中编译共享包、API 和两个 Web 应用，可用于本地提交前或 CI 校验；不要求宿主机安装兼容版本的 Node.js。

`docker compose down` 不会删除宿主机的数据库目录。以下命令只应在明确要删除对象存储卷时执行：

```bash
docker compose down -v
```

该命令会删除 Compose 创建的对象存储卷，但不会删除 `data/` 下的 MySQL 与 MongoDB 文件；数据库目录需要单独、明确地备份或清理。
