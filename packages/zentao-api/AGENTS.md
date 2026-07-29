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

`scripts/build-browser.ts` → UMD bundle exposing `window.ZentaoAPI`. Entry: `src/browser.ts` → `src/misc/browser-global.ts`.

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

This project is indexed by GitNexus as **zentao-api** (2227 symbols, 3368 relationships, 106 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

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
| `gitnexus://repo/zentao-api/context` | Codebase overview, check index freshness |
| `gitnexus://repo/zentao-api/clusters` | All functional areas |
| `gitnexus://repo/zentao-api/processes` | All execution flows |
| `gitnexus://repo/zentao-api/process/{name}` | Step-by-step execution trace |

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
