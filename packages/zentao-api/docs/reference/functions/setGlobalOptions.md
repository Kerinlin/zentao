[zentao-api](../index.md) / setGlobalOptions

# Function: setGlobalOptions()

> **setGlobalOptions**(`options`): `void`

以浅合并的方式更新全局选项。

仅覆盖传入 `options` 中显式声明的字段；其余字段保留原值。若希望清空某个字段，
显式传入 `undefined` 即可（会写入 `undefined` 并在后续读取时返回 `undefined`）。

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | `Partial`\<[`GlobalOptions`](../interfaces/GlobalOptions.md)\> | 要合并到全局选项中的字段子集。 |

## Returns

`void`
