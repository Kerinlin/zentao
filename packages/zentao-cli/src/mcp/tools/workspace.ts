import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
    listWorkspaces,
    resolveWorkspaceSelector,
    setCurrentWorkspace,
} from '../../config/workspace.js';
import { setWorkspaceFromScopeOptions } from '../../config/workspace-sync.js';
import { ZentaoError } from '../../errors.js';
import type { Workspace } from '../../types/index.js';
import type { AuthProvider } from '../server.js';
import { jsonResult, loadAuthContext, wrapTool } from '../common.js';

function workspacePayload(ws: Workspace, currentId?: number) {
    return {
        id: ws.id,
        name: ws.name ?? '',
        product: ws.product ?? null,
        project: ws.project ?? null,
        execution: ws.execution ?? null,
        lastUsedAt: ws.lastUsedAt ?? null,
        current: currentId != null ? ws.id === currentId : false,
    };
}

async function handleListWorkspaces(auth: AuthProvider) {
    const { profile } = await loadAuthContext(auth);
    const currentId = profile.currentWorkspace;
    const list = listWorkspaces(profile);
    return jsonResult({
        currentWorkspace: currentId ?? null,
        workspaces: list.map((ws) => workspacePayload(ws, currentId)),
    });
}

async function handleCreateWorkspace(
    input: { productId?: number; projectId?: number; executionId?: number; name?: string },
    auth: AuthProvider,
) {
    const { client, profile } = await loadAuthContext(auth);
    if (input.productId == null && input.projectId == null && input.executionId == null) {
        throw new ZentaoError('E2009', {
            option: 'create_workspace',
            reason: '请提供 productId / projectId / executionId 至少一个',
        });
    }

    const ws = await setWorkspaceFromScopeOptions(client, profile, {
        product: input.productId,
        project: input.projectId,
        execution: input.executionId,
        name: input.name,
    });

    return jsonResult({
        status: 'success',
        workspace: workspacePayload(ws, profile.currentWorkspace),
    });
}

async function handleSwitchWorkspace(input: { workspace: string }, auth: AuthProvider) {
    const { profile } = await loadAuthContext(auth);
    const target = resolveWorkspaceSelector(profile, input.workspace);
    const ok = setCurrentWorkspace(profile, target.id);
    if (!ok) throw new ZentaoError('E4001');

    // Reload profile current id after set
    const currentId = profile.currentWorkspace;
    return jsonResult({
        status: 'success',
        workspace: workspacePayload(target, currentId),
    });
}

export function registerWorkspaceTools(server: McpServer, auth: AuthProvider): void {
    server.tool(
        'list_workspaces',
        '列出当前账号下的本地工作区',
        {},
        { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
        async () => wrapTool(() => handleListWorkspaces(auth)),
    );

    server.tool(
        'create_workspace',
        '按产品/项目/执行新建或切换到对应工作区（对齐 zentao workspace add；同主键复用并设为当前）',
        {
            productId: z.number().optional().describe('产品 ID'),
            projectId: z.number().optional().describe('项目 ID'),
            executionId: z.number().optional().describe('执行 ID'),
            name: z.string().optional().describe('工作区名称（可选）'),
        },
        { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
        async (input) => wrapTool(() => handleCreateWorkspace(input as {
            productId?: number;
            projectId?: number;
            executionId?: number;
            name?: string;
        }, auth)),
    );

    server.tool(
        'switch_workspace',
        '切换当前工作区（支持数字 ID 或名称）',
        {
            workspace: z.string().describe('工作区 ID 或名称'),
        },
        { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
        async (input) => wrapTool(() => handleSwitchWorkspace(input as { workspace: string }, auth)),
    );
}
