# AGENTS.md

## Project Overview

`@kerin/zentao-cli` is a CLI tool for ZenTao (禅道) project management. It wraps ZenTao RESTful API v2 via the monorepo sibling package `@kerin/zentao-api`, providing command-line access to products, projects, bugs, tasks, stories, test cases, and other modules. It is AI-agent-friendly and can run as an MCP server.

For user-facing documentation see [README.md](./README.md), [CLI 核心功能](./docs/cli-usage.md), and [docs/](./docs/).

## Commands

Package manager: **Bun only** (install at monorepo root with `bun install`).

```bash
bun run dev            # Run in dev mode (src/index.ts)
bun run build          # Build (minified) → dist/index.js
bun run build:sf       # Standalone binary for current platform → release/
bun run build:sf:all   # Standalone binaries for mainstream targets → release/
bun run typecheck      # tsc --noEmit
bun test               # All tests
bun test tests/<file>  # Single test file
```

**Note:** CLI bundles `@kerin/zentao-api` from its published entry (`dist/index.js`). After changing api source, rebuild api first (`bun run build` at monorepo root, or `cd ../zentao-api && bun run build`) before expecting CLI to pick up api changes.

## Architecture

### Core Abstraction: `@kerin/zentao-api` SDK

HTTP client, module registry, request resolution, response extraction, data utilities, and SDK `ZentaoError` live in [`@kerin/zentao-api`](../zentao-api) (same monorepo: `packages/zentao-api`). The CLI focuses on CLI/MCP concerns (argv, rendering, help, config/workspace, auth flow).

- `@kerin/zentao-api` — `ZentaoClient`, high-level `request()`, module registry, data utils, SDK errors.
- `src/modules/helper.ts` — Thin wrappers over SDK registry accessors (`getModule`, `getAllModules`, `findAction`, `getAction`).
- `src/modules/args.ts` — Parses CLI argv/options into SDK `request()` params.
- `src/modules/executor.ts` — Calls SDK `request()` (autoFill/throwOnFail), then CLI-side HTML→Markdown and client filter/search/sort/limit/pick.
- `src/errors.ts` — CLI `ZentaoError` / `formatError` plus `mapSdkError` (SDK string codes → CLI E-codes with Chinese messages).
- `src/api/index.ts` — Re-exports SDK `ZentaoClient`; adds `createClient` and `getServerConfig`.

### Key Source Layout

```
src/
├── index.ts                 # CLI entry (Commander)
├── errors.ts                # CLI ZentaoError codes + mapSdkError
├── commands/                # Subcommand registrations & handlers
│   ├── register-modules.ts  # Dynamic module → subcommand mapping
│   ├── module-handler.ts    # Execute module commands & render
│   ├── workspace.ts         # workspace / ls / set / set --product|project|execution
│   ├── autocomplete.ts      # bash/zsh/fish completion scripts
│   ├── add-skill.ts         # Install skills into AI agents
│   ├── add-mcp.ts           # Write MCP config into AI agents
│   ├── mcp.ts / upgrade.ts / upload.ts / ...
│   └── ...
├── api/index.ts             # SDK re-export + createClient
├── modules/                 # helper, args, executor
├── auth/                    # Login flow & credential prompting
├── config/                  # configstore + workspace state / workspace-sync (API 建区 + autoSet)
├── mcp/                     # MCP server: curated 15 tools (register + tools/*)
├── types/                   # CLI types + re-export SDK types
└── utils/                   # format, render, HTML→MD, update-notifier, ...
```

Bundled agent skills ship under `skills/` (`zentao-cli`, `zentao-tour`) and are included in the npm package `files`.

## Testing

- **Framework**: Bun built-in runner (`bun test`).
- **Test files**: `tests/*.test.ts`.
- **Helpers**: `tests/helpers.ts`.
- **Integration / real env**: use env vars such as `ZENTAO_URL`, `ZENTAO_ACCOUNT`, `ZENTAO_PASSWORD` (see package tests and monorepo docs). Default unit tests do not require a live server.

## Build & Distribution

- `bin/zentao.js` — npm global install entry shim → `dist/index.js`.
- `bun run build:sf` — current-platform standalone binary → `release/`.
- `bun run build:sf:all` or `bun run build:sf -- --targets=all` — mainstream macOS/Linux/Windows binaries.
- Published to npm as **`@kerin/zentao-cli`**; `files` includes `bin/`, `dist/`, `skills/`.

## Release

Monorepo uses changesets at the repo root (`bun run release` / `bunx changeset`). Package-local notes may still exist under `.claude/commands/release.md`; prefer root release flow for version bumps that touch both packages.

## Code Conventions

- **Runtime**: Bun (build targets Node-compatible dist). TypeScript, ESNext, bundler module resolution.
- **Language**: Code and comments in English; user-facing CLI strings in Chinese (简体中文).
- **Error handling**: Domain errors use CLI `ZentaoError` with codes from `src/errors.ts`. Never throw raw strings.
- **Imports**: `.js` extension in import paths (ESM).
- **Module definitions**: Owned by `@kerin/zentao-api`. Runtime add/override via SDK `defineModules` / `defineModuleActions` / `extendModuleAction`.
- **Commit messages**: English. First line `*` / `+` / `-` prefix, no emoji.
- **Config path**: default `~/.config/zentao/zentao.json`; override with `--config` or `ZENTAO_CONFIG_FILE`.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

本包属于 **zentao** monorepo。GitNexus 索引建在**仓根**，项目名 **`zentao`**（约 3757 symbols / 5528 relationships / 155 flows），含 cli → api 跨包调用。查询、impact、rename **统一用 `zentao`**；**禁止**用已废弃单包名 `zentao-cli` / `zentao-api`。

> Index stale：在**仓根**执行 `npx gitnexus analyze`（不要在 `packages/*` 下单独 analyze）。

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius. CLI 改动可能影响 MCP tools / module-handler 链路。
- **MUST run `gitnexus_detect_changes()` before committing**.
- **MUST warn** if impact analysis returns HIGH or CRITICAL risk before edits.
- Prefer `gitnexus_query` / `gitnexus_context` over blind grepping for call-graph questions.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact`.
- NEVER ignore HIGH or CRITICAL risk warnings.
- NEVER rename with find-and-replace — use `gitnexus_rename`.
- NEVER commit without `gitnexus_detect_changes()`.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/zentao/context` | Overview, index freshness |
| `gitnexus://repo/zentao/clusters` | Functional areas |
| `gitnexus://repo/zentao/processes` | Execution flows（跨 api/cli） |
| `gitnexus://repo/zentao/process/{name}` | Step-by-step trace |

## Skills

`.claude/skills/gitnexus/<skill>/SKILL.md`（exploring / impact-analysis / debugging / refactoring / guide / cli）。完整约定见仓根 `AGENTS.md`。
<!-- gitnexus:end -->
