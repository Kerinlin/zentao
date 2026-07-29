# AGENTDS.md

## Project Overview

zentao-cli is a CLI tool for ZenTao (禅道) project management system. It wraps ZenTao's RESTful API v2, providing command-line access to products, projects, bugs, tasks, stories, test cases, and other modules. It is also AI-agent-friendly and can run as an MCP server.

For user-facing documentation see [README.md](./README.md), [CLI 核心功能](./docs/cli-usage.md), and [docs/](./docs/).

## Commands

```bash
bun run dev            # Run in dev mode
bun run build          # Build (minified) → dist/index.js
bun run build:sf       # Build current-platform standalone binary → release/
bun run build:sf -- --targets=all  # Build mainstream standalone binaries → release/
bun test               # Run all tests
bun test tests/<file>  # Run a single test file
```

## Architecture

### Core Abstraction: zentao-api SDK

The ZenTao API layer (HTTP client, module registry, request resolution, response
extraction, data utilities, error types) lives in the external [`zentao-api`](https://github.com/easysoft/zentao-api)
package. The CLI consumes it and focuses on CLI/MCP concerns (argv parsing,
rendering, help, config/workspace, auth flow).

- `zentao-api` — `ZentaoClient`, high-level `request()`, built-in module registry
  (`getModule`/`getModuleNames`/`getModuleAction`), data utils and `ZentaoError`.
- `src/modules/helper.ts` — Thin wrappers over the SDK registry accessors plus
  action lookup helpers (`getModule`, `getAllModules`, `findAction`, `getAction`).
- `src/modules/args.ts` — Parses CLI argv/options into an SDK `request()` params object.
- `src/modules/executor.ts` — Calls SDK `request()` (autoFill/throwOnFail), then
  applies CLI-side HTML→Markdown and client filter/search/sort/limit/pick.
- `src/errors.ts` — CLI `ZentaoError`/`formatError` plus `mapSdkError` to map SDK
  errors (string codes) to CLI E-codes (Chinese messages).
- `src/api/index.ts` — Re-exports the SDK `ZentaoClient` and adds `createClient`
  (positional-arg wrapper) and `getServerConfig` helper.

### Key Source Layout

```
src/
├── index.ts               # CLI entry (Commander)
├── errors.ts              # CLI ZentaoError codes + mapSdkError
├── commands/              # Subcommand registrations & handlers
│   ├── register-modules.ts  # Dynamic module→subcommand mapping
│   ├── module-handler.ts    # Execute module commands & render output
│   └── ...                  # login, config, mcp, crud, etc.
├── api/index.ts           # SDK ZentaoClient re-export + createClient/getServerConfig
├── modules/               # SDK wrappers: helper, args, executor
├── auth/                  # Login flow & credential prompting
├── config/                # Persistent config (configstore) & workspace state
├── mcp/                   # MCP server (tools + lifecycle)
├── types/                 # Shared TS types (re-export SDK types + CLI config/commands)
└── utils/                 # Formatting, rendering, data processing, HTML→MD, etc.
```

## Testing

- **Framework**: Bun's built-in test runner (`bun test`).
- **Test files**: `tests/*.test.ts` — naming convention `<subject>.test.ts`.
- **Helpers**: `tests/helpers.ts`.
- **Integration tests**: Require `.env.test` with `ZENTAO_URL`, `ZENTAO_ACCOUNT`, `ZENTAO_PASSWORD`.

## Build & Distribution

- `bin/zentao.js` — npm global install entry shim → `dist/index.js`.
- `bun run build:sf` — standalone binary for the current platform, output to `release/`.
- `bun run build:sf -- --targets=all` — standalone binaries for mainstream macOS/Linux/Windows targets.
- `bun run build:sf -- --targets=linux-x64,darwin-arm64 --outdir ./artifacts` — custom target list and output directory.
- Published to npm as `zentao-cli`; `files` includes `bin/`, `dist/`, `skills/`.

## Release

To prepare a new release (bump version, update CHANGES.md, tag), follow the steps in [.claude/commands/release.md](./.claude/commands/release.md).

## Code Conventions

- **Runtime**: Bun (not Node.js). TypeScript, ESNext target, bundler module resolution.
- **Language**: Code and comments in English; user-facing CLI strings in Chinese (简体中文).
- **Error handling**: All domain errors use `ZentaoError` with structured codes from `src/errors.ts`. Never throw raw strings.
- **Imports**: Use `.js` extension in import paths (ESM): `import { foo } from './bar.js'`.
- **Module definitions**: Provided by `zentao-api`. To add/override a module or action at runtime, use the SDK's `defineModules`/`defineModuleActions`/`extendModuleAction`.
- **Commit messages**: Must be in English. First line uses `*`/`+`/`-` prefix, no emoji. `*` = change; `+` = addition; `-` = removal.
- **Config file env var**: `ZENTAO_CONFIG_FILE` — custom config file path (alternative to `--config` flag).

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **zentao-cli** (1483 symbols, 2147 relationships, 62 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/zentao-cli/context` | Codebase overview, check index freshness |
| `gitnexus://repo/zentao-cli/clusters` | All functional areas |
| `gitnexus://repo/zentao-cli/processes` | All execution flows |
| `gitnexus://repo/zentao-cli/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
