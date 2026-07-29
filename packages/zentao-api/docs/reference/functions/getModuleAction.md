[zentao-api](../index.md) / getModuleAction

# Function: getModuleAction()

> **getModuleAction**(`moduleName`, `actionName`): [`ModuleAction`](../interfaces/ModuleAction.md)

获取指定模块下的某个动作。

解析顺序：
1. `actionName === 'ls'` 时映射为 `list`（仅作为别名，不会修改注册表）。
2. 在该模块的动作中按名称大小写不敏感匹配。
3. 当请求的动作不是基础 CRUD（`list`/`get`/`create`/`update`/`delete`）时，
   额外允许命中 `type === 'action'` 的自定义动作（即使名字不在基础 CRUD 中）。

返回值同样是已深冻结的引用，请勿尝试修改。

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `moduleName` | `string` | 模块名（大小写不敏感）。 |
| `actionName` | `string` | 动作名（大小写不敏感）；支持 `ls` 作为 `list` 的别名。 |

## Returns

[`ModuleAction`](../interfaces/ModuleAction.md)

匹配到的动作定义。

## Throws

`E_INVALID_MODULE`（模块未注册）或 `E_INVALID_ACTION`（动作不存在）。
