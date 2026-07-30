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

/** Documented for AI: client-side filter syntax (same as CLI --filter). */
export const LIST_BUGS_FILTER_GUIDE = [
    '客户端过滤（仅作用于本页返回数据，非整库服务端查询）。',
    '语法: field op value；单条内逗号=AND；多条 filter=OR。',
    '运算符: = 或 :（等于）、!=、>、<、>=、<=、~（包含）、!~（不包含）。',
    '常用字段: status、assignedTo、openedBy、pri、severity、type、title、product、project、confirmed。',
    'status 取值: active | resolved | closed；关单后 assignedTo 常为 closed。',
    '示例: status=active | status!=closed | assignedTo=pgtmn | openedBy=pgtmn | pri<=2 | title~登录',
    '示例数组: ["status=active"]；AND: ["status=active,pri<=2"]；OR: ["status=active","status=resolved"]。',
].join(' ');

export const listBugsSchema = {
    projectId: z.number().optional().describe('项目 ID（与 productId/executionId 三选一）'),
    productId: z.number().optional().describe('产品 ID（与 projectId/executionId 三选一）'),
    executionId: z.number().optional().describe('执行 ID（与 projectId/productId 三选一）'),
    page: z.number().optional().describe('页码，默认 1'),
    recPerPage: z.number().optional().describe('每页条数，默认 1000（API 上限 1000）'),
    browseType: z.enum(BROWSE_TYPES).optional().describe(
        '服务端浏览预设，默认 all。字段级筛选请用 filter，勿依赖 browseType 表达 status/指派人',
    ),
    orderBy: z.string().optional().describe('服务端排序，默认 id_desc（新→旧）；可选 severity_asc、title_desc 等'),
    filter: z.array(z.string()).optional().describe(LIST_BUGS_FILTER_GUIDE),
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
    filter?: string[];
    pick?: string;
}, auth: AuthProvider): Promise<CallToolResult> {
    const scope = resolveListScope(input);
    const page = input.page ?? 1;
    const recPerPage = input.recPerPage ?? 1000;
    const browseType = input.browseType ?? 'all';
    const orderBy = input.orderBy ?? 'id_desc';
    const filter = input.filter?.map((s) => s.trim()).filter(Boolean) ?? [];

    const queryParams: Record<string, unknown> = { browseType, orderBy };

    const execution = await runBugAction(auth, 'list', {
        ...scope,
        page: String(page),
        recPerPage: String(recPerPage),
        pick: input.pick,
        filter: filter.length > 0 ? filter : undefined,
        params: bodyParams(queryParams),
    });

    const data = omitStepsUnlessPicked(execution.data, input.pick);
    const list = Array.isArray(data) ? data : [];
    const serverTotal = execution.pager?.recTotal;
    const response: Record<string, unknown> = {
        data: list,
        /** 实际返回条数（若使用了 filter，为滤后条数） */
        count: list.length,
        /** 本次生效的查询/筛选条件，供 AI 核对 */
        applied: {
            scope,
            page,
            recPerPage,
            browseType,
            orderBy,
            filter: filter.length > 0 ? filter : null,
            pick: input.pick ?? null,
            filterMode: filter.length > 0 ? 'client_page' : 'none',
            filterGuide: LIST_BUGS_FILTER_GUIDE,
        },
    };
    if (execution.pager) {
        response.pager = {
            ...execution.pager,
            /** 服务端滤前总数；有 filter 时不等于 count */
            note: filter.length > 0
                ? 'pager 为服务端滤前分页；滤后条数见 count / data.length'
                : undefined,
        };
    }

    const content: CallToolResult['content'] = [{
        type: 'text',
        text: JSON.stringify(response, null, 2),
    }];

    if (serverTotal === 0) {
        content.push({
            type: 'text',
            text: '提示：服务端未返回任何数据（recTotal=0）。可能原因：账号无权限、scope 无效、或参数被拒绝。建议：1) get_current_user 确认账号；2) 检查 projectId/productId/工作区；3) browseType=all 并用 filter 收窄。',
        });
    } else if (filter.length > 0 && list.length === 0) {
        content.push({
            type: 'text',
            text: `提示：服务端本页有数据（recTotal=${serverTotal}），但 filter 后 count=0。filter 只作用于当前页。可检查条件、增大 recPerPage（≤1000）、确认 orderBy=id_desc，或放宽 filter。当前 filter=${JSON.stringify(filter)}`,
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
        [
            '获取 Bug 列表。范围：projectId/productId/executionId 或当前工作区。',
            '默认 browseType=all、orderBy=id_desc、recPerPage=1000；字段筛选用 filter（客户端本页过滤，语法同 CLI --filter）。',
            '返回 data、count、applied（含 filter 与 filterGuide）、pager。',
            '默认省略 steps；需要时用 pick 指定。',
        ].join(' '),
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
