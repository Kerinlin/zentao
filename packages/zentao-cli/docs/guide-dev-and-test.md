# 开发 & 测试使用指南（小白向）

日常就两件事：**测试提单，开发修单**。不用管需求、用例、测试单。

装好 CLI 后，在 AI 里用禅道有 **两条接入路径**，**二选一即可**（也可都装）：

| 路径 | 命令 | 适合谁 | 特点 |
|------|------|--------|------|
| **路径 A：CLI 技能** | `zentao add-skill` | 希望 AI 走完整 CLI 能力 | AI 按技能文档执行 `zentao` 命令，模块更全 |
| **路径 B：MCP** | `zentao add-mcp` | **日常提单/修单（推荐）** | AI 直接调 **19 个** 固定工具，Bug 工作流更稳 |

两条都是「在 Cursor / Claude 等里对话操作禅道」；差别是接入方式不同。

---

## 1. 一键安装（做一次）

脚本从**内网 Gitea** 拉取；会检测 Node、全局安装 `@kerin/zentao-cli`，然后进入配置向导。

### Windows（PowerShell）

```powershell
irm http://192.168.0.147:3000/pgiot/zentao/raw/branch/main/packages/zentao-cli/scripts/install-gitea.ps1 | iex
```

### macOS / Linux

```bash
curl -fsSL http://192.168.0.147:3000/pgiot/zentao/raw/branch/main/packages/zentao-cli/scripts/install-gitea.sh | sh
```

也可以装完 CLI 后手动跑向导：

```bash
zentao install
```

### 向导顺序（重要）

```text
1. 安装/跳过 CLI 包
2. 登录禅道（先登录，再谈 AI）
3. 选择 AI 接入方式：
     1) CLI 技能  (add-skill)
     2) MCP 服务  (add-mcp)   ← 日常提单修单推荐
     3) 两者都装
     4) 跳过
4. 按选择执行 add-skill / add-mcp
```

**关于「当前已登录 admin@…」**

- 那是本机 `~/.config/zentao` 里**以前保存的账号**，不是安装脚本写死的默认值。
- 若是测试账号或错误地址，在向导里选「重新登录」，或事后执行：

```bash
zentao login    # 改成真实禅道 URL / 账号
zentao profile  # 确认当前账号
```

| 现象 | 怎么办 |
|------|--------|
| `command not found` | 关掉终端重开；确认 npm 全局 bin 在 PATH |
| 拉脚本失败 | 确认在公司内网，能打开 `http://192.168.0.147:3000` |
| 未登录 / E1001 | `zentao login -s 禅道地址 -u 账号 -p 密码` |
| 向导里账号不对 | 选重新登录，或 `zentao login` / `zentao logout` 后再登 |

---

## 2. 装完后：两条路径怎么用

```text
zentao 已可用 + 已登录
   ├─ 路径 A：zentao add-skill  → 技能装进 AI
   └─ 路径 B：zentao add-mcp    → MCP 写进 AI（日常推荐）
```

> 若已在 `zentao install` 向导里选过，可跳过本节。需要改装时再单独跑命令。

### 路径 A：CLI 技能

```bash
zentao add-skill
# 或 zentao add-skill cursor / claude-code
```

↑↓ 移动，空格勾选，a 全选，回车确认。装好后在对应 AI 里说人话即可。

### 路径 B：MCP（日常推荐）

```bash
# 必须先 login（MCP 复用本地凭证，不在 Agent 配置写密码）
zentao login
zentao add-mcp
# 或 zentao add-mcp claude-code
```

1. 选择 AI（多选）
2. **重启**对应 AI 客户端

Claude Code 写入：`~/.claude.json` → `mcpServers.zentao-cli`：

```json
{
  "mcpServers": {
    "zentao-cli": {
      "command": "zentao",
      "args": ["mcp"]
    }
  }
}
```

### 怎么选

| 你的情况 | 选 |
|----------|-----|
| 主要提单、查单、解决、关闭 | **`zentao add-mcp`** |
| 还要更多模块 / 依赖 CLI 命令说明 | **`zentao add-skill`** |
| 两个都想用 | 向导选「两者都装」，或两个命令都跑一遍 |

---

## 3. 工作区（两条路径都建议设一次）

工作区 = 记住当前**产品/项目**，之后提单、查单少填 ID。

```bash
zentao product --pick=id,name
zentao project --pick=id,name
zentao workspace add --product=<产品ID> --project=<项目ID> --name=主线
zentao workspace
```

MCP 可对 AI 说：「列出产品，把某某设成工作区」→ `list_products` + `create_workspace`。

---

## 4. MCP 工具一览（19 个）

### 4.1 Bug 核心

| 工具 | 干啥 | 谁常用 |
|------|------|--------|
| `list_bugs` | 查 Bug 列表 | 测试、开发 |
| `get_bug` | 详情（含步骤） | 开发、测试 |
| `create_bug` | **提 Bug** | **测试** |
| `update_bug` | 改标题/指派人等（**不改状态**） | 偶尔 |
| `resolve_bug` | **解决** | **开发** |
| `close_bug` | **关闭** | **测试**（回归通过） |
| `activate_bug` | **重开** | **测试**（回归失败） |
| `delete_bug` | 删除（慎用） | 几乎不用 |

### 4.2 账号 / 工作区 / 辅助

| 工具 | 干啥 |
|------|------|
| `get_current_user` | 当前登录账号 |
| `list_profiles` / `switch_user` | 多账号 |
| `list_workspaces` / `create_workspace` / `switch_workspace` | 工作区 |
| `upload_image` | 截图 → URL 写进 steps |
| `list_products` / `list_projects` / `list_builds` / `list_users` | 枚举 |

### 4.3 `list_bugs` 默认与筛选（必读）

| 参数 | 默认 | 说明 |
|------|------|------|
| `browseType` | **`all`** | 服务端粗视图；字段条件请用 `filter` |
| `orderBy` | **`id_desc`** | 新→旧，避免首页全是历史 closed |
| `recPerPage` | **`1000`** | 本页尽量多取（API 上限 1000） |
| `filter` | 无 | **客户端、只滤当前页**（语法同 CLI `--filter`） |

**`filter` 写法（给 AI / 自己记）：**

| 写法 | 含义 |
|------|------|
| `status=active` | 未解决（激活中） |
| `status!=closed` | 未关闭（含 resolved） |
| `assignedTo=账号` | 指派给某人 |
| `openedBy=账号` | 某人创建 |
| `pri<=2` | 优先级 |
| `title~登录` | 标题包含 |
| `["status=active,pri<=2"]` | 单条内逗号 = **AND** |
| `["status=active","status=resolved"]` | 多条 = **OR** |

返回里会有：

- `data` / `count`：滤后列表与条数  
- `applied`：本次生效的 scope、filter、`filterGuide`  
- `pager`：**服务端滤前**分页；有 filter 时看 `count`，别只看 `pager.total`

> 项目 scope 上部分禅道实例会忽略 `browseType`；精确条件一律用 `filter`。

---

## 5. 测试视角（提单 + 回归）

主路径：**create → 等开发 resolve → close / activate**。

> 「提个 Bug：登录页错误密码还能进首页。严重度 2，指派 zhangsan。步骤：…。截图 /tmp/shot.png」

| 你想… | 对 AI 说 | MCP |
|--------|----------|-----|
| 提 Bug | 「提个 Bug：…」 | `create_bug`（可先 `upload_image`） |
| 未关闭列表 | 「未关闭的 Bug」 | `list_bugs` + `filter: ["status!=closed"]` |
| 关单 | 「329 回归通过，关闭」 | `close_bug` |
| 重开 | 「329 还能复现，打开」 | `activate_bug` |

`create_bug`：`title` 必填；`severity`/`pri` 1～4；`type` 常见 `codeerror`；`openedBuild` 默认 trunk；`assignedTo` 用开发**登录账号**。

---

## 6. 开发视角（接单 + 解决）

主路径：**list 指派给我的 → get 详情 → resolve**。

| 你想… | 对 AI 说 | MCP |
|--------|----------|-----|
| 我的未解决 | 「指派给我的 active Bug」 | `list_bugs` + `filter: ["assignedTo=<账号>","status=active"]` 或 AND 写法 |
| 看步骤 | 「Bug 329 详情」 | `get_bug` |
| 修好了 | 「329 已修 fixed」 | `resolve_bug` |
| 复现不了 | 「329 标 notrepro」 | `resolve_bug` |

`resolution` 常用：`fixed` / `notrepro` / `bydesign` / `duplicate` / `external` / `postponed` / `willnotfix`。

> 关单一般归测试；开发日常只解决。关单后 `assignedTo` 常变成字符串 `closed`，别再用账号去滤历史指派。

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
A：内网访问 `192.168.0.147:3000`；Windows 用 PowerShell。

**Q：向导里出现 admin@example / 错误地址？**  
A：那是本地旧 profile。向导里选重新登录，或 `zentao login` / `zentao logout`。

**Q：技能和 MCP 装哪个？**  
A：只提单修单 → **MCP**；要更全 CLI → **skill**；可都装。`zentao install` 会让你选。

**Q：AI 里没有禅道？**  
A：确认跑过 `add-skill` 或 `add-mcp` 并**重启** AI；`zentao profile` 确认已登录。

**Q：怎么卸干净？**  
A：`zentao uninstall`（确认后清 skill/MCP/补全 + npm 全局包）。默认保留登录配置；彻底清加 `--purge`。

**Q：list_bugs 空、Web 上有？**  
A：核对账号、工作区/产品项目；`filter` 只滤本页；确认 `orderBy=id_desc`（默认已是）；看返回 `applied` 与 `count`。

**Q：指派写中文名不行？**  
A：用登录账号；可让 AI `list_users`。

**Q：update_bug 能解决/关闭吗？**  
A：不能。用 `resolve_bug` / `close_bug` / `activate_bug`。

---

## 9. MCP 工具对照表

| # | 工具名 | 一句话 |
|---|--------|--------|
| 1 | `list_bugs` | 查列表（默认 all + id_desc + 1000；`filter` 本页筛） |
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

1. 安装：内网脚本，或 `zentao install`（**先登录 → 再选 skill / MCP**）  
2. 日常提单修单：优先 **MCP**；要完整 CLI 用 **skill**  
3. 协作：测试提单 → 开发解决 → 测试关闭/重开；查单用 `list_bugs` 的 **`filter`**，别盲信 `browseType`
