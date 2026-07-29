[zentao-api](../index.md) / getProfile

# Function: getProfile()

> **getProfile**(`profileKey?`): `Promise`\<[`ZentaoProfileRecord`](../interfaces/ZentaoProfileRecord.md) \| `undefined`\>

获取指定 profile。

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `profileKey?` | `string` | 可选的 profile key（`account@server`）；不传时返回当前（最近一次切换的）profile。 |

## Returns

`Promise`\<[`ZentaoProfileRecord`](../interfaces/ZentaoProfileRecord.md) \| `undefined`\>

命中的 profile（带 `key` 字段）；当 key 不存在或尚未配置当前 profile 时返回 `undefined`。

## Throws

`E_PROFILE_STORAGE_INVALID` / `E_PROFILE_STORAGE_UNAVAILABLE`。
