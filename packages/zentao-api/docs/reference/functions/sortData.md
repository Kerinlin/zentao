[zentao-api](../index.md) / sortData

# Function: sortData()

> **sortData**(`data`, `sortFields`): [`DataRecord`](../type-aliases/DataRecord.md)[]

对列表排序，返回新数组（不修改入参）。

`sortFields` 的每个元素可以是 `字段:asc|desc` 表达式或自定义比较函数，按先后顺序生效；
数值字段按数字比较，否则按字符串 `localeCompare`。

## Parameters

| Parameter | Type |
| ------ | ------ |
| `data` | [`DataRecord`](../type-aliases/DataRecord.md)[] |
| `sortFields` | (`` `${string}:asc` `` \| `` `${string}:desc` `` \| [`SortFn`](../type-aliases/SortFn.md))[] |

## Returns

[`DataRecord`](../type-aliases/DataRecord.md)[]
