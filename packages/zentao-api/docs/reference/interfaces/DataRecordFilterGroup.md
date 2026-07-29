[zentao-api](../index.md) / DataRecordFilterGroup

# Interface: DataRecordFilterGroup

一组过滤条件，组内按 `operator` 组合；多组之间按 AND 组合。

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-conditions"></a> `conditions` | [`DataRecordFilter`](DataRecordFilter.md)[] | 组内条件列表。 |
| <a id="property-operator"></a> `operator` | `"AND"` \| `"OR"` | 组内条件的组合方式。 |
