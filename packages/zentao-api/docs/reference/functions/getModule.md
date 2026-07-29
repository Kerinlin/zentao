[zentao-api](../index.md) / getModule

# Function: getModule()

> **getModule**(`moduleName`): [`ModuleDefinition`](../interfaces/ModuleDefinition.md)

获取模块定义。

模块名匹配大小写不敏感。返回值是注册表内部的已深冻结引用（O(1) 查询、零拷贝），
任何写入尝试在严格模式下会抛 `TypeError`；如需修改请使用 [defineModules](defineModules.md)。

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `moduleName` | `string` | 模块名。 |

## Returns

[`ModuleDefinition`](../interfaces/ModuleDefinition.md)

已注册的模块定义。

## Throws

`E_INVALID_MODULE` —— 模块未注册。
