declare const __ZENTAO_API_BUILD__: string;
declare const __ZENTAO_API_VERSION__: string;

const fallbackBuild = 'development';
const fallbackVersion = '0.0.0-dev';

/**
 * 构建标识，由构建脚本通过 `__ZENTAO_API_BUILD__` 注入。
 *
 * 通常是 commit hash 或 CI 构建号；本地 `tsc` 直接编译时回落为 `'development'`。
 */
export const BUILD = typeof __ZENTAO_API_BUILD__ === 'string' ? __ZENTAO_API_BUILD__ : fallbackBuild;

/**
 * SDK 版本号，由构建脚本通过 `__ZENTAO_API_VERSION__` 注入。
 *
 * 通常等于 `package.json` 的 `version` 字段；本地 `tsc` 直接编译时回落为 `'0.0.0-dev'`。
 */
export const VERSION = typeof __ZENTAO_API_VERSION__ === 'string' ? __ZENTAO_API_VERSION__ : fallbackVersion;
