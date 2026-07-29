import { request } from '@kerin/zentao-api';
import type { ZentaoClient } from '../api/index.js';
import { ZentaoError, mapSdkError } from '../errors.js';
import type { Profile, Workspace, WorkspaceRef } from '../types/index.js';
import {
    ensureCurrentWorkspace,
    patchWorkspace,
    upsertWorkspaceByScope,
    type WorkspaceScopeRefs,
} from './workspace.js';

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 从禅道对象中提取 { id, name } 引用 */
export function toWorkspaceRef(value: unknown, fallbackId?: number): WorkspaceRef | undefined {
    if (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) {
        const id = Number(value);
        if (Number.isNaN(id) || id <= 0) return undefined;
        return { id, name: `#${id}` };
    }

    if (!isRecord(value)) {
        if (fallbackId !== undefined && !Number.isNaN(fallbackId) && fallbackId > 0) {
            return { id: fallbackId, name: `#${fallbackId}` };
        }
        return undefined;
    }

    const idRaw = value.id ?? fallbackId;
    const id = Number(idRaw);
    if (Number.isNaN(id) || id <= 0) return undefined;

    const nameRaw = value.name ?? value.title ?? value.realname;
    const name = nameRaw !== undefined && nameRaw !== null && String(nameRaw).trim() !== ''
        ? String(nameRaw)
        : `#${id}`;
    return { id, name };
}

/** 解包 client.get / request 返回的对象负载 */
function unwrapObjectPayload(raw: unknown, resultKey?: string): Record<string, unknown> {
    if (!isRecord(raw)) {
        throw new ZentaoError('E2002', { object: resultKey ?? 'object' });
    }

    if (raw.status === 'fail') {
        throw new ZentaoError('E2002', { object: resultKey ?? 'object' }, raw);
    }

    if (resultKey && isRecord(raw[resultKey])) {
        return raw[resultKey] as Record<string, unknown>;
    }
    if (isRecord(raw.data)) {
        return raw.data as Record<string, unknown>;
    }
    if (raw.id !== undefined) {
        return raw;
    }

    throw new ZentaoError('E2002', { object: resultKey ?? 'object' }, raw);
}

function scopeFetchError(kind: WorkspaceScopeKind, id: number, cause?: unknown): ZentaoError {
    return new ZentaoError('E4003', { kind, id: String(id) }, cause);
}

async function fetchProduct(client: ZentaoClient, id: number): Promise<Record<string, unknown>> {
    try {
        const response = await request('product/get', { id }, { client, throwOnFail: true });
        if (isRecord(response.data)) return response.data as Record<string, unknown>;
        throw scopeFetchError('product', id, response);
    } catch (error) {
        if (error instanceof ZentaoError && error.code === '4003') throw error;
        if (error instanceof ZentaoError) throw scopeFetchError('product', id, error);
        throw scopeFetchError('product', id, mapSdkError(error));
    }
}

/**
 * 项目模块注册表无 get 动作，直接走 REST `/projects/{id}`。
 */
async function fetchProject(client: ZentaoClient, id: number): Promise<Record<string, unknown>> {
    try {
        const raw = await client.get(`/projects/${id}`);
        return unwrapObjectPayload(raw, 'project');
    } catch (error) {
        if (error instanceof ZentaoError && error.code === '4003') throw error;
        if (error instanceof ZentaoError && error.code === '2002') throw scopeFetchError('project', id, error);
        if (error instanceof ZentaoError) throw scopeFetchError('project', id, error);
        throw scopeFetchError('project', id, mapSdkError(error));
    }
}

async function fetchExecution(client: ZentaoClient, id: number): Promise<Record<string, unknown>> {
    try {
        const response = await request('execution/get', { id }, { client, throwOnFail: true });
        if (isRecord(response.data)) return response.data as Record<string, unknown>;
        throw scopeFetchError('execution', id, response);
    } catch (error) {
        if (error instanceof ZentaoError && error.code === '4003') throw error;
        if (error instanceof ZentaoError) throw scopeFetchError('execution', id, error);
        throw scopeFetchError('execution', id, mapSdkError(error));
    }
}

function firstProductFromList(value: unknown): WorkspaceRef | undefined {
    if (Array.isArray(value) && value.length > 0) {
        return toWorkspaceRef(value[0]);
    }
    if (isRecord(value)) {
        // 有的接口返回 { "1": {id,name}, "2": {...} }
        const first = Object.values(value)[0];
        return toWorkspaceRef(first);
    }
    return undefined;
}

/** 从列表项上提取 product id（兼容 number / 对象 / 字符串数字） */
export function extractProductIdFromItem(item: unknown): number | undefined {
    if (!isRecord(item)) return undefined;
    const raw = item.product ?? item.productID ?? item.productId;
    if (isRecord(raw)) {
        const id = Number(raw.id);
        return !Number.isNaN(id) && id > 0 ? id : undefined;
    }
    const id = Number(raw);
    return !Number.isNaN(id) && id > 0 ? id : undefined;
}

/**
 * 在样本中统计出现最多的 product id。
 * 用于「无产品项目」(hasProduct=0) 时从项目下 Bug/Story 反查。
 */
export function pickMajorityProductId(items: unknown[]): number | undefined {
    const counts = new Map<number, number>();
    for (const item of items) {
        const id = extractProductIdFromItem(item);
        if (id === undefined) continue;
        counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    if (counts.size === 0) return undefined;

    let bestId: number | undefined;
    let bestCount = -1;
    for (const [id, count] of counts) {
        if (count > bestCount) {
            bestId = id;
            bestCount = count;
        }
    }
    return bestId;
}

function unwrapListPayload(raw: unknown, listKeys: string[]): unknown[] {
    if (Array.isArray(raw)) return raw;
    if (!isRecord(raw)) return [];
    for (const key of listKeys) {
        const value = raw[key];
        if (Array.isArray(value)) return value;
    }
    if (Array.isArray(raw.data)) return raw.data;
    return [];
}

/**
 * 当项目详情未带关联产品时，从项目下业务对象反查 product。
 * 优先 Bug 列表，其次 Story；失败时返回 undefined（不阻断建区）。
 */
export async function inferProductFromProject(
    client: ZentaoClient,
    projectId: number,
): Promise<WorkspaceRef | undefined> {
    const paths = [
        `/projects/${projectId}/bugs?recPerPage=20&pageID=1&browseType=all`,
        `/projects/${projectId}/stories?recPerPage=20&pageID=1`,
    ];
    const listKeys = ['bugs', 'stories'];

    let productId: number | undefined;
    for (const path of paths) {
        try {
            const raw = await client.get(path);
            const items = unwrapListPayload(raw, listKeys);
            productId = pickMajorityProductId(items);
            if (productId !== undefined) break;
        } catch {
            // 软失败：继续下一条路径
        }
    }
    if (productId === undefined) return undefined;

    try {
        const product = await fetchProduct(client, productId);
        return toWorkspaceRef(product, productId);
    } catch {
        return { id: productId, name: `#${productId}` };
    }
}

/** 从产品对象构造工作区引用（仅 product） */
export function refsFromProduct(product: Record<string, unknown>, idHint?: number): WorkspaceScopeRefs {
    const productRef = toWorkspaceRef(product, idHint);
    return productRef ? { product: productRef } : {};
}

/** 从项目对象构造工作区引用（project + 可选首个关联产品） */
export function refsFromProject(project: Record<string, unknown>, idHint?: number): WorkspaceScopeRefs {
    const projectRef = toWorkspaceRef(project, idHint);
    if (!projectRef) return {};

    const product =
        firstProductFromList(project.products) ??
        toWorkspaceRef(project.product) ??
        (project.productName
            ? toWorkspaceRef({ id: project.product, name: project.productName })
            : undefined);

    return { project: projectRef, product };
}

/** 标量 id + 旁路 name 字段 → WorkspaceRef（优先带名称） */
function refFromIdAndName(idValue: unknown, nameValue: unknown): WorkspaceRef | undefined {
    if (isRecord(idValue)) return toWorkspaceRef(idValue);
    if (nameValue !== undefined && nameValue !== null && String(nameValue).trim() !== '') {
        return toWorkspaceRef({ id: idValue, name: nameValue });
    }
    return toWorkspaceRef(idValue);
}

/** 从执行对象构造工作区引用（execution + project + 可选 product） */
export function refsFromExecution(execution: Record<string, unknown>, idHint?: number): WorkspaceScopeRefs {
    const executionRef = toWorkspaceRef(execution, idHint);
    if (!executionRef) return {};

    const project = refFromIdAndName(execution.project, execution.projectName);

    const product =
        firstProductFromList(execution.products) ??
        refFromIdAndName(execution.product, execution.productName);

    return { execution: executionRef, project, product };
}

export type WorkspaceScopeKind = 'product' | 'project' | 'execution';

export type WorkspaceScopeOptions = {
    product?: number;
    project?: number;
    execution?: number;
    name?: string;
};

/** 从 API 拉取 product/project/execution 并组装 WorkspaceScopeRefs */
export async function buildRefsFromScopeOptions(
    client: ZentaoClient,
    options: WorkspaceScopeOptions,
): Promise<WorkspaceScopeRefs> {
    const refs: WorkspaceScopeRefs = {};

    if (options.product !== undefined) {
        const product = await fetchProduct(client, options.product);
        Object.assign(refs, refsFromProduct(product, options.product));
    }

    if (options.project !== undefined) {
        const project = await fetchProject(client, options.project);
        const fromProject = refsFromProject(project, options.project);
        Object.assign(refs, {
            project: fromProject.project,
            product: refs.product ?? fromProject.product,
        });
    }

    if (options.execution !== undefined) {
        const execution = await fetchExecution(client, options.execution);
        const fromExecution = refsFromExecution(execution, options.execution);
        Object.assign(refs, {
            execution: fromExecution.execution,
            project: refs.project ?? fromExecution.project,
            product: refs.product ?? fromExecution.product,
        });
    }

    // 无产品项目 (hasProduct=0) 或详情缺 products：从项目下 Bug/Story 反查补全
    if (!refs.product && refs.project?.id) {
        const inferred = await inferProductFromProject(client, refs.project.id);
        if (inferred) refs.product = inferred;
    }

    if (options.name?.trim()) {
        refs.name = options.name.trim();
    }

    if (!refs.product && !refs.project && !refs.execution && !refs.name) {
        throw new ZentaoError('E4001');
    }

    return refs;
}

/**
 * 按 product / project / execution 新建或切换到对应主键工作区（`workspace add` / autoSet）。
 */
export async function setWorkspaceFromScopeOptions(
    client: ZentaoClient,
    profile: Profile,
    options: WorkspaceScopeOptions,
): Promise<Workspace> {
    const refs = await buildRefsFromScopeOptions(client, options);
    if (!refs.product && !refs.project && !refs.execution) {
        throw new ZentaoError('E4001');
    }
    return upsertWorkspaceByScope(profile, refs);
}

/**
 * 将 API 拉到的范围合并进指定工作区（默认当前），用于 `workspace set` 就地改。
 */
export async function patchWorkspaceFromScopeOptions(
    client: ZentaoClient,
    profile: Profile,
    options: WorkspaceScopeOptions,
    workspaceId?: number,
): Promise<Workspace> {
    const targetId = workspaceId ?? ensureCurrentWorkspace(profile).id;
    const hasScope =
        options.product !== undefined ||
        options.project !== undefined ||
        options.execution !== undefined;

    if (!hasScope && options.name?.trim()) {
        const renamed = patchWorkspace(profile, targetId, { name: options.name });
        if (!renamed) throw new ZentaoError('E4001');
        return renamed;
    }

    const refs = await buildRefsFromScopeOptions(client, options);
    const patched = patchWorkspace(profile, targetId, refs);
    if (!patched) throw new ZentaoError('E4001');
    return patched;
}

/**
 * autoSetWorkspace：在 product / project / execution 的 get|create|update 成功后，
 * 用返回数据（必要时再 GET 一次）切换当前工作区。
 */
export async function autoSetWorkspaceFromResult(
    client: ZentaoClient,
    profile: Profile,
    moduleName: string,
    actionType: string,
    data: unknown,
): Promise<Workspace | undefined> {
    if (moduleName !== 'product' && moduleName !== 'project' && moduleName !== 'execution') {
        return undefined;
    }
    if (actionType !== 'get' && actionType !== 'create' && actionType !== 'update') {
        return undefined;
    }

    let record = isRecord(data) ? data : undefined;
    const id = record ? Number(record.id) : Number.NaN;

    // create 常只返回 id 或极简对象，补一次详情
    if ((!record || !record.name) && !Number.isNaN(id) && id > 0) {
        if (moduleName === 'product') record = await fetchProduct(client, id);
        else if (moduleName === 'project') record = await fetchProject(client, id);
        else record = await fetchExecution(client, id);
    }

    if (!record) return undefined;

    let refs: WorkspaceScopeRefs = {};
    if (moduleName === 'product') refs = refsFromProduct(record, id);
    else if (moduleName === 'project') refs = refsFromProject(record, id);
    else refs = refsFromExecution(record, id);

    if (!refs.product && refs.project?.id) {
        const inferred = await inferProductFromProject(client, refs.project.id);
        if (inferred) refs.product = inferred;
    }

    if (!refs.product && !refs.project && !refs.execution) return undefined;
    return upsertWorkspaceByScope(profile, refs);
}
