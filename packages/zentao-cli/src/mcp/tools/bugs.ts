import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ZentaoError } from '../../errors.js';
import type { AuthProvider } from '../server.js';
import {
    bodyParams,
    jsonResult,
    loadAuthContext,
    omitStepsUnlessPicked,
    resolveListScope,
    runBugAction,
    wrapTool,
} from '../common.js';

const BROWSE_TYPES = ['all', 'unclosed', 'assignedtome', 'openedbyme', 'assignedbyme'] as const;
const RESOLUTIONS = [
    'fixed',
    'notrepro',
    'bydesign',
    'duplicate',
    'external',
    'postponed',
    'willnotfix',
    'tostory',
] as const;

const BUG_TYPE = z.enum([
    'codeerror',
    'config',
    'install',
    'security',
    'performance',
    'standard',
    'automation',
    'designdefect',
    'others',
]).optional();

export const listBugsSchema = {
    projectId: z.number().optional().describe('项目 ID（与 productId/executionId 三选一）'),
    productId: z.number().optional().describe('产品 ID（与 projectId/executionId 三选一）'),
    executionId: z.number().optional().describe('执行 ID（与 projectId/productId 三选一）'),
    page: z.number().optional().describe('页码，默认 1'),
    recPerPage: z.number().optional().describe('每页条数，默认 250'),
    browseType: z.enum(BROWSE_TYPES).optional().describe('浏览类型，默认 unclosed'),
    orderBy: z.string().optional().describe('排序，如 id_desc、severity_asc'),
    pick: z.string().optional().describe('摘取字段（逗号分隔）；未指定时默认省略 steps'),
};

export const createBugSchema = {
    title: z.string().describe('Bug 标题'),
    productId: z.number().optional().describe('产品 ID；缺省用当前工作区 product'),
    projectId: z.number().optional().describe('项目 ID；缺省用当前工作区 project'),
    executionId: z.number().optional().describe('执行 ID；缺省用当前工作区 execution'),
    openedBuild: z.array(z.string()).optional().describe('影响版本，默认 ["trunk"]'),
    severity: z.number().optional().describe('严重程度，默认 3'),
    pri: z.number().optional().describe('优先级，默认 3'),
    type: BUG_TYPE.describe('Bug 类型'),
    steps: z.string().optional().describe('重现步骤（Markdown/HTML）'),
    story: z.number().optional().describe('相关需求 ID'),
    assignedTo: z.string().optional().describe('指派给（用户账号）'),
};

async function handleListBugs(input: {
    projectId?: number;
    productId?: number;
    executionId?: number;
    page?: number;
    recPerPage?: number;
    browseType?: (typeof BROWSE_TYPES)[number];
    orderBy?: string;
    pick?: string;
}, auth: AuthProvider): Promise<CallToolResult> {
    const scope = resolveListScope(input);
    const page = input.page ?? 1;
    const recPerPage = input.recPerPage ?? 250;
    const browseType = input.browseType ?? 'unclosed';

    const queryParams: Record<string, unknown> = { browseType };
    if (input.orderBy) queryParams.orderBy = input.orderBy;

    const execution = await runBugAction(auth, 'list', {
        ...scope,
        page: String(page),
        recPerPage: String(recPerPage),
        pick: input.pick,
        params: bodyParams(queryParams),
    });

    const data = omitStepsUnlessPicked(execution.data, input.pick);
    const response: Record<string, unknown> = { data };
    if (execution.pager) response.pager = execution.pager;

    const content: CallToolResult['content'] = [{
        type: 'text',
        text: JSON.stringify(response, null, 2),
    }];

    if (execution.pager && execution.pager.recTotal === 0) {
        content.push({
            type: 'text',
            text: '提示：服务端未返回任何数据（recTotal=0）。可能原因：账号无权限、scope 无效、或参数被拒绝。建议：1) get_current_user 确认账号；2) browseType=assignedtome；3) 检查 projectId/productId/工作区。',
        });
    }

    return { content };
}

async function handleGetBug(input: { id: number }, auth: AuthProvider) {
    const execution = await runBugAction(auth, 'get', { id: String(input.id) });
    return jsonResult(execution.data);
}

async function handleCreateBug(input: {
    title: string;
    productId?: number;
    projectId?: number;
    executionId?: number;
    openedBuild?: string[];
    severity?: number;
    pri?: number;
    type?: string;
    steps?: string;
    story?: number;
    assignedTo?: string;
}, auth: AuthProvider) {
    const { workspace } = await loadAuthContext(auth);
    const productID = input.productId ?? workspace?.product?.id;
    if (productID == null) {
        throw new ZentaoError('E2003', { fields: 'productId', module: 'bug' });
    }

    const project = input.projectId ?? workspace?.project?.id;
    const execution = input.executionId ?? workspace?.execution?.id;

    const body: Record<string, unknown> = {
        productID,
        title: input.title,
        openedBuild: input.openedBuild?.length ? input.openedBuild : ['trunk'],
        project,
        execution,
        severity: input.severity,
        pri: input.pri,
        type: input.type,
        steps: input.steps,
        story: input.story,
        assignedTo: input.assignedTo,
    };

    const result = await runBugAction(auth, 'create', {
        params: bodyParams(body),
    });
    return jsonResult(result.data ?? result.rawResponse);
}

async function handleUpdateBug(input: {
    id: number;
    title?: string;
    severity?: number;
    pri?: number;
    type?: string;
    openedBuild?: string[];
    steps?: string;
    projectId?: number;
    executionId?: number;
    story?: number;
    assignedTo?: string;
}, auth: AuthProvider) {
    const body: Record<string, unknown> = {
        title: input.title,
        severity: input.severity,
        pri: input.pri,
        type: input.type,
        openedBuild: input.openedBuild,
        steps: input.steps,
        project: input.projectId,
        execution: input.executionId,
        story: input.story,
        assignedTo: input.assignedTo,
    };
    const params = bodyParams(body);
    if (!params) {
        throw new ZentaoError('E2003', { fields: 'title|severity|pri|type|steps|…', module: 'bug' });
    }

    const result = await runBugAction(auth, 'update', {
        id: String(input.id),
        params,
    });
    return jsonResult(result.data ?? result.rawResponse);
}

async function handleDeleteBug(input: { id: number }, auth: AuthProvider) {
    const result = await runBugAction(auth, 'delete', { id: String(input.id), yes: true });
    return jsonResult(result.data ?? result.rawResponse ?? { status: 'success', id: input.id });
}

async function handleResolveBug(input: {
    id: number;
    resolution: (typeof RESOLUTIONS)[number];
    resolvedBuild?: string;
    assignedTo?: string;
    comment?: string;
    resolvedDate?: string;
}, auth: AuthProvider) {
    const result = await runBugAction(auth, 'resolve', {
        id: String(input.id),
        params: bodyParams({
            resolution: input.resolution,
            resolvedBuild: input.resolvedBuild,
            assignedTo: input.assignedTo,
            comment: input.comment,
            resolvedDate: input.resolvedDate,
        }),
    });
    return jsonResult(result.data ?? result.rawResponse);
}

async function handleCloseBug(input: { id: number; comment?: string }, auth: AuthProvider) {
    const result = await runBugAction(auth, 'close', {
        id: String(input.id),
        params: bodyParams({ comment: input.comment }),
    });
    return jsonResult(result.data ?? result.rawResponse);
}

async function handleActivateBug(input: {
    id: number;
    openedBuild?: string[];
    assignedTo?: string;
    comment?: string;
}, auth: AuthProvider) {
    const result = await runBugAction(auth, 'activate', {
        id: String(input.id),
        params: bodyParams({
            openedBuild: input.openedBuild,
            assignedTo: input.assignedTo,
            comment: input.comment,
        }),
    });
    return jsonResult(result.data ?? result.rawResponse);
}

const writeAnn = { readOnlyHint: false, destructiveHint: false, openWorldHint: true } as const;
const readAnn = { readOnlyHint: true, destructiveHint: false, openWorldHint: true } as const;
const deleteAnn = { readOnlyHint: false, destructiveHint: true, openWorldHint: true } as const;

export function registerBugTools(server: McpServer, auth: AuthProvider): void {
    server.tool(
        'list_bugs',
        '获取 Bug 列表。可按 projectId/productId/executionId 指定范围，缺省用当前工作区。默认省略 steps 字段。',
        listBugsSchema,
        readAnn,
        async (input) => wrapTool(() => handleListBugs(input as Parameters<typeof handleListBugs>[0], auth)),
    );

    server.tool(
        'get_bug',
        '获取 Bug 详情（含 steps）',
        {
            id: z.number().describe('Bug ID'),
        },
        readAnn,
        async (input) => wrapTool(() => handleGetBug(input as { id: number }, auth)),
    );

    server.tool(
        'create_bug',
        '创建 Bug。productId 可缺省用工作区；openedBuild 默认 ["trunk"]',
        createBugSchema,
        writeAnn,
        async (input) => wrapTool(() => handleCreateBug(input as Parameters<typeof handleCreateBug>[0], auth)),
    );

    server.tool(
        'update_bug',
        '修改 Bug 字段（不含状态流转；解决/关闭/激活请用对应 tool）',
        {
            id: z.number().describe('Bug ID'),
            title: z.string().optional().describe('标题'),
            severity: z.number().optional().describe('严重程度'),
            pri: z.number().optional().describe('优先级'),
            type: BUG_TYPE.describe('Bug 类型'),
            openedBuild: z.array(z.string()).optional().describe('影响版本'),
            steps: z.string().optional().describe('重现步骤'),
            projectId: z.number().optional().describe('项目 ID'),
            executionId: z.number().optional().describe('执行 ID'),
            story: z.number().optional().describe('相关需求 ID'),
            assignedTo: z.string().optional().describe('指派给'),
        },
        writeAnn,
        async (input) => wrapTool(() => handleUpdateBug(input as Parameters<typeof handleUpdateBug>[0], auth)),
    );

    server.tool(
        'delete_bug',
        '删除 Bug（不可恢复）',
        {
            id: z.number().describe('Bug ID'),
        },
        deleteAnn,
        async (input) => wrapTool(() => handleDeleteBug(input as { id: number }, auth)),
    );

    server.tool(
        'resolve_bug',
        '解决 Bug',
        {
            id: z.number().describe('Bug ID'),
            resolution: z.enum(RESOLUTIONS).describe('解决方案'),
            resolvedBuild: z.string().optional().describe('解决版本，trunk 为主干'),
            assignedTo: z.string().optional().describe('指派给'),
            comment: z.string().optional().describe('备注'),
            resolvedDate: z.string().optional().describe('解决日期，默认今天'),
        },
        writeAnn,
        async (input) => wrapTool(() => handleResolveBug(input as Parameters<typeof handleResolveBug>[0], auth)),
    );

    server.tool(
        'close_bug',
        '关闭 Bug',
        {
            id: z.number().describe('Bug ID'),
            comment: z.string().optional().describe('备注'),
        },
        writeAnn,
        async (input) => wrapTool(() => handleCloseBug(input as { id: number; comment?: string }, auth)),
    );

    server.tool(
        'activate_bug',
        '激活 Bug',
        {
            id: z.number().describe('Bug ID'),
            openedBuild: z.array(z.string()).optional().describe('影响版本'),
            assignedTo: z.string().optional().describe('指派给'),
            comment: z.string().optional().describe('备注'),
        },
        writeAnn,
        async (input) => wrapTool(() => handleActivateBug(input as Parameters<typeof handleActivateBug>[0], auth)),
    );
}
