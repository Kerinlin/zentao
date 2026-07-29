[zentao-api](../index.md) / DataRecordFilter

# Interface: DataRecordFilter

单条过滤条件，字段名支持 `.` 访问子字段。

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-key"></a> `key` | `string` | 字段路径，例如 `status` 或 `assignedTo.id`。 |
| <a id="property-operator"></a> `operator` | `"="` \| `"!="` \| `">"` \| `"<"` \| `">="` \| `"<="` \| `"~"` \| `"!~"` | 比较运算符。 |
| <a id="property-value"></a> `value` | `string` \| `number` \| `boolean` \| `string`[] | 比较值；数组用于 `=`/`!=`/`~`/`!~` 的“任一/全不”匹配。 |
