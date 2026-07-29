# Zentao Monorepo

禅道（ZenTao）工具集 monorepo，包含 API SDK 与 CLI 命令行工具。

## 包

| 包 | 说明 |
|---|---|
| [@kerin/zentao-api](packages/zentao-api) | ZenTao API v2 的 JS/TS SDK，支持 Node 18+ 与浏览器 |
| [@kerin/zentao-cli](packages/zentao-cli) | 禅道命令行工具，对 AI Agents 友好，可作 MCP 服务 |

## 环境要求

- [Bun](https://bun.sh) 1.3.13+
- Node 18+

## 开发

```bash
bun install          # 安装依赖（workspace 自动软链）
bun run build        # 构建 api → cli
bun run build:sf     # 构建 api → cli standalone binary
bun run test         # 全部测试
bun run typecheck    # 全部类型检查
bun run dev <args>   # 开发模式运行 cli
```

各包细粒度命令见 `packages/<pkg>/README.md`。

## 本地测试 cli（zentao-mode）

`zentao` 命令可在「本地源码」和「npm 发布版」之间切换，改完 cli 代码直接测，无需发版：

```bash
source scripts/zentao-mode.sh   # 加载切换命令
zentao-mode install             # 写入 ~/.zshrc 永久生效（可选，仅一次）
zentao-mode dev                 # 切本地源码模式（改代码即生效，无需 build）
zentao <args>                   # 跑本地代码
zentao-mode npm                 # 切回 npm 发布版
zentao-mode status              # 查看当前模式
```

切换即时生效。详见 `scripts/zentao-mode.sh` 顶部注释。

## 本地联调 api + cli

cli 的 `dist` 会 bundle api，改 api 源码后要让 cli 用上新代码，需重建 api 的 dist：

```bash
# 方式 A：改一次 build 一次
bun run build:api

# 方式 B：挂着自动重建（高频改 api 推荐）
bun run watch:api
```

之后重新跑 `zentao <args>` 即生效。

## 发版

### 一键发版（推荐）

交互式脚本，自动处理声明变更、版本计算、build 验证、发布、打 tag、推送：

```bash
bun run release
```

前提：代码改动已 `git commit`（工作区干净），且已 `npm login`。

### 手动 changesets

```bash
bunx changeset            # 1. 声明变更（选包 + 版本类型 + 说明）
git add . && git commit   # 2. 提交 changeset
bunx changeset version    # 3. 计算版本号 + CHANGELOG（自动 bump 内部依赖 range）
git add . && git commit   # 4. 提交版本变更
bunx changeset publish    # 5. 发布到 npm
git push --follow-tags    # 6. 推送 commit + tag
```

## 目录结构

```
packages/
├── zentao-api/          # @kerin/zentao-api SDK
└── zentao-cli/          # @kerin/zentao-cli CLI
scripts/
├── release.ts           # 一键发版脚本
└── zentao-mode.sh       # zentao 命令本地/npm 模式切换
```

## License

MIT
