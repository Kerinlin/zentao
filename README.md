# Zentao Monorepo

禅道（ZenTao）工具集 monorepo，包含 API SDK 与 CLI 命令行工具。

## 包

| 包 | 说明 |
|---|---|
| [@kerin/zentao-api](packages/zentao-api) | ZenTao API v2 的 JS/TS SDK，支持 Node 18+ 与浏览器 |
| [@kerin/zentao-cli](packages/zentao-cli) | 禅道命令行工具，对 AI Agents 友好，可作 MCP 服务 |

## 开发环境

需要 [Bun](https://bun.sh) 1.3.13+。

```bash
bun install          # 安装依赖（workspace 自动软链）
bun run build        # 构建 api → cli
bun run build:sf     # 构建 api → cli standalone binary
bun run test         # 运行全部测试
bun run typecheck    # 全部类型检查
bun run dev <args>   # 开发模式运行 cli
```

各包的细粒度命令见 `packages/<pkg>/README.md`。

## 本地联调

cli 通过 workspace 引用 api（开发期 bun 优先解析本地包）。修改 api 源码后：

```bash
cd packages/zentao-api && bun run build       # 重建 api dist
cd ../../packages/zentao-cli && bun run dev <args>   # 立即生效
```

## 发版流程

使用 [changesets](https://github.com/changesets/changesets) 管理独立版本。

```bash
bunx changeset            # 1. 添加变更记录（选择影响的包 + 版本类型）
git add . && git commit   # 2. 提交 changeset
bunx changeset version    # 3. 更新版本号 + CHANGELOG（自动 bump 内部依赖 range）
git add . && git commit   # 4. 提交版本变更
bunx changeset publish    # 5. 发布到 npm
```

## 目录结构

```
packages/
├── zentao-api/   # @kerin/zentao-api SDK
└── zentao-cli/   # @kerin/zentao-cli CLI
```

## License

MIT
