[zentao-api](../index.md) / DefineModulesOptions

# Interface: DefineModulesOptions

[defineModules](../functions/defineModules.md) 的选项。

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-replace"></a> `replace?` | `boolean` | 同名模块的写入策略。 - `false`（默认）：合并模块的元数据，并按动作名对动作做"同名替换、未知追加"。 - `true`：整体替换已存在的模块定义，原有动作会被丢弃。 |
