[zentao-api](../index.md) / switchProfile

# Function: switchProfile()

> **switchProfile**(`profileKey?`): `Promise`\<[`ZentaoProfileRecord`](../interfaces/ZentaoProfileRecord.md)\>

切换当前使用的 profile，并刷新其 `lastUsedTime`。

不传 `profileKey` 时使用当前 profile（相当于把当前 profile 的 `lastUsedTime` 刷新一遍）。
切换成功后会立即写回存储，由进程内串行锁保护。

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `profileKey?` | `string` | 可选的目标 profile key；不传则使用当前 profile。 |

## Returns

`Promise`\<[`ZentaoProfileRecord`](../interfaces/ZentaoProfileRecord.md)\>

切换后生效的 profile 记录（带 `key` 字段）。

## Throws

`E_NO_PROFILE`（未配置任何当前 profile 且未传 key）、
  `E_PROFILE_NOT_FOUND`（目标 key 不存在）、`E_PROFILE_STORAGE_INVALID` /
  `E_PROFILE_STORAGE_UNAVAILABLE`。
