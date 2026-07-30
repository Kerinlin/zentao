import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthProvider } from '../server.js';
import {
    bodyParams,
    listResult,
    omitFieldsUnlessPicked,
    resolveBuildScope,
    runModuleAction,
    wrapTool,
} from '../common.js';

const readAnn = { readOnlyHint: true, destructiveHint: false, openWorldHint: true } as const;

const PRODUCT_BROWSE = ['all', 'noclosed', 'closed'] as const;
const PROJECT_BROWSE = ['all', 'undone', 'wait', 'doing'] as const;
const USER_BROWSE = ['inside', 'outside'] as const;

/** Heavy fields stripped from list rows when pick is omitted. */
const PRODUCT_OMIT = ['desc', 'PO', 'QD', 'RD', 'feedback', 'ticket'];
const PROJECT_OMIT = ['desc', 'team', 'whitelist'];
const BUILD_OMIT = ['desc', 'scmPath', 'filePath'];
const USER_OMIT = ['password', 'token', 'email', 'mobile', 'phone', 'address', 'commiter', 'visits', 'ip', 'last', 'fails', 'locked'];

export const listProductsSchema = {
    page: z.number().optional().describe('页码，默认 1'),
    recPerPage: z.number().optional().describe('每页条数，默认 250'),
    browseType: z.enum(PRODUCT_BROWSE).optional().describe('浏览类型，默认 noclosed'),
    orderBy: z.string().optional().describe('排序，如 id_desc、title_asc'),
    pick: z.string().optional().describe('摘取字段（逗号分隔）；未指定时默认省略 desc 等大字段'),
};

export const listProjectsSchema = {
    page: z.number().optional().describe('页码，默认 1'),
    recPerPage: z.number().optional().describe('每页条数，默认 250'),
    browseType: z.enum(PROJECT_BROWSE).optional().describe('浏览类型，默认 undone'),
    orderBy: z.string().optional().describe('排序，如 id_desc、name_asc'),
    pick: z.string().optional().describe('摘取字段（逗号分隔）；未指定时默认省略 desc 等大字段'),
};

export const listBuildsSchema = {
    projectId: z.number().optional().describe('项目 ID（与 executionId 二选一；缺省用工作区 project/execution）'),
    executionId: z.number().optional().describe('执行 ID（与 projectId 二选一）'),
    page: z.number().optional().describe('页码，默认 1'),
    recPerPage: z.number().optional().describe('每页条数，默认 250'),
    pick: z.string().optional().describe('摘取字段（逗号分隔）；未指定时默认省略 desc 等'),
};

export const listUsersSchema = {
    page: z.number().optional().describe('页码，默认 1'),
    recPerPage: z.number().optional().describe('每页条数，默认 250'),
    browseType: z.enum(USER_BROWSE).optional().describe('浏览类型，默认 inside（内部用户）'),
    orderBy: z.string().optional().describe('排序，如 account_asc、realname_asc'),
    pick: z.string().optional().describe('摘取字段（逗号分隔）；未指定时默认省略敏感/大字段'),
};

async function handleListProducts(input: {
    page?: number;
    recPerPage?: number;
    browseType?: (typeof PRODUCT_BROWSE)[number];
    orderBy?: string;
    pick?: string;
}, auth: AuthProvider) {
    const page = input.page ?? 1;
    const recPerPage = input.recPerPage ?? 250;
    const browseType = input.browseType ?? 'noclosed';
    const query: Record<string, unknown> = { browseType };
    if (input.orderBy) query.orderBy = input.orderBy;

    const execution = await runModuleAction(auth, 'product', 'list', {
        page: String(page),
        recPerPage: String(recPerPage),
        pick: input.pick,
        params: bodyParams(query),
    });
    const data = omitFieldsUnlessPicked(execution.data, input.pick, PRODUCT_OMIT);
    return listResult(execution, data);
}

async function handleListProjects(input: {
    page?: number;
    recPerPage?: number;
    browseType?: (typeof PROJECT_BROWSE)[number];
    orderBy?: string;
    pick?: string;
}, auth: AuthProvider) {
    const page = input.page ?? 1;
    const recPerPage = input.recPerPage ?? 250;
    const browseType = input.browseType ?? 'undone';
    const query: Record<string, unknown> = { browseType };
    if (input.orderBy) query.orderBy = input.orderBy;

    const execution = await runModuleAction(auth, 'project', 'list', {
        page: String(page),
        recPerPage: String(recPerPage),
        pick: input.pick,
        params: bodyParams(query),
    });
    const data = omitFieldsUnlessPicked(execution.data, input.pick, PROJECT_OMIT);
    return listResult(execution, data);
}

async function handleListBuilds(input: {
    projectId?: number;
    executionId?: number;
    page?: number;
    recPerPage?: number;
    pick?: string;
}, auth: AuthProvider) {
    const scope = resolveBuildScope(input);
    const page = input.page ?? 1;
    const recPerPage = input.recPerPage ?? 250;

    const execution = await runModuleAction(auth, 'build', 'list', {
        ...scope,
        page: String(page),
        recPerPage: String(recPerPage),
        pick: input.pick,
    });
    const data = omitFieldsUnlessPicked(execution.data, input.pick, BUILD_OMIT);
    return listResult(execution, data);
}

async function handleListUsers(input: {
    page?: number;
    recPerPage?: number;
    browseType?: (typeof USER_BROWSE)[number];
    orderBy?: string;
    pick?: string;
}, auth: AuthProvider) {
    const page = input.page ?? 1;
    const recPerPage = input.recPerPage ?? 250;
    const browseType = input.browseType ?? 'inside';
    const query: Record<string, unknown> = { browseType };
    if (input.orderBy) query.orderBy = input.orderBy;

    const execution = await runModuleAction(auth, 'user', 'list', {
        page: String(page),
        recPerPage: String(recPerPage),
        pick: input.pick,
        params: bodyParams(query),
    });
    const data = omitFieldsUnlessPicked(execution.data, input.pick, USER_OMIT);
    return listResult(execution, data);
}

export function registerCatalogTools(server: McpServer, auth: AuthProvider): void {
    server.tool(
        'list_products',
        '获取产品列表（Bug 归属 productId 用）',
        listProductsSchema,
        readAnn,
        async (input) => wrapTool(() => handleListProducts(input as Parameters<typeof handleListProducts>[0], auth)),
    );

    server.tool(
        'list_projects',
        '获取项目列表（按项目查 Bug 的 projectId 用）',
        listProjectsSchema,
        readAnn,
        async (input) => wrapTool(() => handleListProjects(input as Parameters<typeof handleListProjects>[0], auth)),
    );

    server.tool(
        'list_builds',
        '获取版本/构建列表（create/resolve Bug 的 openedBuild、resolvedBuild 用）。需 projectId 或 executionId，或工作区已设项目/执行。',
        listBuildsSchema,
        readAnn,
        async (input) => wrapTool(() => handleListBuilds(input as Parameters<typeof handleListBuilds>[0], auth)),
    );

    server.tool(
        'list_users',
        '获取用户列表（指派 assignedTo 用账号）。默认内部用户，自动省略敏感字段。',
        listUsersSchema,
        readAnn,
        async (input) => wrapTool(() => handleListUsers(input as Parameters<typeof handleListUsers>[0], auth)),
    );
}
