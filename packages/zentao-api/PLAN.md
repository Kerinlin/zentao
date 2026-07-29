# Plan

## 支持持久化用户账号机制

增加一个全局选项，启用后用户登录时将 Token、禅道地址和用户账号建立一个个人资料保存到本地，下次可以直接使用无需再进行登录，关键设计如下：

* Node/Bun 环境下用户资料保存在 `~/.config/zentao/zentao.json` 文件内，浏览器环境下用户资料保存在本地存储 `ZENTAO_PROFILES` 中
* 用户资料包含禅道地址、Token、账号、用户信息、以及其他配置信息，每个个人资料使用 `account@zentaoServerUrl` 作为 Key
* 提供如下公开方法：
  * `getAllProfiles()` 列出所有保存的个人资料
  * `getProfle(profileKey)` 获取指定个人资料配置，如果不指定 key 则返回上次使用的个人资料
  * `addProfle(profile)` 添加个人资料
  * `deleteProfile(profileKey)` 删除个人资料
  * `switchProfile(profileKey)` 切换当前使用的个人资料
* 增加 `ZentaoClient.fromProfile(profileKey)` 方法根据个人资料创建客户端，如果不指定 key 则返回当前使用的个人资料

下面是一个配置文件示例：

```json
{
    /* 当前用户配置的账号@禅道服务地址 */
    "currentProfile": "admin@https://zentao.example.com",

    /* 用户配置列表 */
    "profiles": [
        {
            /* 禅道服务地址 */
            "server": "https://zentao.example.com",

            /* 用户账号 */
            "account": "admin",

            /* TOKEN */
            "token": "xxxxxx",

            /* 登录验证通过后用户在禅道中的信息 */
            "user": {
                /* 用户在禅道中的 ID */
                "id": 1,

                /* 用户姓名 */
                "realname": "Admin",

                // ... 其他属性
            },

            /* 登录时间 */
            "loginTime": "2026-04-10 10:00:00",

            /* 最后使用时间 */
            "lastUsedTime": "2026-04-10 10:00:00",

            /* 服务器配置 */
            "serverConfig": {
                /* 禅道版本 */
                "version": "ipd5.0",
                "systemMode": "PLM",
                "sprintConcept": "0",
                "requestType": "PATH_INFO",
                "requestFix":"-",
                "moduleVar":"m",
                "methodVar":"f",
                "viewVar":"t",
                "sessionVar":"zentaosid"
            },

            /* 客户端自定义配置 */
            "config": {
                /* 默认输出格式 */
                "defaultOutputFormat": "markdown",

                /* 界面语言 */
                "lang": "zh-CN",

                /* 默认分页大小 */
                "defaultRecPerPage": 20,

                /* 是否忽略 SSL/TLS 证书验证 */
                "insecure": false,

                /* 是否将对象属性中的 HTML 转换为 Markdown */
                "htmlToMarkdown": true,

                /* 请求超时时间 */
                "timeout": 10000,

                /* 是否在批量操作出错时停止执行后续操作 */
                "batchFailFast": false,

                /* 是否在 JSON 格式化时添加空格 */
                "jsonPretty": false,

                /* 分页配置 */
                "pagers": {
                    "product": 50   // 产品分页大小
                }
            }
        },
        {
            "server": "https://zentao.example.com",
            "account": "dev1",
            "token": "xxxxxx",
            "loginTime": "2026-04-10 10:00:00",
            "lastUsedTime": "2026-04-10 10:00:00",
        }
    ],
}
```

## 实现文档网站

基于 VitePress 实现文档网站，网站顶部导航包含三大部分内容：

- Guide（快速开始）：包含项目介绍、如何在各种不同的环境使用、常见 API 的调用示例
- Reference（参考）：列出所有公开成员，包括类型、常量和方法，展示每个 API 的用法、参数和返回值
- ZenTao API（禅道 API）：列出所有禅道 API 的用法、参数和返回值，并按照模块分类
