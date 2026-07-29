[zentao-api](../index.md) / VERSION

# Variable: VERSION

> `const` **VERSION**: `string`

SDK 版本号，由构建脚本通过 `__ZENTAO_API_VERSION__` 注入。

通常等于 `package.json` 的 `version` 字段；本地 `tsc` 直接编译时回落为 `'0.0.0-dev'`。
