# 仓库管理策略

## 事实来源

`wuxu-platform` 是唯一事实来源。用户端、管理后台和 API 的功能分支、代码评审和版本标签均在主仓库完成。

## 拆分仓库

三个组件仓库仅接收主仓库对应目录的同步结果：

- `apps/user-web` → `wuxu-user-web`
- `apps/admin-web` → `wuxu-admin-web`
- `apps/api` → `wuxu-api`

拆分仓库不得直接合并功能修改，以避免同一代码存在多个修改来源。

## 分支约定

- `main`：稳定主分支。
- `feature/<name>`：功能开发。
- `fix/<name>`：缺陷修复。
- `chore/<name>`：工程与维护工作。

## 后续自动化

待组件工程生成后，通过 GitHub Actions 和专用凭证将三个目录拆分到对应仓库。同步任务只在主仓库 `main` 更新后运行。

