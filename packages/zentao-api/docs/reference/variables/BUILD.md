[zentao-api](../index.md) / BUILD

# Variable: BUILD

> `const` **BUILD**: `string`

构建标识，由构建脚本通过 `__ZENTAO_API_BUILD__` 注入。

通常是 commit hash 或 CI 构建号；本地 `tsc` 直接编译时回落为 `'development'`。
