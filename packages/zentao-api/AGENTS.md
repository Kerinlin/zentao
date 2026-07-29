# AGENTS.md

## Project Overview

`zentao-api` — JS/TS SDK for ZenTao (禅道) API v2. Targets Node 18+ and browsers (bundler / CDN).

## Commands

Package manager: **Bun only** (`bun install`). Do not use npm, pnpm, or yarn in this repo.

```sh
bun test                  # Unit tests (Bun runner)
bun run test:real         # Integration tests (needs env config, see README)
bun run test:coverage     # Tests with coverage
bun run typecheck         # Type-check src
bun run typecheck:tests   # Type-check tests
bun run build             # Clean → tsc → browser bundle
bun run check             # Full CI: test + typecheck + registry + build + smoke
bun run registry:check    # Verify generated registry is current
bun run docs:generate     # Regenerate docs/reference (typedoc) + docs/zentao-api
bun run docs:dev          # Generate + serve VitePress site locally
bun run docs:build        # Generate + build static site to docs/.vitepress/dist
```

Single file: `bun test tests/client.test.ts`

## Architecture

- **ZentaoClient** (`src/client/`) — HTTP client; token injection, TLS, timeout, URL construction (`/api.php/v2`), `get/post/put/delete/login`, static `init()` singleton.
- **request()** (`src/request/`) — High-level module requests using `"module"`, `"module/action"` (e.g. `"bug/list"`), or `"module/<objectID>"` shortcuts; resolves via registry, assembles path/query/body, normalizes into `ResponseData` with pagination.
- **Module Registry** (`src/modules/`) — All ZenTao modules/actions with path templates, params, body schemas. Split by responsibility behind the `registry.ts` barrel:
  - `generated.ts` — **auto-generated** from `data/zentao-openapi.json`, do not edit manually.
  - `registry-store.ts` — shared runtime state plus clone/freeze/merge/validate primitives (internal).
  - `define.ts` — write APIs: `defineModules`, `defineModuleActions`, `extendModuleAction`, `resetModuleDefinitions`.
  - `query.ts` — read APIs: `getModule`, `getModuleAction`, `getModuleNames`, `isModuleName`.
  - `override.ts` — **builtin overrides** (`applyBuiltinOverrides`): hand-maintained patches over `generated.ts` that ship with the SDK. Applied once on load and re-applied after `resetModuleDefinitions` via the store's post-reset hook. Add a fix here only when the OpenAPI generation flow can't express it; otherwise prefer updating the spec.
- **Module Resolution** (`src/modules/resolve.ts`) — Path template substitution, scope inference (product > project > execution), query/body assembly.
- **Profiles** (`src/profiles/`) — Persistent profiles at `~/.config/zentao/zentao.json` (Node) / `localStorage` (browser). Keyed by `account@server`.
- **Errors** (`src/misc/errors.ts`) — `ZentaoError` with stable codes and placeholder messages.
- **Global Options** (`src/misc/global-options.ts`) — Process-level defaults (client, recPerPage, limit, timeout).
- **Environment** (`src/misc/environment.ts`) — Runtime detection, insecure TLS toggle (Node only).
- **Types** (`src/types/`) — All public TS interfaces.

## Code Generation

`src/modules/generated.ts` is produced by `scripts/update-registry.ts` from `data/zentao-openapi.json`. After updating the OpenAPI spec run `bun run scripts/update-registry.ts`. CI `check` verifies it's current.

## Browser Build

`scripts/build-browser.ts` builds the IIFE bundle from `src/browser-global.ts` → `dist/browser/zentao-api.global.js`, exposing `window.ZentaoAPI`. The `./browser` ESM subpath (`src/browser.ts`) re-exports the main entry and does **not** inject globals.

## Documentation Site

VitePress site under `docs/`, three sections:

- `docs/guide/` — hand-written guide pages, edit manually.
- `docs/reference/` — **auto-generated** by `typedoc` from `src/` TSDoc (`bun run docs:reference`). Do not edit by hand.
- `docs/zentao-api/` — **auto-generated** by `scripts/generate-zentao-api-docs.ts` from the module registry (`bun run docs:zentao-api`). Do not edit by hand.

Workflow: update source TSDoc / registry / guide, then run `bun run docs:generate` to refresh. Use `bun run docs:dev` for local preview and `bun run docs:build` to build the static site.

## Testing

Unit tests use `bun:test` with `Bun.serve()` mock HTTP servers. Real-env tests (`bun run test:real`) require a running ZenTao instance configured via `env.local` / `.env.local` (see README). Real tests are excluded from default `bun test`.

## Commit Convention

English, prefix format: `*|+|- <type>: <message>` (`*` change, `+` add, `-` remove). No emoji.



<!-- gitnexus:start -->
# GitNexus — Code Intelligence

本包属于 **zentao** monorepo。GitNexus 索引建在**仓根**，项目名 **`zentao`**（约 3757 symbols / 5528 relationships / 155 flows），含 api ↔ cli 跨包调用。查询、impact、rename **统一用 `zentao`**；**禁止**用已废弃单包名 `zentao-api` / `zentao-cli`。

> Index stale：在**仓根**执行 `npx gitnexus analyze`（不要在 `packages/*` 下单独 analyze）。

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level). 改 api 符号时要追到 cli 受影响调用点。
- **MUST run `gitnexus_detect_changes()` before committing** to verify changes only affect expected symbols and execution flows.
- **MUST warn** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- Prefer `gitnexus_query({query: "concept"})` / `gitnexus_context({name: "symbolName"})` over blind grepping for architecture and call-graph questions.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename`.
- NEVER commit without `gitnexus_detect_changes()`.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/zentao/context` | Codebase overview, index freshness |
| `gitnexus://repo/zentao/clusters` | Functional areas |
| `gitnexus://repo/zentao/processes` | Execution flows（跨 api/cli） |
| `gitnexus://repo/zentao/process/{name}` | Step-by-step trace |

## Skills

相对本包或仓根均可：`.claude/skills/gitnexus/<skill>/SKILL.md`（exploring / impact-analysis / debugging / refactoring / guide / cli）。完整约定见仓根 `AGENTS.md`。
<!-- gitnexus:end -->

