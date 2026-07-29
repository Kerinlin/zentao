# TODO

## OpenAPI 生成器质量护栏

- 为 `scripts/update-registry.ts` 增加快照测试，覆盖动作分类、枚举/默认值解析、`resultGetter` 推断和 scoped list 合并。
- 生成 registry 时输出 warning 汇总，例如无法识别的描述枚举、重复 action 名、缺失 200 schema、无法推断列表字段。
- 对 `src/modules/generated.ts` 增加结构校验，避免上游 OpenAPI 文案变化时静默生成不准确的 SDK 元数据。

## 真实环境契约测试矩阵

- 将 `bun run test:real` 拆成可选择的模块级套件，覆盖产品、需求、任务、Bug、附件等核心链路。
- 在发布前或定期任务中跑不同禅道版本、不同系统模式、不同权限账号的契约测试。
- 输出更稳定的测试数据清理报告，失败时保留可追踪的临时实体 ID。

## Profile Token 安全

- 为 Node.js profile 存储增加可插拔 secret store：macOS Keychain、1Password CLI、环境变量只读模式等。
- 在浏览器环境中明确区分 `localStorage` 与 `sessionStorage` 策略，并在文档中说明 token 暴露风险。
- 支持 profile token 轮换/失效检测，登录态失败时给出可操作的恢复路径。
