import type { GlobalOptions } from '../types/index.js';

let globalOptions: GlobalOptions = {};

/**
 * 获取当前全局选项的快照。
 *
 * 返回的是浅拷贝副本，对返回值的修改不会影响内部状态；如需更新请使用 {@link setGlobalOptions}。
 *
 * @returns 当前生效的全局选项快照，参见 {@link GlobalOptions}。
 */
export function getGlobalOptions(): GlobalOptions {
  return { ...globalOptions };
}

/**
 * 以浅合并的方式更新全局选项。
 *
 * 仅覆盖传入 `options` 中显式声明的字段；其余字段保留原值。若希望清空某个字段，
 * 显式传入 `undefined` 即可（会写入 `undefined` 并在后续读取时返回 `undefined`）。
 *
 * @param options - 要合并到全局选项中的字段子集。
 */
export function setGlobalOptions(options: Partial<GlobalOptions>): void {
  globalOptions = { ...globalOptions, ...options };
}
