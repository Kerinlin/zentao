# 开发 & 测试使用指南

## 1. 一键安装

脚本从**内网 Gitea** 拉取；会检测 Node、全局安装 `@kerin/zentao-cli`，然后进入配置向导。

### Windows（PowerShell）

```powershell
irm http://192.168.0.147:3000/pgiot/zentao/raw/branch/main/packages/zentao-cli/scripts/install-gitea.ps1 | iex
```

### macOS / Linux

```bash
curl -fsSL http://192.168.0.147:3000/pgiot/zentao/raw/branch/main/packages/zentao-cli/scripts/install-gitea.sh | sh
```

装完 CLI 后如果没有自动执行向导作可以手动跑向导：

```bash
zentao install
```

### 向导顺序

```text
1. 安装/跳过 CLI 包
2. 登录禅道（依次输入）：
     1) 禅道服务地址 (URL) https://zentao.pgiot.com/zentao
     2) 用户名 (Account) xxx
     3) 密码(Password) xxx
3. 选择 AI 接入方式：
     1) CLI 技能  (add-skill)
     2) MCP 服务  (add-mcp)   ← 日常提单修单推荐
     3) 两者都装
     4) 跳过
4. 按选择执行 add-skill / add-mcp
```

若是测试账号或错误地址，在向导里选「重新登录」，或事后执行：

```bash
zentao login    # 改成真实禅道 URL / 账号
zentao profile  # 确认当前账号
```


| 现象                  | 怎么办                                          |
| ------------------- | -------------------------------------------- |
| `command not found` | 关掉终端重开；确认 npm 全局 bin 在 PATH                  |
| 拉脚本失败               | 确认在公司内网，能打开 `http://192.168.0.147:3000`      |
| 未登录 / E1001         | `zentao login -s 禅道地址 -u 账号 -p 密码`           |
| 向导里账号不对             | 选重新登录，或 `zentao login` / `zentao logout` 后再登 |


---



## 2. 两条路径怎么用

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

### 路径 B：MCP

```bash
# 必须先 login（MCP 复用本地凭证，不在 Agent 配置写密码）
zentao login
zentao add-mcp
# 或 zentao add-mcp claude-code
```

1. 选择 AI（多选）
2. **重启**对应 AI 客户端

手动添加使用下面的内容

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

---



## 3. 工作区（两条路径都建议设一次）

工作区 = 记住当前**产品/项目**，之后提单、查单少填 ID，AI 寻找项目更快

```bash
zentao product --pick=id,name
zentao project --pick=id,name
zentao workspace add --product=<产品ID> --project=<项目ID> --name=主线
zentao workspace
```

可对 AI 说：「新建一个工作区，项目 ID 为 xxx，名称为 xxx」，这个等同于

```
zentao workspace add --project=xxx --name="xxx"

```

项目ID 可以从禅道获取，cli 会自动关联产品 ID，省去自己寻找的步骤

---



## 4. MCP 工具一览（19 个）



### 4.1 Bug 核心


| 工具             | 干啥                 | 谁常用          |
| -------------- | ------------------ | ------------ |
| `list_bugs`    | 查 Bug 列表           | 测试、开发        |
| `get_bug`      | 详情（含步骤）            | 开发、测试        |
| `create_bug`   | **提 Bug**          | **测试**       |
| `update_bug`   | 改标题/指派人等（**不改状态**） | 偶尔           |
| `resolve_bug`  | **解决**             | **开发**       |
| `close_bug`    | **关闭**             | **测试**（回归通过） |
| `activate_bug` | **重开**             | **测试**（回归失败） |
| `delete_bug`   | 删除（慎用）             | 几乎不用         |




### 4.2 账号 / 工作区 / 辅助


| 工具                                                               | 干啥                |
| ---------------------------------------------------------------- | ----------------- |
| `get_current_user`                                               | 当前登录账号            |
| `list_profiles` / `switch_user`                                  | 多账号               |
| `list_workspaces` / `create_workspace` / `switch_workspace`      | 工作区               |
| `upload_image`                                                   | 截图 → URL 写进 steps |
| `list_products` / `list_projects` / `list_builds` / `list_users` | 枚举                |




### 4.3 `list_bugs` 默认与筛选


| 参数           | 默认        | 说明                                |
| ------------ | --------- | --------------------------------- |
| `browseType` | `all`     | 服务端粗视图；字段条件请用 `filter`            |
| `orderBy`    | `id_desc` | 新→旧，避免首页全是历史 closed               |
| `recPerPage` | `1000`    | 本页尽量多取（API 上限 1000）               |
| `filter`     | 无         | **客户端、只滤当前页**（语法同 CLI `--filter`） |


`filter` **写法：**


| 写法                                    | 含义              |
| ------------------------------------- | --------------- |
| `status=active`                       | 未解决（激活中）        |
| `status!=closed`                      | 未关闭（含 resolved） |
| `assignedTo=账号`                       | 指派给某人           |
| `openedBy=账号`                         | 某人创建            |
| `pri<=2`                              | 优先级             |
| `title~登录`                            | 标题包含            |
| `["status=active,pri<=2"]`            | 单条内逗号 = **AND** |
| `["status=active","status=resolved"]` | 多条 = **OR**     |


返回里会有：

- `data` / `count`：滤后列表与条数  
- `applied`：本次生效的 scope、filter、`filterGuide`  
- `pager`：**服务端滤前**分页；有 filter 时看 `count`，别只看 `pager.total`

> 项目 scope 上部分禅道实例会忽略 `browseType`；精确条件一律用 `filter`。

---



## 5. 测试视角（提单 + 回归）

主路径：**create → 等开发 resolve → close / activate**。

> 「提个 Bug：登录页错误密码还能进首页。严重度 2，指派 zhangsan。步骤：…。截图 /tmp/shot.png」


| 你想…   | 对 AI 说        | MCP                                        |
| ----- | ------------- | ------------------------------------------ |
| 提 Bug | 「提个 Bug：…」    | `create_bug`（可先 `upload_image`）            |
| 未关闭列表 | 「未关闭的 Bug」    | `list_bugs` + `filter: ["status!=closed"]` |
| 关单    | 「329 回归通过，关闭」 | `close_bug`                                |
| 重开    | 「329 还能复现，打开」 | `activate_bug`                             |


`create_bug`：`title` 必填；`severity`/`pri` 1～4；`type` 常见 `codeerror`；`openedBuild` 默认 trunk；`assignedTo` 用开发**登录账号**。

### 5.1 复现步骤：`--steps-file`（推荐）

多行复现步骤**不要**塞进 `--steps=`（shell/CLI 对多行 `--key=value` 不友好）。应写成 Markdown 文件，用 `--steps-file`：CLI 读文件 → 转禅道轻量 HTML → 写入 `steps`。


| 传法                     | 行为                       |
| ---------------------- | ------------------------ |
| `--steps-file=path.md` | 读 MD → 转 HTML → `steps`  |
| `--steps=...`          | **原样透传**（短文本/已有 HTML 兼容） |
| 同时传两者                  | 报错 E2009                 |
| 文件不存在 / 为空             | E2011 / E2009            |


支持的 Markdown 子集：`#`/`##` 标题、段落、有序/无序列表、`**加粗**`、``code``、`![alt](url)`。  
**图片 URL 必须是已上传地址**；本地路径不会自动 upload。

**CLI 完整示例：**

```bash
# 1) 上传截图 → 得到图床 URL（相对路径即可写进 MD）
zentao upload ./shot1.png ./shot2.png
# 输出示例：
# /zentao/file-read-8752.png
# /zentao/file-read-8753.png

# 2) 按下方模板写 steps.md（把 URL 嵌进 ![](...)）

# 3) 提单（工作区已设 product/project 时可省略 --product）
zentao bug create --title="登录页错误密码仍可进入首页" \
  --severity=2 --pri=2 --type=codeerror --openedBuild=trunk \
  --assignedTo=zhangsan --steps-file=./steps.md
```

**MCP 等价：** 先 `upload_image`（每张图一次）→ 把返回 URL 写进 steps 文本 → `create_bug`（`steps` 字段传 Markdown 或已拼好的内容；MCP 侧直接传 `steps`，不经 `--steps-file` 文件路径）。

### 5.2 steps 标准模板

把下面内容存成 `steps.md`（或任意路径），填充内容后交给 `--steps-file`，注意模板中的内容是可以任意变化的，只要符合 md 格式规范即可

```markdown
## 问题描述
（一句话：现象 + 影响面。例：登录页输入错误密码后仍可进入系统首页。）

## 环境
- 产品/项目：...
- 版本/Build：trunk / v1.2.0
- 浏览器/端：Chrome 120 / iOS / 管理端
- 账号角色：（如有）普通用户 / 管理员

## 前置条件
1. 已安装/部署到 ... 环境
2. 存在可用账号 `xxx`（密码已知）
3. ...

## 重现步骤
1. 打开登录页 `https://.../login`
2. 输入错误密码，点击「登录」
3. 观察跳转与提示

![步骤2-输入错误密码](/zentao/file-read-XXXX.png)

## 实际结果
（写清看到了什么；关键 UI 用图）

- 页面跳转到首页，无错误提示
- ...

![实际结果-已进入首页](/zentao/file-read-YYYY.png)

## 期望结果
- 应停留在登录页并提示「用户名或密码错误」
- 不应进入需鉴权的页面

```

**写步骤时注意：**

1. 有图先 `zentao upload` / `upload_image`，再把返回 URL 写进 `![说明](url)`；
2. 一张图对应一步或一个结果，alt 写清「步骤几 / 实际结果」。
3. 标题层级用 `##` 即可；有序列表用 `1.`  开头。



### 5.3 建议：搭一个「提单技能」固化流程

通用 `zentao-cli` 技能覆盖面大，但日常测试提单更适合**单独做一个薄技能**（例如 `zentao-bug-report`），把「截图 → 识别 → 填模板 → 上传 → 嵌 URL → 提单」写成固定 SOP，减少 AI 漏步骤、steps 格式乱、本地路径未上传等问题。

## 6. 开发视角（接单 + 解决）

主路径：**list 指派给我的 → get 详情 → resolve**。


| 你想…   | 对 AI 说             | MCP                                                                  |
| ----- | ------------------ | -------------------------------------------------------------------- |
| 我的未解决 | 「指派给我的 active Bug」 | `list_bugs` + `filter: ["assignedTo=<账号>","status=active"]` 或 AND 写法 |
| 看步骤   | 「Bug 329 详情」       | `get_bug`                                                            |
| 修好了   | 「329 已修 fixed」     | `resolve_bug`                                                        |
| 复现不了  | 「329 标 notrepro」   | `resolve_bug`                                                        |


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

**Q：多行复现步骤怎么写？**  
A：写 Markdown 文件，CLI 用 `--steps-file=./steps.md`（见 §5.1～5.2）。有截图先 `zentao upload` / `upload_image`，再把 URL 写进 `![](url)`。不要用多行 `--steps=`，也不要写本地图片路径。

**Q：要不要单独做提单技能？**  
A：日常高频提单建议做（§5.3）：把 upload → 识图填模板 → 嵌 URL → 确认 → create 写成固定 SOP，比只靠通用 `zentao-cli` 技能更稳。

---



## 9. MCP 工具对照表


| #   | 工具名                | 一句话                                       |
| --- | ------------------ | ----------------------------------------- |
| 1   | `list_bugs`        | 查列表（默认 all + id_desc + 1000；`filter` 本页筛） |
| 2   | `get_bug`          | 详情                                        |
| 3   | `create_bug`       | 提单                                        |
| 4   | `update_bug`       | 改字段（不改状态）                                 |
| 5   | `delete_bug`       | 删除（慎用）                                    |
| 6   | `resolve_bug`      | 开发解决                                      |
| 7   | `close_bug`        | 测试关闭                                      |
| 8   | `activate_bug`     | 测试重开                                      |
| 9   | `get_current_user` | 当前账号                                      |
| 10  | `list_profiles`    | 本地账号列表                                    |
| 11  | `switch_user`      | 切账号                                       |
| 12  | `list_workspaces`  | 工作区列表                                     |
| 13  | `create_workspace` | 建/切工作区                                    |
| 14  | `switch_workspace` | 切换工作区                                     |
| 15  | `upload_image`     | 上传截图                                      |
| 16  | `list_products`    | 产品                                        |
| 17  | `list_projects`    | 项目                                        |
| 18  | `list_builds`      | 版本                                        |
| 19  | `list_users`       | 用户                                        |


---

1. 安装：内网脚本，或 `zentao install`（**先登录 → 再选 skill / MCP**）
2. 日常提单修单：优先 **MCP**；要完整 CLI 用 **skill**；测试高频提单可再加**自建提单技能**（§5.3）
3. 协作：测试提单（`upload` + `--steps-file` **模板**）→ 开发解决 → 测试关闭/重开；查单用 `list_bugs` 的 `filter`，别盲信 `browseType`

