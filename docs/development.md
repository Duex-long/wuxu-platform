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
docker compose up --build
```

启动完成后：

- 用户端：http://localhost:5173
- 管理后台：http://localhost:5174
- API：http://localhost:3100/api
- OpenAPI：http://localhost:3100/api/docs
- SeaweedFS 控制页：http://localhost:9333

首次使用时先以管理员身份进入管理后台，创建大类目、小类目和存放位置；普通用户只能选择这些受控数据，再登记物品。图片限制为 JPEG、PNG、WebP 或 GIF，单张不超过 10MB，每件物品最多选择 8 张；服务端会按文件内容签名重新识别类型。

存放位置需要先由管理员在管理后台创建并上传照片。用户端只展示位置下拉选项，不允许输入自定义位置；点击位置卡片可以筛选并查看该位置中的个人物品。

用户端首页是功能入口，查找物品和新增物品分别位于 `/items/search` 与 `/items/new`，桌面端和移动端共用响应式界面。

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

需要同时清除本地数据库和对象文件时才执行：

```bash
docker compose down -v
```

该命令会删除 Compose 创建的全部开发数据卷。
