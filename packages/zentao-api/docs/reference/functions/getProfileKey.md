[zentao-api](../index.md) / getProfileKey

# Function: getProfileKey()

> **getProfileKey**(`profile`): `string`

根据 profile 的账号和禅道站点地址生成稳定 key。

Key 格式为 `account@server`，其中 `server` 会经过 [normalizeSiteUrl](#) 规范化，
因此即使传入末尾带 `/` 或 `/api.php/v2` 的地址，也会得到一致的结果。

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `profile` | `Pick`\<[`ZentaoProfile`](../interfaces/ZentaoProfile.md), `"account"` \| `"server"`\> | 只需要包含 `account` 和 `server` 两个字段。 |

## Returns

`string`

形如 `admin@https://zentao.example.com` 的 profile key。

## Throws

`E_INVALID_PROFILE`（账号为空白）或 `E_INVALID_BASE_URL`（`server` 不合法）。
