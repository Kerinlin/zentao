import { basename, extname, resolve } from 'node:path';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { Command } from 'commander';
import { ensureAuth } from '../auth/flow.js';
import { ZentaoError, formatError, mapSdkError } from '../errors.js';
import type { GlobalOptions } from '../types/index.js';
import { formatJson } from '../utils/format.js';

/** Allowed image extensions for CLI-side weak validation (server may still reject). */
export const UPLOAD_IMAGE_EXTENSIONS = new Set([
    'png',
    'jpg',
    'jpeg',
    'gif',
    'webp',
    'bmp',
    'svg',
]);

/** Return true when the path extension is in the CLI image whitelist. */
export function isAllowedImageExt(filePath: string): boolean {
    const ext = extname(filePath).replace(/^\./, '').toLowerCase();
    return UPLOAD_IMAGE_EXTENSIONS.has(ext);
}

export interface UploadSuccessItem {
    path: string;
    fileName: string;
    url: string;
    absoluteUrl: string;
}

export interface UploadFailureItem {
    path: string;
    error: { code: string; message: string };
}

/**
 * Validate a local path for image upload: must exist, be a regular file,
 * and use an allowed image extension.
 */
export function assertUploadableImagePath(localPath: string): string {
    const fp = resolve(localPath);
    if (!existsSync(fp) || !statSync(fp).isFile()) {
        throw new ZentaoError('E2011', { path: fp });
    }
    if (!isAllowedImageExt(fp)) {
        const ext = extname(fp).replace(/^\./, '').toLowerCase() || '(none)';
        throw new ZentaoError('E2012', { ext });
    }
    return fp;
}

/** 注册 `zentao upload`：上传本地图片到禅道富文本图床 */
export function registerUploadCommand(program: Command): void {
    program
        .command('upload')
        .description('上传本地图片到禅道富文本图床，返回可写入 steps 的图片 URL')
        .argument('<files...>', '本地图片路径（可多个，顺序上传）')
        .option('--absolute', '输出绝对 URL（默认输出服务端相对路径）')
        .action(async (files: string[], opts: { absolute?: boolean }) => {
            const globalOpts = program.opts() as GlobalOptions;
            const format = globalOpts.format ?? 'markdown';
            const successes: UploadSuccessItem[] = [];
            const failures: UploadFailureItem[] = [];

            try {
                const { client } = await ensureAuth({
                    insecure: globalOpts.insecure,
                    timeout: globalOpts.timeout,
                });

                for (const raw of files) {
                    let fp: string;
                    try {
                        fp = assertUploadableImagePath(raw);
                    } catch (error) {
                        const mapped = mapSdkError(error);
                        if (mapped instanceof ZentaoError) {
                            failures.push({
                                path: resolve(raw),
                                error: { code: mapped.code, message: mapped.message },
                            });
                            if (format !== 'json' && format !== 'raw' && !globalOpts.silent) {
                                console.error(formatError(mapped, format));
                            }
                            continue;
                        }
                        throw error;
                    }

                    try {
                        const fileName = basename(fp);
                        const data = new Uint8Array(readFileSync(fp));
                        const result = await client.uploadImage({ fileName, data });
                        successes.push({
                            path: fp,
                            fileName: result.fileName,
                            url: result.url,
                            absoluteUrl: result.absoluteUrl,
                        });
                    } catch (error) {
                        const mapped = mapSdkError(error);
                        if (mapped instanceof ZentaoError) {
                            failures.push({
                                path: fp,
                                error: { code: mapped.code, message: mapped.message },
                            });
                            if (format !== 'json' && format !== 'raw' && !globalOpts.silent) {
                                console.error(formatError(mapped, format));
                            }
                            continue;
                        }
                        throw error;
                    }
                }

                if (!globalOpts.silent) {
                    if (format === 'json' || format === 'raw') {
                        const status =
                            failures.length === 0
                                ? 'success'
                                : successes.length === 0
                                    ? 'fail'
                                    : 'partial';
                        const payload: Record<string, unknown> = {
                            status,
                            data: successes,
                        };
                        if (failures.length > 0) {
                            payload.errors = failures;
                        }
                        console.log(formatJson(payload, true));
                    } else {
                        for (const item of successes) {
                            console.log(opts.absolute ? item.absoluteUrl : item.url);
                        }
                    }
                }

                if (failures.length > 0) {
                    process.exitCode = 1;
                }
            } catch (error) {
                const mapped = mapSdkError(error);
                if (mapped instanceof ZentaoError) {
                    console.error(formatError(mapped, format));
                    process.exitCode = 1;
                    return;
                }
                throw error;
            }
        });
}
