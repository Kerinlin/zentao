[zentao-api](../index.md) / ProcessListOptions

# Interface: ProcessListOptions

[processData](../functions/processData.md) 处理列表时的选项；执行顺序为 过滤 → 搜索 → 排序 → 限制数量 → 摘取。

## Extended by

- [`RequestOptions`](RequestOptions.md)

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-filter"></a> `filter?` | `string`[] | 过滤表达式列表，例如 `["status=active", "pri>=2"]`，多条之间按 AND 组合。 |
| <a id="property-limit"></a> `limit?` | `string` | 限制返回列表数量，在排序后、摘取前截断；不改变服务端页大小。 |
| <a id="property-pick"></a> `pick?` | `string`[] | 摘取字段路径列表。 |
| <a id="property-search"></a> `search?` | `string`[] | 模糊搜索关键词组，组内空格分隔为 OR，多组之间按 AND 组合。 |
| <a id="property-searchfields"></a> `searchFields?` | `string`[] | 限定搜索字段，缺省时搜索全部字段。 |
| <a id="property-sort"></a> `sort?` | `string` | 排序表达式，多个字段以英文逗号分隔，例如 `pri:desc,id:asc`。 |
