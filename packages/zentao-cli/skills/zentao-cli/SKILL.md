---
name: zentao-cli
description: 通过 zentao 命令行工具查询和操作禅道（ZenTao）数据，覆盖项目集、产品、项目、执行、需求、Bug、任务、测试用例、测试单、产品计划、版本、发布、反馈、工单、应用、用户、附件等模块的增删改查及状态流转。当用户提到禅道、zentao、查询项目进展、获取 Bug 列表、创建任务、更新需求状态等项目管理操作时使用本技能。
license: MIT
metadata:
  author: Kerinlin <createbugforyou@gmail.com>
  repository: https://github.com/Kerinlin/zentao.git
  keywords: [zentao, 禅道, cli, project-management]
  version: 1.3.1
---

# 禅道 CLI

通过 `zentao` 命令行工具查询和操作禅道数据。CLI 自动处理认证、分页，支持工作区上下文和数据过滤/排序。

## 前置准备

### 安装

```bash
npm install -g @kerin/zentao-cli
# 或 bun install -g @kerin/zentao-cli
# 或 pnpm install -g @kerin/zentao-cli
# 或免安装运行：npx @kerin/zentao-cli
```

如果用户没有安装，引导用户进行全局安装使用，如果系统存在 bun 或 pnpm 则优先使用 bun 或 pnpm 进行全局安装。

也可一键安装/配置（检测环境 → 安装 → 登录 → 安装技能）：

```bash
zentao install
```

升级已安装的 CLI：

```bash
zentao upgrade
```

### 认证

首次执行任意 `zentao` 命令会自动提示登录。也可显式登录：

```bash
zentao login -s https://zentao.example.com -u admin -p 123456
```

环境变量（优先级低于命令行参数）：

| 变量 | 说明 |
|------|------|
| `ZENTAO_URL` | 禅道服务地址 |
| `ZENTAO_ACCOUNT` | 用户账号 |
| `ZENTAO_PASSWORD` | 密码 |
| `ZENTAO_TOKEN` | 直接指定 Token（有此变量可省略密码） |
| `ZENTAO_CONFIG_FILE` | 自定义配置文件路径（等同 `--config`） |

登录成功后凭证缓存在 `~/.config/zentao/zentao.json`，后续无需重复登录。

### 凭证安全

- 用户尚未登录时，不要在对话里收集账号密码。让用户直接在终端执行 `zentao login`，或执行任意 `zentao` 命令触发首次自动登录提示，由用户自行输入凭证。
- 严禁读取本地凭证：`ZENTAO_PASSWORD` / `ZENTAO_TOKEN` 环境变量、`~/.config/zentao/zentao.json` 配置文件。所有禅道数据均通过 `zentao` 命令获取，凭证由 CLI 内部处理。

### 安装技能与 MCP

```bash
zentao add-skill              # 安装本技能到常见 AI Agent 目录
zentao add-skill claude-code  # 指定 Agent（claude-code / cursor / codex 等）
zentao add-mcp                # 配置禅道 MCP 到 AI Agent
zentao mcp                    # 以 stdio 启动 MCP 服务
```

MCP（`zentao mcp`）**仅暴露语义化 tool（当前 19 个）**，不再全量注册各模块：

- Bug：`list_bugs`（默认 browseType=all、orderBy=id_desc、recPerPage=1000；`filter` 字段筛选，见 tool schema / 返回 `applied.filterGuide`）/ `get_bug` / `create_bug` / `update_bug` / `delete_bug` / `resolve_bug` / `close_bug` / `activate_bug`
- 账号：`get_current_user` / `list_profiles` / `switch_user`
- 工作区：`list_workspaces` / `create_workspace` / `switch_workspace`
- 上传：`upload_image`
- 枚举：`list_products` / `list_projects` / `list_builds` / `list_users`

完整模块 CRUD 仍走本技能的 CLI 命令。旧名 `zentao_bug`、`zentao_profile`、`zentao_switch_profile` 已移除。

## 命令格式

使用简写方式（推荐）：

| 操作 | 命令 |
|------|------|
| 列表 | `zentao <module>` |
| 详情 | `zentao <module> <id>` |
| 创建 | `zentao <module> create --field=value` |
| 更新 | `zentao <module> update <id> --field=value` |
| 删除 | `zentao <module> delete <id>` |
| 动作 | `zentao <module> <action> <id>` |
| 帮助 | `zentao <module> help` |

也支持 `--data='JSON'` 传入 JSON 数据。

全局常用选项：`--format=markdown|json|raw`、`--silent`、`--insecure`（跳过 TLS 校验）、`--timeout=<ms>`、`--config=<path>`、`--machine-readable`。

## 模块与操作速查

| 模块名 | 中文 | 支持的操作 |
|--------|------|-----------|
| program | 项目集 | CRUD |
| product | 产品 | CRUD |
| project | 项目 | CRUD |
| execution | 执行/迭代 | CRUD |
| story | 需求 | CRUD + activate / change / close |
| epic | 业务需求 | CRUD + activate / change / close |
| requirement | 用户需求 | CRUD + activate / change / close |
| bug | Bug | CRUD + activate / close / resolve |
| task | 任务 | CRUD + activate / close / finish / start |
| testcase | 测试用例 | CRUD |
| testtask | 测试单 | CUD（按产品/项目/执行查列表） |
| productplan | 产品计划 | CUD（按产品查列表） |
| build | 版本 | CUD（按项目/执行查列表） |
| release | 发布 | CUD（按产品查列表） |
| feedback | 反馈 | CRUD + activate / close |
| ticket | 工单 | CRUD + activate / close |
| system | 应用 | CU（按产品查列表） |
| user | 用户 | CRUD |
| file | 附件 | 编辑名称 + 删除 |

### 图片上传（富文本图床）

```bash
zentao upload ./screenshot.png              # 返回相对 URL，可写入 steps
zentao upload ./a.png ./b.jpg --absolute    # 多文件；输出绝对 URL
zentao upload ./shot.png --format=json
```

> 这是编辑器图床上传（`file-ajaxUpload`），不是 `file` 模块的业务对象附件。

### 用 Markdown 写 steps（推荐）

人写 Markdown 文件，CLI 转成禅道轻量 HTML 写入 `steps`：

```bash
zentao upload ./shot.png
# 编辑 sos.md（见下方模板），图片用上传返回的 URL：
# ![截图](/zentao/file-read-XXXX.png)

# 已配置工作区时可不传 --product / --project
zentao bug create --title="Bug标题" --openedBuild=trunk \
  --type=codeerror --steps-file=./sos.md

# 未配置工作区时显式传产品（--product 与 --productID 等价）
zentao bug create --product=1 --title="Bug标题" --openedBuild=trunk \
  --type=codeerror --steps-file=./sos.md
```

**分流规则（重要）**

| 传法 | 行为 |
|------|------|
| `--steps-file=path.md` | 读文件 → Markdown 转轻量 HTML → `steps` |
| `--steps=...` | **原样透传**（兼容旧用法；不走 MD 转换） |
| `--data` 中的 `steps` | **原样透传** |
| 同时传 `--steps` 与 `--steps-file` | 报错 E2009 |

**Markdown 子集**：`#`/`##` 标题、段落、有序/无序列表、`**加粗**`、`` `code` ``、`![alt](url)`（url 须为已上传地址，不自动 upload 本地路径）。

**模板示例（sos.md）**

```markdown
## 问题描述
...

## 重现步骤
1. ...
2. ...

## 实际结果
...

## 期望结果
...

![说明](/zentao/file-read-XXXX.png)
```

> 多行 steps 请用 `--steps-file`，不要依赖多行 `--steps=`（shell/CLI 对多行 `--key=value` 不友好）。

> CRUD = 列表 + 详情 + 创建 + 更新 + 删除；CUD = 无独立列表接口，需指定所属范围

### 列表范围参数

部分模块的列表需要指定所属范围：

```bash
zentao story --product=1                # 产品 #1 的需求
zentao bug --product=1                  # 产品 #1 的 Bug
zentao task --execution=1               # 执行 #1 的任务
zentao execution --project=5            # 项目 #5 的执行
zentao build --project=5                # 项目 #5 的版本
zentao testtask --product=1             # 产品 #1 的测试单
zentao release --product=1              # 产品 #1 的发布
zentao productplan --product=1          # 产品 #1 的计划
zentao feedback --product=1             # 产品 #1 的反馈
zentao ticket --product=1               # 产品 #1 的工单
```

设置工作区后可省略这些参数（见下方工作区章节）。**create 同样可省略**（≥1.3.1）。

### 范围字段别名（product / productID）

OpenAPI / `zentao bug create help` 常显示 `productID` 为必填；CLI 与工作区注入使用短名 `product`。自 **1.3.1** 起 SDK 会：

1. **互为别名**：`--product=189` 与 `--productID=189` 等价（`project`/`execution` 同理）
2. **请求体双写**：同时下发短名与 `*ID`，禅道 PHP 读 `product`，schema 校验认 `productID`
3. **工作区注入双写**：注入时同时写 `product` + `productID`（及 project/execution）

**推荐**：日常用短名 `--product` / `--project` / `--execution`；help 里写 `productID` 时不要改成只传 `productID` 而忽略短名——两者都行。

| 写法 | 结果（≥1.3.1） |
|------|----------------|
| 工作区已设 product+project，create 不传 scope | 自动注入，归属正确 |
| `--product=189` | 正确 |
| `--productID=189` | 正确（会双写 `product`） |
| 仅旧版只认 schema、只发 `productID` 且无双写 | 可能落到错误默认产品（1.3.0 及更早问题，已修） |

### 工作区

工作区保存当前「产品 / 项目 / 执行」上下文，供 list **与 create/update** 补缺省范围。

```bash
# 新建或按主键复用并切换（仅传项目时会尝试反查关联产品）
zentao workspace add --project=1278 --name="叫应平台 2 期"
# 显式 --product 优先，不会被反查覆盖；反查失败时工作区仍可只有项目

zentao workspace              # 查看当前
zentao workspace ls           # 列出全部（当前优先，其余按最近使用）
zentao workspace set 2        # 切换到指定 ID/名称
zentao workspace set --name="新名称" --product=189   # 就地改当前区（不新建）
zentao workspace rm 2         # 删除；若删的是当前区，自动切到最近使用的其他区
zentao workspace remove "叫应平台 2 期"
```

| 子命令 | 作用 |
|--------|------|
| （无 / 当前） | 显示当前工作区 |
| `ls` | 列出所有工作区 |
| `add` | 按 product/project/execution 新建或切换到对应主键工作区 |
| `set` | 切换工作区，或就地修改名称/范围（不新建） |
| `rm` / `remove` | 删除工作区 |

**AI 提 Bug 推荐路径**：

```bash
zentao workspace              # 确认当前 product/project
zentao upload ./shot.png      # 拿图床 URL
# 编辑 steps.md 后：
zentao bug create --title="..." --openedBuild=trunk --type=codeerror \
  --severity=2 --pri=2 --steps-file=./steps.md
# 无需再写 --product / --project（工作区已有时）
```

创建成功后用 `zentao bug <id> --pick=id,title,product,project` 或按产品列表核验归属。

## AI 使用策略

### 输出格式

- 展示给用户：不加 `--format` 参数，默认输出 Markdown 表格（列表）或列表（单个对象）
- 需要程序化处理：加 `--format=json`，返回结构化 JSON

### 交互确认

AI 场景下执行删除操作时加 `--yes` 跳过确认提示：

```bash
zentao bug delete 1 --yes
```

### 不知道 ID 时

先查列表获取 ID，再操作具体对象：

```bash
zentao product --pick=id,name           # 查看产品列表
zentao bug --product=1 --pick=id,title  # 查看 Bug 列表
zentao bug 42                           # 查看具体 Bug
```

### 写操作前确认

执行创建、更新、删除等写操作前，先向用户确认操作内容。用户明确要求不确认时可跳过。

### 更新操作自动补全

执行 `update` 时，CLI 会先 GET 当前对象，把用户未显式传入的字段用现值填充后再 PUT，避免禅道 PUT 覆盖未提交字段导致清空。因此只需传想改的字段即可，无需手动先查再传完整参数。

## 数据处理

### 列表查询原则（测试 / 开发必读）

`--filter` / `--search` / `--sort` / `--limit` / `--pick` 都是 **对本页结果的客户端后处理**，不会自动翻页，也不会改服务端查询。

| # | 原则 | 说明 |
|---|------|------|
| 1 | **list 显式指定服务端排序** | 加 `--orderBy=id_desc`（或业务序）。不写时部分实例默认 id 升序，第一页全是历史 `closed`，再 `--filter=status=active` 会得到空数组（假阴性）。`--sort` 只排当前页，不能代替 `--orderBy`。 |
| 2 | **用 `--filter` 时拉大本页** | 同步加大 `--recPerPage`（API 上限 **1000**）。滤后条数看 `data.length`，不要看 `pager.total`。需要更全时手动 `--page=2`… 翻页再滤（`--all` 目前未实现自动翻页，勿依赖）。 |
| 3 | **「指派给我」用字段，别盲信 `browseType`** | 项目 scope 上 `browseType` 常无效或与 Web Tab 不一致。推荐：`--browseType=all`（或产品侧 `unclosed`）+ `--filter=assignedTo=<账号>`。`browseType=assignedtome` 仅当产品 scope 实测有数据时再用。关单后 `assignedTo` 常变成字符串 `closed`。 |
| 4 | **`pager` 是服务端分页，不是滤后统计** | `pager.total` / `page` / `recPerPage` 描述 **滤前** 服务端结果；滤后条数 = 输出列表长度。 |

推荐模板：

```bash
# 项目 Bug：新→旧 + 大页 + 客户端滤
zentao bug list --project=<id> --browseType=all --orderBy=id_desc --recPerPage=1000 \
  --filter='status!=closed' --pick=id,title,status,assignedTo,openedBy

# 未解决（仅 active）
zentao bug list --project=<id> --browseType=all --orderBy=id_desc --recPerPage=1000 \
  --filter=status=active

# 指派给某人
zentao bug list --project=<id> --browseType=all --orderBy=id_desc --recPerPage=1000 \
  --filter=assignedTo=<账号>

# 我创建
zentao bug list --project=<id> --browseType=all --orderBy=id_desc --recPerPage=1000 \
  --filter=openedBy=<账号>

# 产品侧「未关闭」服务端预设（部分实例有效，可先试）
zentao bug list --product=<id> --browseType=unclosed --orderBy=id_desc --recPerPage=100
```

状态语义（勿混）：

| 说法 | 建议条件 |
|------|----------|
| 未解决 | `status=active`（按团队也可含 `resolved`） |
| 未关闭 | `status!=closed` 或产品 `browseType=unclosed` |
| 已关闭 | `status=closed`（注意默认 id 升序时旧单占满首页） |

### 摘取字段

```bash
zentao product --pick=id,name,status
```

### 过滤

```bash
# 务必配合 orderBy + 足够大的 recPerPage（见上方原则）
zentao bug --product=1 --orderBy=id_desc --recPerPage=1000 --filter='status:active'
zentao bug --product=1 --orderBy=id_desc --recPerPage=1000 --filter='severity<=2,pri<=2'    # AND
zentao bug --product=1 --orderBy=id_desc --recPerPage=1000 --filter='status:active' --filter='status:resolved'  # OR
```

支持的运算符：`:` / `=` 等于、`!=` 不等于、`>` `<` `>=` `<=`、`~` 包含、`!~` 不包含。

### 模糊搜索

```bash
zentao bug --product=1 --orderBy=id_desc --recPerPage=1000 --search=登录 --search-fields=title,steps
```

### 排序

```bash
# 服务端排序（推荐，影响整表分页）
zentao bug --product=1 --orderBy=id_desc --recPerPage=100

# 客户端排序（仅当前页）
zentao bug --product=1 --orderBy=id_desc --recPerPage=100 --sort=pri_asc,severity_asc
```

### 分页

```bash
zentao bug --product=1 --orderBy=id_desc --page=1 --recPerPage=50
zentao bug --product=1 --orderBy=id_desc --recPerPage=1000   # 单页尽量多取，再 filter
zentao bug --product=1 --orderBy=id_desc --recPerPage=100 --limit=10  # 本页内再截断前 10 条
```
## 常用操作示例

### 查看进行中的项目和执行

```bash
zentao project --filter='status:doing' --pick=id,name,status
zentao execution --project=5 --pick=id,name,status
```

### 创建需求并关联计划

```bash
zentao story create --product=1 --title="需求标题" --assignedTo=admin --pri=3
zentao story update 11 --title="需求标题" --plan=1
```

### 创建并解决 Bug

```bash
# 推荐：工作区已配置时省略 product/project；Markdown 写 steps
zentao bug create --title="Bug标题" --severity=2 --pri=2 \
  --type=codeerror --openedBuild=trunk --steps-file=./bug-steps.md

# 未配工作区：显式 --product（与 --productID 等价）
zentao bug create --product=1 --title="Bug标题" --severity=2 --pri=2 \
  --type=codeerror --openedBuild=trunk --steps-file=./bug-steps.md

# 兼容：短文本 / 已渲染 HTML 仍可用 --steps=
zentao bug create --product=1 --title="Bug标题" --severity=2 --pri=2 \
  --type=codeerror --openedBuild=trunk --steps="简短描述"
zentao bug resolve 42
```

### 创建、启动并完成任务

```bash
zentao task create --execution=1 --name="任务名" --type=devel --assignedTo=admin --estimate=4
zentao task start 100
zentao task finish 100 --consumed=4
```

### 查看帮助

```bash
zentao bug help          # 查看 Bug 模块的参数和操作
zentao story update help # 查看需求更新操作的参数和操作
zentao help              # 查看所有命令
```

## 意图识别

| 用户意图 | CLI 命令 |
|---------|---------|
| 所有产品/项目/项目集 | `zentao product` / `zentao project` / `zentao program` |
| 进行中的项目 | `zentao project --filter='status:doing'` |
| 某产品的 Bug | `zentao bug --product=<id> --orderBy=id_desc --recPerPage=100` |
| 某项目的 Bug | `zentao bug --project=<id> --browseType=all --orderBy=id_desc --recPerPage=1000` |
| 未关闭 / 指派给我 / 我创建 | 见「列表查询原则」：`--orderBy=id_desc --recPerPage=1000 --filter=...` |
| 某执行的任务 | `zentao task --execution=<id>` |
| 创建/新增 Bug | `zentao bug create ...`（有工作区可省略 `--product`） |
| 用 Markdown 写复现步骤 | `zentao bug create ... --steps-file=./steps.md`（先 `zentao upload` 图片） |
| 解决 Bug | `zentao bug resolve <id>` |
| 关闭 Bug | `zentao bug close <id>` |
| 激活 Bug | `zentao bug activate <id>` |
| 创建需求 | `zentao story create ...` |
| 变更/关闭/激活需求 | `zentao story change/close/activate <id>` |
| 业务需求 | `zentao epic ...`（同 story） |
| 用户需求 | `zentao requirement ...`（同 story） |
| 创建/启动/完成/关闭任务 | `zentao task create/start/finish/close ...` |
| 测试用例 | `zentao testcase ...` |
| 测试单 | `zentao testtask ...` |
| 产品计划 | `zentao productplan ...` |
| 版本/Build | `zentao build ...` |
| 发布 | `zentao release ...` |
| 反馈 | `zentao feedback ...` |
| 工单 | `zentao ticket ...` |
| 用户列表 | `zentao user` |
| 当前用户信息 / 切账号 | `zentao profile` / `zentao profile <account@server>` |
| 退出登录 | `zentao logout` |
| 新建工作区（仅项目） | `zentao workspace add --project=<id> --name=...`（自动反查产品） |
| 切换 / 修改 / 删除工作区 | `zentao workspace set ...` / `zentao workspace rm <id\|名>` |
| 上传图片到富文本图床 | `zentao upload <图片路径...>` |
| 升级 CLI | `zentao upgrade` |
| 安装技能 / 配 MCP | `zentao add-skill` / `zentao add-mcp` |
| 启动 MCP | `zentao mcp` |

## 错误处理

| 错误码 | 含义 | 处理方式 |
|--------|------|---------|
| E1001 | 未登录/凭证缺失 | 执行 `zentao login` |
| E1004 | Token 失效 | 执行 `zentao login` 重新登录 |
| E2001 | 模块不存在 | 执行 `zentao help` 查看可用模块 |
| E2002 | 对象不存在 | 检查 ID 是否正确 |
| E2003 | 缺少必要参数 | 执行 `zentao <module> help` 或 `zentao <module> <action> help`；create 缺产品时优先检查工作区或传 `--product` |
| E2006 | 无权限 | 提示用户检查权限 |
| E2009 | 选项无效（如 `--steps` 与 `--steps-file` 同时使用、steps 文件为空） | 二选一；检查文件内容 |
| E2011 | 文件不存在（上传或 `--steps-file`） | 检查本地路径 |
| E2012 | 不支持的图片类型 | 使用 png/jpg/gif/webp/bmp/svg |
| E2013 | 图片上传失败 | 查看服务端消息；确认已登录 |
| E4001 | 未找到指定工作区 | `zentao workspace ls` 查看可用工作区 |
| E4002 | 当前工作区未设范围且命令也未传 scope | `zentao workspace set --product=<id>`（或 `--project` / `--execution`），或命令中显式传范围 |
| E4003 | 无法按 ID 设置工作区 | 检查 ID / 权限 |
| E4004 | 工作区名称歧义 | 改用数字 ID |
| E4005 | 无法删除工作区 | 查看 reason 字段 |
| E5001 | 请求超时 | 检查网络或禅道服务状态 |
| E5002 | SSL/TLS 证书验证失败 | 检查地址；必要时临时 `--insecure`（仅可信环境） |

## 注意事项

- 不确定模块参数时，先执行 `zentao <module> help` 查看帮助，不确定操作参数时，先执行 `zentao <module> <action> help` 查看帮助
- help 里字段名可能是 `productID`，传参可用 `--product` 或 `--productID`（≥1.3.1 等价并双写）
- **Bug 列表**：`--filter` 是客户端本页过滤；必带 `--orderBy=id_desc` 与足够大的 `--recPerPage`（见「列表查询原则」）
- `browseType` 是服务端命名视图，**枚举随模块/入口而变**，不是通用字段查询：
  - Bug：文档常见 `all` / `unclosed` / `assignedtome` / `openedbyme`；Web 项目 Bug 页可能只有 `all` / `unresolved`
  - 项目 scope 上部分 IPD 实例会忽略 `browseType`；以实测为准，精确条件用 `--filter`
  - 产品/项目自身列表才用 `doing` / `closed` 等，不要套到 Bug 上
- 多账号切换：`zentao profile` 查看和切换账号；退出用 `zentao logout`
- 技能文件随 npm 包分发在 `skills/`；更新 CLI 后若 Agent 目录仍是旧 skill，再跑一次 `zentao add-skill`
