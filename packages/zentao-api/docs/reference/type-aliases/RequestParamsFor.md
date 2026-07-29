[zentao-api](../index.md) / RequestParamsFor

# Type Alias: RequestParamsFor\<Name\>

> **RequestParamsFor**\<`Name`\> = `PathParams`\<`ActionOfRequest`\<`Name`\>\> & `QueryParams`\<`ActionOfRequest`\<`Name`\>\> & `BodyParams`\<`ActionOfRequest`\<`Name`\>\> & `object` & `Record`\<`string`, `unknown`\>

根据内置请求名推导出的参数类型。

## Type Declaration

| Name | Type |
| ------ | ------ |
| `page?` | `string` \| `number` |
| `recPerPage?` | `string` \| `number` |

## Type Parameters

| Type Parameter |
| ------ |
| `Name` *extends* [`BuiltinRequestName`](BuiltinRequestName.md) |
