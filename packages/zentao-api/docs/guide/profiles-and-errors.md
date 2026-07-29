# Profile 与错误处理

## 持久化登录信息

启用 `persistProfiles` 后，`login()` 成功时会保存站点、账号、token 和客户端配置。

```ts
import { ZentaoClient, setGlobalOptions } from 'zentao-api';

setGlobalOptions({ persistProfiles: true });

const client = new ZentaoClient('https://zentao.example.com');
await client.login('admin', 'password');
```

后续可以从当前 profile 恢复客户端：

```ts
const client = await ZentaoClient.fromProfile();
```

也可以指定 profile key：

```ts
const client = await ZentaoClient.fromProfile('admin@https://zentao.example.com');
```

## 管理 profile

```ts
import {
  addProfile,
  deleteProfile,
  getAllProfiles,
  getProfile,
  switchProfile,
} from 'zentao-api';

const profiles = await getAllProfiles();
const active = await switchProfile(profiles[0].key);
const profile = await getProfile(active.key);

await addProfile({
  server: 'https://zentao.example.com',
  account: 'admin',
  token: 'your-token',
});

await deleteProfile('admin@https://zentao.example.com');
```

## 错误处理

SDK 会把 HTTP、网络、超时、环境限制和模块解析错误包装为 `ZentaoError`。

```ts
import { ZentaoError } from 'zentao-api';

try {
  await client.get('/products');
} catch (error) {
  if (error instanceof ZentaoError) {
    console.error(error.code);
    console.error(error.message);
    console.error(error.details);
  }
}
```

禅道服务端返回 `{ status: "fail" }` 时，SDK 默认不会抛出异常，会按响应内容返回。只有传输层错误、超时、无效模块或缺少必填参数等 SDK 可预期错误会抛出 `ZentaoError`。

## 把服务端失败响应转为异常

如果业务希望在禅道返回 `{ status: "fail" }` 时直接走异常分支，可以打开 `throwOnFail`。

```ts
import { request, setGlobalOptions } from 'zentao-api';

// 单次调用启用
await request('product/list', {}, { throwOnFail: true });

// 全局启用，所有 request() 调用默认抛错
setGlobalOptions({ throwOnFail: true });
```

启用后失败响应会抛出 `ZentaoError`，错误码为 `E_API_FAILED`，原始归一化响应通过 `error.details` 暴露。

## 常见错误码

| 错误码 | 说明 |
| --- | --- |
| `E_NO_GLOBAL_CLIENT` | 调用 `request()` 时没有全局客户端。 |
| `E_HTTP_ERROR` | HTTP 响应状态码不是 2xx。 |
| `E_NETWORK_ERROR` | 网络请求失败。 |
| `E_TIMEOUT` | 请求超时。 |
| `E_INSECURE_BROWSER` | 浏览器运行时使用了 `insecure`。 |
| `E_INVALID_BASE_URL` | `baseUrl` 不是合法的 http/https URL，或带有查询/锚点。 |
| `E_INVALID_MODULE` | 模块不存在。 |
| `E_INVALID_ACTION` | 模块动作不存在。 |
| `E_INVALID_REQUEST_NAME` | `request()` 名称不是 `module/action` 形式。 |
| `E_MISSING_PARAM` | 缺少必填路径参数或请求体字段。 |
| `E_INVALID_PARAM` | 参数值不合法，例如布尔字段传入了无法识别的取值。 |
| `E_API_FAILED` | 启用 `throwOnFail` 时禅道返回 `{ status: "fail" }`。 |
