import { request } from '@kerin/zentao-api';
import type { ZentaoClient } from '../api/index.js';
import { mapSdkError } from '../errors.js';
import {
    applyWorkspaceDefaults,
    formatWorkspaceInjectHint,
    workspaceHasScope,
    type WorkspaceInjection,
} from '../config/workspace.js';
import type {
    ListPagerInfo,
    ModuleAction,
    ModuleActionName,
    ModuleActionOptions,
    ModuleDefinition,
    UserConfig,
    Workspace,
} from '../types/index.js';
import { filterData, pickFields, pickFieldsSingle, searchData, sortData } from '../utils/data.js';
import { convertHtmlFields, convertHtmlFieldsInArray } from '../utils/html.js';
import { buildParams, normalizeActionName } from './args.js';
import { getAction } from './helper.js';
import { ZentaoError } from '../errors.js';

export interface ModuleExecutionResult {
    /** 解析到的动作定义 */
    action: ModuleAction;
    /** 经提取与本地后处理后的业务数据 */
    data: unknown;
    /** SDK 归一化后的完整响应（供 `--format raw` 使用） */
    rawResponse: unknown;
    /** 分页信息（CLI 字段命名） */
    pager?: ListPagerInfo;
    /** 用户通过 --pick 指定的字段 */
    fields?: string[];
    /** 是否为列表结果 */
    isList: boolean;
    /** 本次从工作区注入的范围参数（供调用方打印提示） */
    workspaceInjected?: WorkspaceInjection;
}

function parseFields(fields?: string): string[] | undefined {
    const parsed = fields?.split(',').map((field) => field.trim()).filter(Boolean);
    return parsed && parsed.length > 0 ? parsed : undefined;
}

/**
 * 执行模块级 CRUD 或扩展操作。
 *
 * 路径解析、查询/请求体组装、update 自动补全（autoFill）与响应提取均交由
 * `zentao-api` 的 {@link request} 处理；CLI 侧仅保留 HTML→Markdown 转换与
 * 客户端过滤/搜索/排序/限制/摘取（语义与既有用法保持一致）。
 */
export async function executeModuleCommand(
    client: ZentaoClient,
    module: ModuleDefinition,
    actionName: ModuleActionName,
    args: string[],
    options: ModuleActionOptions,
    config: UserConfig,
    workspace?: Workspace,
): Promise<ModuleExecutionResult> {
    const action = getAction(module, actionName);
    if (!action) {
        throw new ZentaoError('E2005', { module: module.name });
    }

    // 用户未显式传 product/project/execution 时，用当前工作区补缺省范围
    const built = buildParams(options, actionName, args);
    const { params, injected } = applyWorkspaceDefaults(built, workspace);
    const requestName = `${module.name}/${normalizeActionName(actionName)}`;

    // 仅对「列表 scope 路径」做空工作区预检。
    // 注意：product/delete 的 pathParams.productID 由 params.id 填充，不能当成缺 scope。
    const pathParams = action.pathParams ?? {};
    const needsScope = 'scope' in pathParams;
    if (needsScope) {
        const hasScope =
            !isBlank(params.scope) ||
            !isBlank(params.scopeID) ||
            !isBlank(params.product) ||
            !isBlank(params.productID) ||
            !isBlank(params.project) ||
            !isBlank(params.projectID) ||
            !isBlank(params.execution) ||
            !isBlank(params.executionID);
        if (!hasScope) {
            throw new ZentaoError('E4002');
        }
    }

    // task/list 等：路径依赖外键 executionID，且不是本模块对象 id
    const ownIdKey = `${module.name}ID`;
    for (const key of Object.keys(pathParams)) {
        if (!key.endsWith('ID') || key === 'scopeID' || key === ownIdKey) continue;
        const short = key.slice(0, -2); // executionID → execution
        if (isBlank(params[key]) && isBlank(params[short]) && isBlank(params.id)) {
            throw new ZentaoError('E4002');
        }
    }

    // 人机可读模式下提示本次注入（silent / json / raw 不打扰）
    const format = options.format ?? config.defaultOutputFormat ?? 'markdown';
    const silent = options.silent ?? config.silent ?? false;
    if (!silent && format !== 'json' && format !== 'raw' && workspace) {
        const hint = formatWorkspaceInjectHint(workspace, injected);
        if (hint) {
            console.error(hint);
        }
    }

    let response;
    try {
        // 注意：不向 request() 传递 filter/search/sort/limit/pick，
        // 以保留 CLI 自身的数据处理语义（在下方本地后处理）。
        response = await request(requestName, params, {
            client,
            autoFill: action.type === 'update',
            throwOnFail: true,
            recPerPage: options.recPerPage,
            timeout: options.timeout,
            insecure: options.insecure,
        });
    } catch (error) {
        const mapped = mapSdkError(error);
        // 缺参时若工作区为空，升级为 E4002 指引
        if (
            mapped instanceof ZentaoError &&
            mapped.code === '2003' &&
            workspace &&
            !workspaceHasScope(workspace)
        ) {
            throw new ZentaoError('E4002');
        }
        throw mapped;
    }

    const fields = parseFields(options.pick);
    const pager: ListPagerInfo | undefined = response.pager
        ? {
            pageID: response.pager.page,
            recPerPage: response.pager.recPerPage,
            recTotal: response.pager.total,
        }
        : undefined;

    const injectedMeta = Object.keys(injected).length > 0 ? injected : undefined;

    if (action.type === 'list') {
        let data = (Array.isArray(response.data) ? response.data : []) as Record<string, unknown>[];

        if (config.htmlToMarkdown !== false) {
            data = convertHtmlFieldsInArray(data);
        }
        if (options.filter?.length) {
            data = filterData(data, options.filter);
        }
        if (options.search?.length) {
            data = searchData(data, options.search, options.searchFields?.split(','));
        }
        if (options.sort) {
            data = sortData(data, options.sort);
        }
        if (options.limit && Number(options.limit) < data.length) {
            data = data.slice(0, Number(options.limit));
        }
        if (fields) {
            data = pickFields(data, fields);
        }

        return {
            action,
            data,
            rawResponse: response,
            pager,
            fields,
            isList: true,
            workspaceInjected: injectedMeta,
        };
    }

    if (action.type === 'get') {
        let data = (response.data ?? {}) as Record<string, unknown>;
        if (config.htmlToMarkdown !== false) {
            data = convertHtmlFields(data);
        }
        if (fields) {
            data = pickFieldsSingle(data, fields);
        }

        return {
            action,
            data,
            rawResponse: response,
            fields,
            isList: false,
            workspaceInjected: injectedMeta,
        };
    }

    return {
        action,
        data: response.data,
        rawResponse: response,
        fields,
        isList: false,
        workspaceInjected: injectedMeta,
    };
}

function isBlank(value: unknown): boolean {
    return value === undefined || value === null || value === '';
}
