[zentao-api](../index.md) / processData

# Function: processData()

## Call Signature

> **processData**(`data`, `options`): [`DataRecord`](../type-aliases/DataRecord.md)

处理单条对象：仅支持字段摘取。

### Parameters

| Parameter | Type |
| ------ | ------ |
| `data` | [`DataRecord`](../type-aliases/DataRecord.md) |
| `options` | [`ProcessSingleOptions`](../interfaces/ProcessSingleOptions.md) |

### Returns

[`DataRecord`](../type-aliases/DataRecord.md)

## Call Signature

> **processData**(`data`, `options`): [`DataRecord`](../type-aliases/DataRecord.md)[]

处理列表：按 过滤 → 搜索 → 排序 → 限制数量 → 摘取 的顺序执行。

### Parameters

| Parameter | Type |
| ------ | ------ |
| `data` | [`DataRecord`](../type-aliases/DataRecord.md)[] |
| `options` | [`ProcessListOptions`](../interfaces/ProcessListOptions.md) |

### Returns

[`DataRecord`](../type-aliases/DataRecord.md)[]
