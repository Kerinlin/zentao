# 开发指引

本文档面向希望为项目做贡献或了解项目结构的开发者。

## 技术栈

* 使用 Bun + TypeScript 开发，构建为 Node.js 兼容产物，通过 npm 发布，用户无需安装 Bun
* 用户配置存储：[configstore](https://github.com/sindresorhus/configstore)
* 终端开发辅助库：[commander.js](https://github.com/tj/commander.js)
* 对象嵌套属性访问：[dot-prop](https://github.com/sindresorhus/dot-prop)
* HTML 转 Markdown：[turndown](https://github.com/mixmark-io/turndown)
* [Node.js CLI 应用程序最佳实践](https://github.com/lirantal/nodejs-cli-apps-best-practices/blob/main/README_zh-Hans.md)

## 项目结构

本包位于 monorepo `packages/zentao-cli`，HTTP/模块层依赖同仓 `@kerin/zentao-api`。

```sh
packages/zentao-cli/
├── src/
│   ├── commands/           # 子命令（login、module、workspace、mcp、add-skill…）
│   ├── api/                # 对 @kerin/zentao-api 的 re-export 与 createClient
│   ├── modules/            # helper / args / executor（SDK 封装）
│   ├── auth/               # 认证与交互登录
│   ├── config/             # configstore + workspace
│   ├── mcp/                # MCP server（15 语义化 tools：register + tools/*）
│   ├── utils/              # 格式化、渲染、HTML→MD、升级检测等
│   ├── types/              # CLI 类型 + 重导 SDK 类型
│   ├── errors.ts           # CLI ZentaoError
│   └── index.ts            # 入口
├── skills/                 # 随包分发的 Agent skills（zentao-cli / zentao-tour）
├── tests/
├── bin/                    # npm 全局入口 shim
├── docs/
├── scripts/                # build / install
├── release/                # standalone 二进制产物（本地构建）
└── package.json
```

## 测试

使用 bun 的测试框架 [bun:test](https://bun.sh/docs/test) 编写测试用例。

```bash
# 运行所有测试
bun test

# 运行指定测试文件
bun test tests/executor.test.ts
```

## 构建

```bash
# 构建 npm 发布产物
bun run build

# 构建当前操作系统所属平台的单文件版本，输出到 release/
bun run build:sf

# 构建所有主流平台的单文件版本，输出到 release/
bun run build:sf -- --targets=all

# 指定目标平台和输出目录
bun run build:sf -- --targets=linux-x64,darwin-arm64 --outdir ./artifacts

# 单目标构建时指定完整输出文件
bun run build:sf -- --targets=linux-x64 --outfile ./release/zentao
```

## 更多技术文档

* [技术方案与实现细节](./implementation.md) - 详解内部接口调用规则、验证机制与持久化配置
* [常见错误排查与参考手册](./errors.md) - 使用命令遇到错误（格式：Exxxx）时进行查阅
* [后续计划](./roadmap.md) - 待实现的功能和改进计划
