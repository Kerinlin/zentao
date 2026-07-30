# 开发 & 测试使用指南（小白向）

日常就两件事：**测试提单，开发修单**。不用管需求、用例、测试单。

装好 CLI 后，在 AI 里用禅道有 **两条接入路径**，**二选一即可**（也可都装）：

| 路径 | 命令 | 适合谁 | 特点 |
|------|------|--------|------|
| **路径 A：安装技能** | `zentao add-skill` | 希望 AI 走完整 CLI 能力 | AI 按技能文档去执行 `zentao` 命令，模块更全 |
| **路径 B：MCP** | `zentao add-mcp` | **日常提单/修单（推荐）** | AI 直接调 **19 个** 固定工具，Bug 工作流更稳、参数更清晰 |

两条都是「在 Cursor / Claude 等里对话操作禅道」；差别是接入方式不同。

---

## 1. 安装 CLI（做一次）

脚本从**内网 Gitea** 拉取；会检测 Node、全局安装 `@kerin/zentao-cli`，并引导登录等。

### Windows（PowerShell）

```powershell
irm http://192.168.0.147:3000/pgiot/zentao/raw/branch/main/packages/zentao-cli/scripts/install-gitea.ps1 | iex
```

### macOS / Linux

```bash
curl -fsSL http://192.168.0.147:3000/pgiot/zentao/raw/branch/main/packages/zentao-cli/scripts/install-gitea.sh | sh
```

装完自检：

```bash
zentao profile          # 能看到当前账号就说明登录成功
```

| 现象 | 怎么办 |
|------|--------|
| `command not found` | 关掉终端重开再试；确认 npm 全局 bin 在 PATH |
| 拉脚本失败 | 确认在公司内网，能打开 `http://192.168.0.147:3000` |
| 未登录 / E1001 | 再跑 `zentao login -s 禅道地址 -u 账号 -p 密码` |

---

## 2. 装完后选一条路径

```text
安装成功（zentao 已可用、已登录）
   ├─ 路径 A：zentao add-skill  → 把「技能」装进 AI
   └─ 路径 B：zentao add-mcp    → 把 MCP 服务写进 AI（日常提单修单推荐）
```

### 路径 A：安装技能

```bash
zentao add-skill
```

按提示用方向键/空格选择 AI（Cursor、Claude Code、VS Code 等），回车确认。

装好后，在对应 AI 里用自然语言即可，例如：

- 「列出指派给我的 Bug」
- 「提一个 Bug：…」
- 「把 Bug 329 标成已解决」

AI 会按技能说明去跑底层 `zentao` 命令。需要查全量模块参数时，技能路径更合适。

> 指定 Agent：`zentao add-skill cursor`、`zentao add-skill claude-code` 等。  
> 更多说明见 [在 Agents 中使用禅道](./use-zentao-in-agents.md)。

### 路径 B：MCP（日常推荐）

**一条命令配置**，不要手写 JSON：

```bash
zentao add-mcp
```

按提示：

1. 选择 AI（↑↓ 移动，空格勾选，a 全选，回车确认；也可 `zentao add-mcp claude-code`）
2. 必须已 `zentao login`：MCP 复用本地 profile，**不在 Agent 配置写密码**
3. **重启对应 AI 客户端**

> Claude Code 写入 `~/.claude.json` 的 `mcpServers.zentao-cli`（`command: zentao` / `args: ["mcp"]`）。
完成后对话示例：

- 「列出指派给我的未解决 Bug」
- 「提个 Bug：登录失败无提示，指派给 zhangsan」
- 「Bug 329 已修，标 fixed」
- 「Bug 329 回归通过，关闭」

MCP **只暴露 19 个工具**（Bug 全套 + 账号/工作区/上传 + 产品/项目/版本/用户枚举），正好覆盖测试提单、开发修单。工具说明见下文第 3～5 节。

> 需要重配再跑一次 `zentao add-mcp` 即可。

### 怎么选（一句话）

| 你的情况 | 选 |
|----------|-----|
| 主要就是提单、查单、解决、关闭 | **`zentao add-mcp`** |
| 还想让 AI 操作更多模块 / 更依赖 CLI 命令说明 | **`zentao add-skill`** |
| 两个都想用 | 两个命令都跑一遍，不冲突 |

---

## 3. 工作区（两条路径都建议设一次）

工作区 = 记住当前**产品/项目**，之后提单、查单少填 ID。

**终端：**

```bash
zentao product --pick=id,name
zentao workspace add --product=<产品ID> --project=<项目ID> --name=主线
zentao workspace
```

**已接 MCP 时**对 AI 说：「列出产品，把某某产品设成工作区」→ `list_products` + `create_workspace`。

---

## 4. MCP 工具一览（19 个）

（选了路径 B，或两条都装时看这里。）

### 4.1 Bug 核心（最常用）

| 工具 | 干啥 | 谁常用 |
|------|------|--------|
| `list_bugs` | 查 Bug 列表 | 测试、开发 |
| `get_bug` | 看某条详情（含步骤） | 开发、测试 |
| `create_bug` | **提 Bug** | **测试** |
| `update_bug` | 改标题/指派人等（**不改状态**） | 偶尔 |
| `resolve_bug` | **解决 Bug** | **开发** |
| `close_bug` | **关闭 Bug** | **测试**（回归通过） |
| `activate_bug` | **重新打开** | **测试**（回归失败） |
| `delete_bug` | 删除（不可恢复，慎用） | 几乎不用 |

### 4.2 账号 / 工作区 / 辅助

| 工具 | 干啥 |
|------|------|
| `get_current_user` | 当前登录账号 |
| `list_profiles` / `switch_user` | 多账号列表与切换 |
| `list_workspaces` / `create_workspace` / `switch_workspace` | 工作区 |
| `upload_image` | 上传截图 → URL 写进 steps |
| `list_products` / `list_projects` / `list_builds` / `list_users` | 枚举 |

---

## 5. 测试视角（提单 + 回归）

主路径：**create → 等开发 resolve → close / activate**。

对 AI 说人话即可，例如：

> 「提个 Bug：登录页错误密码还能进首页。严重度 2，指派 zhangsan。步骤：1. 打开登录 2. 输错密码。截图 /tmp/shot.png」

| 你想… | 对 AI 说 | MCP 工具 |
|--------|----------|----------|
| 提 Bug | 「提个 Bug：…」 | `create_bug`（可先 `upload_image`） |
| 未关闭列表 | 「未关闭的 Bug」 | `list_bugs` + `status!=closed` |
| 关单 | 「329 回归通过，关闭」 | `close_bug` |
| 重开 | 「329 还能复现，打开」 | `activate_bug` |

`create_bug` 常用字段：`title`（必填）、`severity`/`pri`（1～4）、`type`（常见 `codeerror`）、`openedBuild`（默认 trunk）、`steps`、`assignedTo`（开发**登录账号**）。

---

## 6. 开发视角（接单 + 解决）

主路径：**list 指派给我的 → get 详情 → resolve**。

| 你想… | 对 AI 说 | MCP 工具 |
|--------|----------|----------|
| 我的未解决 | 「指派给我的 active Bug」 | `list_bugs` + `assignedTo` + `status=active` |
| 看步骤 | 「Bug 329 详情」 | `get_bug` |
| 修好了 | 「329 已修 fixed」 | `resolve_bug` |
| 复现不了 | 「329 标 notrepro」 | `resolve_bug` |

`resolution` 常用：`fixed` / `notrepro` / `bydesign` / `duplicate` / `external` / `postponed` / `willnotfix`。

> 关单一般归测试；开发日常只解决。

---

## 7. 协作流程

```text
测试 提单（active）
        ↓
开发 查单 → 看详情 → 改代码 → 解决（resolved）
        ↓
测试 回归
   ├─ 通过 → 关闭（closed）
   └─ 失败 → 激活（active）→ 回到开发
```

---

## 8. 常见问题

**Q：安装脚本跑不了？**  
A：确认内网可访问 `192.168.0.147:3000`；Windows 用 PowerShell。

**Q：技能和 MCP 装哪个？**  
A：只提单修单 → **`zentao add-mcp`**；要更全 CLI 能力 → **`zentao add-skill`**；可两个都装。

**Q：AI 里没有禅道能力？**  
A：确认跑过 `add-skill` 或 `add-mcp`，并**重启** AI；终端 `zentao profile` 确认已登录。

**Q：怎么卸干净？**  
A：`zentao uninstall`（先列清单再确认）。默认清 skill/MCP/补全 + `npm uninstall -g`；登录配置默认保留，彻底清加 `--purge`。

**Q：list_bugs 空、Web 上有？**  
A：核对账号、工作区/产品项目范围；filter 是本页过滤。

**Q：指派写中文名不行？**  
A：用登录账号；可让 AI 列用户。

**Q：update_bug 能解决/关闭吗？**  
A：不能。用 `resolve_bug` / `close_bug` / `activate_bug`。

---

## 9. MCP 工具对照表

| # | 工具名 | 一句话 |
|---|--------|--------|
| 1 | `list_bugs` | 查列表 |
| 2 | `get_bug` | 详情 |
| 3 | `create_bug` | 提单 |
| 4 | `update_bug` | 改字段（不改状态） |
| 5 | `delete_bug` | 删除（慎用） |
| 6 | `resolve_bug` | 开发解决 |
| 7 | `close_bug` | 测试关闭 |
| 8 | `activate_bug` | 测试重开 |
| 9 | `get_current_user` | 当前账号 |
| 10 | `list_profiles` | 本地账号列表 |
| 11 | `switch_user` | 切账号 |
| 12 | `list_workspaces` | 工作区列表 |
| 13 | `create_workspace` | 建/切工作区 |
| 14 | `switch_workspace` | 切换工作区 |
| 15 | `upload_image` | 上传截图 |
| 16 | `list_products` | 产品 |
| 17 | `list_projects` | 项目 |
| 18 | `list_builds` | 版本 |
| 19 | `list_users` | 用户 |

---

**三句话收尾**

1. 安装：内网脚本（Windows：`irm ... install-gitea.ps1 | iex`）  
2. 接入 AI：日常提单修单用 **`zentao add-mcp`**；要完整 CLI 技能用 **`zentao add-skill`**  
3. 日常：测试提单 → 开发解决 → 测试关闭/重开
