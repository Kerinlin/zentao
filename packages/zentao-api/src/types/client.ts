import type { ZentaoClient } from '../client/index.js';

/** 创建 {@link ZentaoClient} 时使用的配置。 */
export interface ZentaoClientOptions {
  /** 禅道站点根地址，例如 `https://zentao.example.com`；SDK 会自动拼接 `/api.php/v2`。 */
  baseUrl: string;
  /** 禅道 API Token；未提供时可稍后通过 {@link ZentaoClient.login} 获取并写入实例。 */
  token?: string;
  /** 默认请求超时时间，单位毫秒。 */
  timeout?: number;
  /** 是否跳过 TLS 证书验证；仅 Node.js 运行时支持，浏览器中会抛错。 */
  insecure?: boolean;
}

/** SDK 支持的 HTTP 方法。 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

/** 请求体序列化方式。 */
export type ClientRequestBodyType = 'json' | 'form' | 'raw';

/** 响应体解析方式。 */
export type ClientResponseType = 'auto' | 'json' | 'text' | 'arrayBuffer' | 'blob' | 'response';

/** `ZentaoClient.request()` 的单次请求选项。 */
export interface ClientRequestOptions {
  /** HTTP 方法，默认 `GET`。 */
  method?: HttpMethod;
  /** 请求体；`GET` 请求会忽略该字段。普通对象默认按 JSON 发送，`FormData` / `Blob` / `ArrayBuffer` 等会原样发送。 */
  body?: unknown;
  /** 请求体序列化方式。默认 `json`；传入 `FormData` 等原生 body 时会自动按 `raw` 处理。 */
  bodyType?: ClientRequestBodyType;
  /** 响应体解析方式。默认 `auto`，会优先尝试 JSON，失败后回落为文本。 */
  responseType?: ClientResponseType;
  /** 额外请求头；会与 SDK 自动注入的 `Token` / `Content-Type` 合并。 */
  headers?: HeadersInit;
  /** URL 查询参数；`undefined` 值会被跳过。 */
  query?: Record<string, string | number | boolean | undefined>;
  /** 外部取消信号；会与 SDK 自身的超时控制合并。 */
  signal?: AbortSignal;
  /** 单次请求超时时间，优先级高于全局和客户端默认值。 */
  timeout?: number;
  /** 单次请求 TLS 跳过证书验证选项；仅 Node.js 运行时支持。 */
  insecure?: boolean;
}

/**
 * 上传图片到禅道富文本图床（`file-ajaxUpload`）时的输入。
 *
 * 注意：该接口是站点根路径上的 web 端点，不是 `/api.php/v2` REST API。
 * 需要已配置 API Token；部分实例可将 Token 作为 `zentaosid` 使用。
 */
export interface UploadImageInput {
  /** 原始文件名（用于 Content-Disposition 与 MIME 推断），例如 `screenshot.png`。 */
  fileName: string;
  /** 文件二进制内容；浏览器与 Node 均可用。 */
  data: Blob | ArrayBuffer | Uint8Array | ArrayBufferView;
  /** 可选 MIME；未传时按 `fileName` 扩展名推断，未知时为 `application/octet-stream`。 */
  contentType?: string;
  /** 单次请求超时（毫秒）；优先级高于客户端默认。 */
  timeout?: number;
  /** 单次请求是否跳过 TLS 校验；仅 Node.js。 */
  insecure?: boolean;
  /** 外部取消信号。 */
  signal?: AbortSignal;
}

/** {@link import('../client/index.js').ZentaoClient.uploadImage} 的成功结果。 */
export interface UploadImageResult {
  /** 服务端返回的相对路径，例如 `/zentao/file-read-8752.png`。 */
  url: string;
  /** 可直接访问的绝对 URL（由站点 origin 与相对路径拼接）。 */
  absoluteUrl: string;
  /** 上传时使用的文件名。 */
  fileName: string;
}
