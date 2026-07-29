import type { Profile, Workspace, WorkspaceRef } from '../types/index.js';
import { saveProfile } from './store.js';
import { ZentaoError } from '../errors.js';

function isBlank(value: unknown): boolean {
    return value === undefined || value === null || value === '';
}

function nowIso(): string {
    return new Date().toISOString();
}

/** 标记工作区为最近使用并设为当前 */
function touchWorkspace(profile: Profile, ws: Workspace): void {
    ws.lastUsedAt = nowIso();
    profile.currentWorkspace = ws.id;
}

/**
 * 确保 Profile 任意时刻都有一个“当前工作区”可用。
 * - 若完全没有工作区，则创建一个空工作区并设为当前
 * - 若有工作区但 currentWorkspace 缺失/无效，则切到第一个工作区
 */
export function ensureCurrentWorkspace(profile: Profile): Workspace {
    if (!profile.workspaces) profile.workspaces = [];

    const byId =
        profile.currentWorkspace
            ? profile.workspaces.find((w) => w.id === profile.currentWorkspace)
            : undefined;
    if (byId) return byId;

    if (profile.workspaces.length > 0) {
        const first = profile.workspaces[0];
        touchWorkspace(profile, first);
        saveProfile(profile);
        return first;
    }

    return createWorkspace(profile, {});
}

/** 获取 Profile 当前激活的工作区（始终返回一个可用工作区） */
export function getCurrentWorkspace(profile: Profile): Workspace {
    return ensureCurrentWorkspace(profile);
}

/**
 * 列出 Profile 下所有工作区。
 * 排序：当前工作区优先，其余按 lastUsedAt 降序，再按 id 降序。
 */
export function listWorkspaces(profile: Profile): Workspace[] {
    ensureCurrentWorkspace(profile);
    const currentId = profile.currentWorkspace;
    const list = [...(profile.workspaces ?? [])];
    list.sort((a, b) => {
        if (a.id === currentId) return -1;
        if (b.id === currentId) return 1;
        const ta = a.lastUsedAt ?? '';
        const tb = b.lastUsedAt ?? '';
        if (ta !== tb) return tb.localeCompare(ta);
        return b.id - a.id;
    });
    return list;
}

/** 根据 ID 查找工作区 */
export function getWorkspaceById(profile: Profile, id: number): Workspace | undefined {
    return profile.workspaces?.find((w) => w.id === id);
}

/**
 * 按名称查找工作区。
 * 匹配顺序：精确 → 忽略大小写精确 → 包含（忽略大小写）。
 * 多命中抛 E4004；零命中返回 undefined。
 */
export function findWorkspacesByName(profile: Profile, name: string): Workspace[] {
    const needle = name.trim();
    if (!needle || !profile.workspaces?.length) return [];

    const exact = profile.workspaces.filter((w) => w.name === needle);
    if (exact.length > 0) return exact;

    const lower = needle.toLowerCase();
    const ciExact = profile.workspaces.filter((w) => w.name?.toLowerCase() === lower);
    if (ciExact.length > 0) return ciExact;

    return profile.workspaces.filter((w) => w.name?.toLowerCase().includes(lower));
}

/**
 * 解析工作区选择器：纯数字 → ID；否则按名称。
 * 找不到抛 E4001；重名抛 E4004。
 */
export function resolveWorkspaceSelector(profile: Profile, selector: string): Workspace {
    const raw = selector.trim();
    if (/^\d+$/.test(raw)) {
        const ws = getWorkspaceById(profile, Number(raw));
        if (!ws) throw new ZentaoError('E4001');
        return ws;
    }

    const matches = findWorkspacesByName(profile, raw);
    if (matches.length === 0) throw new ZentaoError('E4001');
    if (matches.length > 1) {
        throw new ZentaoError('E4004', {
            name: raw,
            ids: matches.map((w) => String(w.id)).join(', '),
        });
    }
    return matches[0];
}

/** 将指定 ID 的工作区设为当前工作区，不存在时返回 false */
export function setCurrentWorkspace(profile: Profile, id: number): boolean {
    const ws = getWorkspaceById(profile, id);
    if (!ws) return false;
    touchWorkspace(profile, ws);
    saveProfile(profile);
    return true;
}

/**
 * 删除工作区。
 * - 删当前区时自动切到剩余区中最近使用的一个；若删光则新建空区
 * - 返回被删除的工作区快照
 */
export function removeWorkspace(profile: Profile, id: number): Workspace {
    if (!profile.workspaces?.length) {
        throw new ZentaoError('E4005', { reason: '当前没有任何工作区' });
    }

    const idx = profile.workspaces.findIndex((w) => w.id === id);
    if (idx < 0) throw new ZentaoError('E4001');

    const removed = { ...profile.workspaces[idx] };
    const wasCurrent = profile.currentWorkspace === id;
    profile.workspaces.splice(idx, 1);

    if (profile.workspaces.length === 0) {
        profile.currentWorkspace = undefined;
        createWorkspace(profile, {});
        return removed;
    }

    if (wasCurrent) {
        const sorted = [...profile.workspaces].sort((a, b) => {
            const ta = a.lastUsedAt ?? '';
            const tb = b.lastUsedAt ?? '';
            if (ta !== tb) return tb.localeCompare(ta);
            return b.id - a.id;
        });
        touchWorkspace(profile, sorted[0]);
        saveProfile(profile);
    } else {
        saveProfile(profile);
    }
    return removed;
}

/** 在现有工作区 ID 中取最大值 +1，保证本地 ID 单调递增 */
function nextWorkspaceId(profile: Profile): number {
    const workspaces = profile.workspaces ?? [];
    if (workspaces.length === 0) return 1;
    return Math.max(...workspaces.map((w) => w.id)) + 1;
}

export type WorkspaceScopeRefs = {
    product?: WorkspaceRef;
    project?: WorkspaceRef;
    execution?: WorkspaceRef;
    /** 可选备注名；未传时 create 会用主对象名称作默认备注 */
    name?: string;
};

/** 根据范围引用生成默认备注名（执行 > 项目 > 产品） */
export function defaultWorkspaceName(refs: WorkspaceScopeRefs): string | undefined {
    if (refs.execution?.name) return refs.execution.name;
    if (refs.project?.name) return refs.project.name;
    if (refs.product?.name) return refs.product.name;
    return undefined;
}

/** 创建新工作区并设为当前工作区，自动分配递增 ID */
export function createWorkspace(profile: Profile, params: WorkspaceScopeRefs): Workspace {
    if (!profile.workspaces) profile.workspaces = [];
    const name = params.name?.trim() || defaultWorkspaceName(params);
    const ws: Workspace = {
        id: nextWorkspaceId(profile),
        ...(name ? { name } : {}),
        product: params.product,
        project: params.project,
        execution: params.execution,
        lastUsedAt: nowIso(),
    };
    profile.workspaces.push(ws);
    profile.currentWorkspace = ws.id;
    saveProfile(profile);
    return ws;
}

/**
 * 更新工作区备注名。`id` 省略则改当前工作区。
 * @returns 更新后的工作区；工作区不存在时返回 undefined
 */
export function setWorkspaceName(profile: Profile, name: string, id?: number): Workspace | undefined {
    const trimmed = name.trim();
    if (!trimmed) return undefined;

    const targetId = id ?? profile.currentWorkspace;
    const ws = targetId !== undefined
        ? getWorkspaceById(profile, targetId)
        : ensureCurrentWorkspace(profile);
    if (!ws) return undefined;

    ws.name = trimmed;
    if (id !== undefined) {
        touchWorkspace(profile, ws);
    }
    saveProfile(profile);
    return ws;
}

/**
 * 将范围引用合并进指定工作区（就地改），并设为当前。
 * 只覆盖传入的维度；未传的 product/project/execution 保持原值。
 */
export function patchWorkspace(
    profile: Profile,
    id: number,
    refs: WorkspaceScopeRefs,
): Workspace | undefined {
    const ws = getWorkspaceById(profile, id);
    if (!ws) return undefined;

    if (refs.product) ws.product = refs.product;
    if (refs.project) ws.project = refs.project;
    if (refs.execution) ws.execution = refs.execution;
    if (refs.name?.trim()) {
        ws.name = refs.name.trim();
    } else if (!ws.name) {
        const fallback = defaultWorkspaceName({
            product: ws.product,
            project: ws.project,
            execution: ws.execution,
        });
        if (fallback) ws.name = fallback;
    }

    touchWorkspace(profile, ws);
    saveProfile(profile);
    return ws;
}

/**
 * 按主对象（执行 > 项目 > 产品）匹配已有工作区；命中则合并更完整的引用并设为当前，
 * 未命中则新建。用于 `workspace add` 与 autoSet。
 */
export function upsertWorkspaceByScope(profile: Profile, refs: WorkspaceScopeRefs): Workspace {
    if (!profile.workspaces) profile.workspaces = [];

    const primary: 'execution' | 'project' | 'product' | undefined = refs.execution
        ? 'execution'
        : refs.project
          ? 'project'
          : refs.product
            ? 'product'
            : undefined;

    if (!primary) {
        const current = ensureCurrentWorkspace(profile);
        if (refs.name?.trim()) {
            current.name = refs.name.trim();
            saveProfile(profile);
        }
        return current;
    }

    const primaryId = refs[primary]!.id;
    const existing = profile.workspaces.find((w) => w[primary]?.id === primaryId);
    if (existing) {
        if (refs.product) existing.product = refs.product;
        if (refs.project) existing.project = refs.project;
        if (refs.execution) existing.execution = refs.execution;
        if (refs.name?.trim()) {
            existing.name = refs.name.trim();
        } else if (!existing.name) {
            const fallback = defaultWorkspaceName(refs);
            if (fallback) existing.name = fallback;
        }
        touchWorkspace(profile, existing);
        saveProfile(profile);
        return existing;
    }

    return createWorkspace(profile, refs);
}

/** applyWorkspaceDefaults 的注入明细，供 CLI 提示 */
export interface WorkspaceInjection {
    product?: number;
    project?: number;
    execution?: number;
}

export interface ApplyWorkspaceDefaultsResult {
    params: Record<string, unknown>;
    injected: WorkspaceInjection;
}

/**
 * 将当前工作区的 product / project / execution 注入请求参数（仅补缺，不覆盖用户显式传入）。
 *
 * 若用户已提供任一 scope 别名（product/project/execution 或其 *ID / scope），则不再注入，
 * 避免 workspace 中的更高优先级 execution 抢走用户显式的 product 范围。
 */
export function applyWorkspaceDefaults(
    params: Record<string, unknown>,
    workspace: Workspace | undefined,
): ApplyWorkspaceDefaultsResult {
    const empty: ApplyWorkspaceDefaultsResult = { params, injected: {} };
    if (!workspace) return empty;

    const hasExplicitScope =
        !isBlank(params.scope) ||
        !isBlank(params.scopeID) ||
        !isBlank(params.product) ||
        !isBlank(params.productID) ||
        !isBlank(params.project) ||
        !isBlank(params.projectID) ||
        !isBlank(params.execution) ||
        !isBlank(params.executionID);

    if (hasExplicitScope) return empty;

    const next = { ...params };
    const injected: WorkspaceInjection = {};
    if (workspace.product && isBlank(next.product) && isBlank(next.productID)) {
        next.product = workspace.product.id;
        injected.product = workspace.product.id;
    }
    if (workspace.project && isBlank(next.project) && isBlank(next.projectID)) {
        next.project = workspace.project.id;
        injected.project = workspace.project.id;
    }
    if (workspace.execution && isBlank(next.execution) && isBlank(next.executionID)) {
        next.execution = workspace.execution.id;
        injected.execution = workspace.execution.id;
    }
    return { params: next, injected };
}

/** 生成工作区注入提示（写 stderr 用） */
export function formatWorkspaceInjectHint(
    workspace: Workspace,
    injected: WorkspaceInjection,
): string | undefined {
    const parts: string[] = [];
    if (injected.execution !== undefined) parts.push(`execution=${injected.execution}`);
    if (injected.project !== undefined) parts.push(`project=${injected.project}`);
    if (injected.product !== undefined) parts.push(`product=${injected.product}`);
    if (parts.length === 0) return undefined;

    const label = workspace.name?.trim()
        ? `#${workspace.id}「${workspace.name.trim()}」`
        : `#${workspace.id}`;
    return `使用工作区 ${label}：${parts.join(', ')}`;
}

/** 判断工作区是否含有任何有效范围引用 */
export function workspaceHasScope(workspace: Workspace | undefined): boolean {
    if (!workspace) return false;
    return Boolean(workspace.product || workspace.project || workspace.execution);
}
