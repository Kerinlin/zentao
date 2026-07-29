[zentao-api](../index.md) / searchData

# Function: searchData()

> **searchData**(`data`, `keywordGroups`, `searchFields?`): [`DataRecord`](../type-aliases/DataRecord.md)[]

对列表做大小写不敏感的模糊匹配。

每个 `keywordGroups` 元素是一个关键词串，组内以空白分隔为 OR；多组之间按 AND 组合。

## Parameters

| Parameter | Type |
| ------ | ------ |
| `data` | [`DataRecord`](../type-aliases/DataRecord.md)[] |
| `keywordGroups` | `string`[] |
| `searchFields?` | `string`[] |

## Returns

[`DataRecord`](../type-aliases/DataRecord.md)[]
