# 本地数据处理方法设计

支持对单个对象数据或列表数据进行处理，处理方法包括：字段摘取、过滤、模糊搜索、排序、限制数量。

## 基础类型

```typescript
type DataRecord = Record<string, unknown>;
```

## 1. 字段摘取 `pick`

只保留指定字段，支持通过 `.` 访问子字段。
当处理单个对象时，返回单个对象；当处理列表时，返回列表。

```typescript
function pickFields(data: DataRecord[], fields: string[]): DataRecord[];

function pickFieldsSingle(data: DataRecord, fields: string[]): DataRecord;
```

- **参数**：`data` 列表（或单条），`fields` 字段路径数组（支持 `a.b`）
- **返回**：仅含指定字段的新对象（数组或单条）

## 2. 过滤 `filter`

按条件过滤列表，字段名支持 `.` 子字段。
只支持列表处理。

```typescript
type DataRecordFilter = {
    key: string;
    operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | '~' | '!~';
    value: string | number | boolean | string[];
};

type DataRecordFilterGroup = {
    operator: 'AND' | 'OR';
    conditions: DataRecordFilter[];
};

function filterData(data: DataRecord[], filterGroups: DataRecordFilterGroup[]): DataRecord[];
```

- **参数**：`data` 列表
- **参数**：`filterGroups` 过滤条件组
- **返回**：过滤后的列表

## 3. 模糊搜索 `search`

对列表做大小写不敏感的模糊匹配。
只支持列表处理。

```typescript
function searchData(
  data: DataRecord[],
  keywordGroups: string[],
  searchFields?: string[],
): DataRecord[];
```

- **参数**：`keywordGroups` 每个元素是一个关键词串，`searchFields` 指定搜索字段（缺省搜全部字段）
- **返回**：匹配后的列表

## 4. 排序 `sort`

只支持列表处理。

```typescript
type SortExpr = `${string}:${'asc' | 'desc'}`;

type SortFn = (a: DataRecord, b: DataRecord) => number;

function sortData(data: DataRecord[], sortFields: (SortExpr | SortFn)[]): DataRecord[];
```

- **参数**：`sortFields` 排序字段列表，每个元素可以是字段名或排序函数
- **返回**：排序后的新列表（不可变，内部 copy）；数值字段按数字比较，否则按字符串 `localeCompare`

## 5. 限制数量 `limit`

限制返回列表的数量，在排序之后、摘取之前截断。
只支持列表处理，不改变服务端返回的页大小。

- **参数**：`limit` 期望的最大返回数量（字符串形式，便于 CLI 传参）
- **取值**：非负整数；为空、非数字或负数时忽略（不限制）

## 6. 串联编排

为体现“过滤 → 搜索 → 排序 → 限制数量 → 摘取”的执行顺序，可定义聚合方法：

```typescript
interface ProcessListOptions {
  filter?: string[];
  search?: string[];
  searchFields?: string[];
  sort?: string;
  limit?: string;
  pick?: string[];
}

interface ProcessSingleOptions {
  pick?: string[];
}

function processData(data: DataRecord[], options: ProcessListOptions): DataRecord[];
function processData(data: DataRecord, options: ProcessSingleOptions): DataRecord;
```

`limit` 同时作为高阶 `request()` 的调用选项：本次调用优先，缺省时回落到全局默认 `limit`。
