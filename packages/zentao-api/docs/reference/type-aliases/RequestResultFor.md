[zentao-api](../index.md) / RequestResultFor

# Type Alias: RequestResultFor\<Name\>

> **RequestResultFor**\<`Name`\> = `ActionOfRequest`\<`Name`\> *extends* `object` ? [`DataRecord`](DataRecord.md)[] : `ActionOfRequest`\<`Name`\> *extends* `object` ? [`DataRecord`](DataRecord.md) : `unknown`

根据内置请求名推导出的 `ResponseData.data` 类型。

## Type Parameters

| Type Parameter |
| ------ |
| `Name` *extends* [`BuiltinRequestName`](BuiltinRequestName.md) |
