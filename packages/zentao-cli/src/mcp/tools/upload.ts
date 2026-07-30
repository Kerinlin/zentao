import { basename } from 'node:path';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { assertUploadableImagePath } from '../../commands/upload.js';
import type { AuthProvider } from '../server.js';
import { jsonResult, loadAuthContext, wrapTool } from '../common.js';

async function handleUploadImage(
    input: { path: string; absolute?: boolean },
    auth: AuthProvider,
) {
    const { client } = await loadAuthContext(auth);
    const fp = assertUploadableImagePath(input.path);
    const fileName = basename(fp);
    const data = new Uint8Array(readFileSync(fp));
    const result = await client.uploadImage({ fileName, data });
    const useAbsolute = input.absolute === true;
    return jsonResult({
        fileName: result.fileName,
        url: useAbsolute ? result.absoluteUrl : result.url,
        absoluteUrl: result.absoluteUrl,
        path: fp,
    });
}

export function registerUploadTools(server: McpServer, auth: AuthProvider): void {
    server.tool(
        'upload_image',
        '上传本地图片到禅道富文本图床，返回可写入 Bug steps 的 URL（默认相对路径）',
        {
            path: z.string().describe('本地图片绝对或相对路径'),
            absolute: z.boolean().optional().describe('为 true 时 url 使用绝对地址；默认 false'),
        },
        { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
        async (input) => wrapTool(() => handleUploadImage(input as { path: string; absolute?: boolean }, auth)),
    );
}
