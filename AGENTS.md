# AGENTS.md

## Project Overview

本仓是禅道（ZenTao）工具集 monorepo，使用 bun workspaces 管理，changesets 控制独立版本发版。包含两个包：

- `packages/zentao-api` — `@kerin/zentao-api`，ZenTao API v2 的 JS/TS SDK（Node 18+ 与浏览器）。架构与命令详见 `packages/zentao-api/AGENTS.md`。
- `packages/zentao-cli` — `@kerin/zentao-cli`，禅道 CLI，AI Agents 友好，可作 MCP 服务。架构与命令详见 `packages/zentao-cli/AGENTS.md`。

## Commands

包管理器：**仅 Bun**（`bun install`），不要使用 npm/pnpm/yarn。

```bash
bun install
bun run build          # api build → cli build（顺序：cli bundle 依赖 api dist）
bun run build:sf       # api build → cli standalone binary
bun run test           # 全部测试（api + cli）
bun run typecheck      # 全部类型检查
bun run dev <args>     # 开发模式运行 cli
```

各包细粒度命令进入 `packages/<pkg>` 目录运行（例如 `cd packages/zentao-api && bun run check`）。

## Architecture

- cli 通过 workspace 引用 api。开发期 bun 在版本 range 满足时优先解析本地包；**改 api 源码后需 `bun run build` 重建 api dist，cli 才能消费**（api 入口是 `dist/index.js`）。
- 根 `tsconfig.base.json` 共享严格性选项，各包 extends 并覆盖 `target`/`module`/`moduleResolution`（api 用 NodeNext，cli 用 bundler）。
- 发版用 changesets，独立版本；内部依赖声明为 semver range（非 `workspace:*`），`changeset version` 会自动 bump。

## Code Conventions

- Runtime: Bun。TypeScript，ESM，import 路径带 `.js` 后缀。
- 代码与注释用英文；用户可见 CLI 字符串用中文（简体）。
- 领域错误统一用 `ZentaoError`（结构化 code），禁止裸字符串抛出。
- Commit message 英文，首行 `*`/`+`/`-` 前缀（`*` 改动 / `+` 新增 / `-` 移除），无 emoji。
- 模块定义在 `zentao-api`；运行时扩展用 SDK 的 `defineModules`/`defineModuleActions`/`extendModuleAction`。
- 各包深度信息（模块注册表、MCP tools、browser build 等）阅读对应 `packages/<pkg>/AGENTS.md`。
