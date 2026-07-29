import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { ZentaoError } from '../errors.js';
import type { ModuleActionOptions } from '../types/index.js';
import { markdownStepsToHtml } from '../utils/markdown-steps.js';

const ACTION_NAME_ALIASES: Record<string, string> = {
    ls: 'list',
};

/** 将 actionName 归一化（如 `ls` → `list`） */
export function normalizeActionName(actionName: string): string {
    return ACTION_NAME_ALIASES[actionName] ?? actionName;
}

/**
 * 若存在 `--steps-file` / `stepsFile`，读取 Markdown 并转为轻量 HTML 写入 `steps`。
 *
 * - 与显式 `steps` 互斥（E2009）
 * - 无 file 时恒等（`--steps` / `--data.steps` 原样透传）
 * - 转换后删除 file 相关键，避免脏字段进入 SDK
 */
export function applyStepsFile(params: Record<string, unknown>): Record<string, unknown> {
    const fileRaw = params.stepsFile ?? params['steps-file'];
    if (fileRaw === undefined || fileRaw === null || fileRaw === '') {
        return params;
    }

    if (typeof fileRaw !== 'string') {
        throw new ZentaoError('E2010', {
            option: 'steps-file',
            type: 'string',
            actualType: typeof fileRaw,
        });
    }

    if (Object.prototype.hasOwnProperty.call(params, 'steps') && params.steps !== undefined) {
        throw new ZentaoError('E2009', {
            option: 'steps-file',
            reason: '不能与 --steps 同时使用',
        });
    }

    // Also reject steps nested only via --data JSON string (best-effort parse).
    if (typeof params.data === 'string') {
        try {
            const dataObj = JSON.parse(params.data) as Record<string, unknown>;
            if (
                dataObj &&
                typeof dataObj === 'object' &&
                Object.prototype.hasOwnProperty.call(dataObj, 'steps') &&
                dataObj.steps !== undefined
            ) {
                throw new ZentaoError('E2009', {
                    option: 'steps-file',
                    reason: '不能与 --data 中的 steps 同时使用',
                });
            }
        } catch (error) {
            if (error instanceof ZentaoError) throw error;
            // Invalid JSON left for later E2007 handling.
        }
    }

    const fp = resolve(fileRaw);
    if (!existsSync(fp) || !statSync(fp).isFile()) {
        throw new ZentaoError('E2011', { path: fp });
    }

    const content = readFileSync(fp, 'utf8');
    if (!content.trim()) {
        throw new ZentaoError('E2009', {
            option: 'steps-file',
            reason: 'steps 文件内容为空',
        });
    }

    const next: Record<string, unknown> = { ...params };
    next.steps = markdownStepsToHtml(content);
    delete next.stepsFile;
    delete next['steps-file'];
    return next;
}

/**
 * 将 CLI 选项与位置参数组装成 SDK `request()` 可消费的参数对象。
 *
 * 负责 CLI 专属的 argv 解析：
 * - 位置参数中的对象 ID（支持逗号分隔的批量 ID 由上层先行拆分）
 * - 位置参数中的 `{...}` JSON 作为请求体（写入 `params.data`）
 * - `--key=value` 形式的额外参数（带基础类型转换）
 * - `--params` 指定的 JSON 对象（浅合并到 params）
 * - `--steps-file` 读取 Markdown 并转为 steps HTML
 *
 * 路径、查询、请求体的最终拼装由 SDK 的 `resolveModuleCommand` 完成。
 */
export function buildParams(
    options: ModuleActionOptions,
    actionName: string,
    args?: string[],
): Record<string, unknown> {
    const params: Record<string, unknown> = { ...options };

    const extraArgs = args ? [...args] : [];
    if (extraArgs.length > 0 && extraArgs[0] === actionName) {
        extraArgs.shift();
    }

    let positionalID: string | undefined;
    if (extraArgs.length > 0 && !extraArgs[0].startsWith('-')) {
        const candidate = extraArgs[0].trim();
        const idParts = candidate.split(',').map((part) => part.trim()).filter(Boolean);
        const isNumericID = idParts.length > 0 && idParts.every((part) => /^\d+$/.test(part));
        if (isNumericID) {
            positionalID = candidate;
            extraArgs.shift();
        } else if (params.data === undefined && candidate.startsWith('{') && candidate.endsWith('}')) {
            params.data = candidate;
            extraArgs.shift();
        }
    }

    if (options.params) {
        try {
            Object.assign(params, JSON.parse(options.params));
        } catch {
            throw new ZentaoError('E2009', { option: 'params', reason: '不是有效的 JSON 对象' });
        }
    }

    for (const arg of extraArgs) {
        // Note: `.` does not match newlines — multi-line --key=value is intentionally
        // unsupported; use --steps-file for multi-line Markdown steps.
        const match = arg.match(/^--(\w[\w.-]*)=(.*)$/);
        if (!match) continue;
        const key = match[1];
        let value: unknown = match[2];
        if (value === 'true') value = true;
        else if (value === 'false') value = false;
        else if (/^\d+$/.test(value as string)) value = Number(value);
        params[key] = value;
    }

    if (positionalID !== undefined) {
        params.id = positionalID;
    }

    return applyStepsFile(params);
}
