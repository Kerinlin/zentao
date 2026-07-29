[zentao-api](../index.md) / getGlobalOptions

# Function: getGlobalOptions()

> **getGlobalOptions**(): [`GlobalOptions`](../interfaces/GlobalOptions.md)

获取当前全局选项的快照。

返回的是浅拷贝副本，对返回值的修改不会影响内部状态；如需更新请使用 [setGlobalOptions](setGlobalOptions.md)。

## Returns

[`GlobalOptions`](../interfaces/GlobalOptions.md)

当前生效的全局选项快照，参见 [GlobalOptions](../interfaces/GlobalOptions.md)。
