import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    applyWorkspaceDefaults,
    createWorkspace,
    defaultWorkspaceName,
    ensureCurrentWorkspace,
    findWorkspacesByName,
    formatWorkspaceInjectHint,
    getCurrentWorkspace,
    listWorkspaces,
    removeWorkspace,
    resolveWorkspaceSelector,
    setCurrentWorkspace,
    setWorkspaceName,
    patchWorkspace,
    upsertWorkspaceByScope,
    workspaceHasScope,
} from '../src/config/workspace.js';
import { ZentaoError } from '../src/errors.js';
import {
    refsFromExecution,
    refsFromProduct,
    refsFromProject,
    setWorkspaceFromScopeOptions,
    toWorkspaceRef,
    autoSetWorkspaceFromResult,
} from '../src/config/workspace-sync.js';
import { saveProfile, setConfigPath, getCurrentProfile } from '../src/config/store.js';
import type { ZentaoClient } from '../src/api/index.js';
import type { Profile } from '../src/types/index.js';
import { mockProfile, resetConfigStore } from './helpers.js';

describe('workspace storage', () => {
    let tempDir: string;

    beforeEach(() => {
        resetConfigStore();
        tempDir = mkdtempSync(join(tmpdir(), 'zentao-ws-'));
        setConfigPath(join(tempDir, 'zentao.json'));
    });

    afterEach(() => {
        resetConfigStore();
        rmSync(tempDir, { recursive: true, force: true });
    });

    /** 返回内存中的干净 Profile，并写入当前 temp 配置；不经 getCurrentProfile，避免引用污染 */
    function seededProfile(extra?: Partial<Profile>): Profile {
        const profile: Profile = {
            ...mockProfile,
            workspaces: [],
            currentWorkspace: undefined,
            ...extra,
        };
        // 深拷贝 workspaces，避免 extra 共享引用
        if (extra?.workspaces) {
            profile.workspaces = extra.workspaces.map((w) => ({ ...w }));
        }
        saveProfile(profile);
        return profile;
    }

    test('ensureCurrentWorkspace creates empty workspace when none exist', () => {
        const profile = seededProfile();
        const ws = ensureCurrentWorkspace(profile);
        expect(ws.product).toBeUndefined();
        expect(profile.currentWorkspace).toBe(ws.id);
        expect(profile.workspaces).toHaveLength(1);
    });

    test('createWorkspace assigns monotonic ids and sets current', () => {
        const profile = seededProfile();
        const a = createWorkspace(profile, { product: { id: 1, name: 'P1' } });
        const b = createWorkspace(profile, { project: { id: 2, name: 'Prj' } });
        expect(b.id).toBeGreaterThan(a.id);
        expect(getCurrentWorkspace(profile).id).toBe(b.id);
        expect(profile.workspaces).toHaveLength(2);
        // 未显式传 name 时用主对象名作默认备注
        expect(a.name).toBe('P1');
        expect(b.name).toBe('Prj');
    });

    test('createWorkspace respects explicit name remark', () => {
        const profile = seededProfile();
        const ws = createWorkspace(profile, {
            product: { id: 1, name: 'P1' },
            name: '  客户A交付  ',
        });
        expect(ws.name).toBe('客户A交付');
    });

    test('setWorkspaceName renames current or by id', () => {
        const profile = seededProfile();
        const a = createWorkspace(profile, { product: { id: 1, name: 'P1' } });
        const b = createWorkspace(profile, { product: { id: 2, name: 'P2' } });
        // b 为当前
        expect(setWorkspaceName(profile, '当前备注')?.id).toBe(b.id);
        expect(b.name).toBe('当前备注');
        expect(setWorkspaceName(profile, 'A备注', a.id)?.name).toBe('A备注');
        expect(a.name).toBe('A备注');
        expect(profile.currentWorkspace).toBe(a.id);
    });

    test('defaultWorkspaceName prefers execution > project > product', () => {
        expect(defaultWorkspaceName({
            product: { id: 1, name: 'P' },
            project: { id: 2, name: 'J' },
            execution: { id: 3, name: 'E' },
        })).toBe('E');
        expect(defaultWorkspaceName({ product: { id: 1, name: 'P' } })).toBe('P');
    });

    test('upsertWorkspaceByScope reuses workspace for same primary object', () => {
        const profile = seededProfile();
        // 仅 product → 主键 product
        const first = upsertWorkspaceByScope(profile, {
            product: { id: 10, name: '产品A' },
        });
        const sameProduct = upsertWorkspaceByScope(profile, {
            product: { id: 10, name: '产品A-改名' },
        });
        expect(sameProduct.id).toBe(first.id);
        expect(sameProduct.product?.name).toBe('产品A-改名');
        const afterProductCount = profile.workspaces!.length;

        // 带 project → 主键变为 project，另建工作区
        const withProject = upsertWorkspaceByScope(profile, {
            product: { id: 10, name: '产品A-改名' },
            project: { id: 20, name: '项目X' },
        });
        expect(withProject.id).not.toBe(first.id);
        expect(withProject.project?.id).toBe(20);
        expect(profile.workspaces).toHaveLength(afterProductCount + 1);

        // 同一 project 再 set → 复用并合并
        const sameProject = upsertWorkspaceByScope(profile, {
            project: { id: 20, name: '项目X-新' },
            product: { id: 11, name: 'P11' },
        });
        expect(sameProject.id).toBe(withProject.id);
        expect(sameProject.project?.name).toBe('项目X-新');
        expect(sameProject.product?.id).toBe(11);
        expect(profile.workspaces).toHaveLength(afterProductCount + 1);
    });

    test('setCurrentWorkspace switches by id', () => {
        const profile = seededProfile();
        const a = createWorkspace(profile, { product: { id: 1, name: 'A' } });
        const b = createWorkspace(profile, { product: { id: 2, name: 'B' } });
        expect(setCurrentWorkspace(profile, a.id)).toBe(true);
        expect(getCurrentWorkspace(profile).id).toBe(a.id);
        expect(setCurrentWorkspace(profile, 999)).toBe(false);
        expect(getCurrentWorkspace(profile).id).toBe(a.id);
        void b;
    });
});

describe('applyWorkspaceDefaults', () => {
    const ws = {
        id: 1,
        name: '主线',
        product: { id: 11, name: 'P' },
        project: { id: 22, name: 'J' },
        execution: { id: 33, name: 'E' },
    };

    test('injects product/project/execution when none provided', () => {
        const result = applyWorkspaceDefaults({}, ws);
        expect(result.params).toEqual({
            product: 11,
            project: 22,
            execution: 33,
        });
        expect(result.injected).toEqual({
            product: 11,
            project: 22,
            execution: 33,
        });
        expect(formatWorkspaceInjectHint(ws, result.injected)).toContain('主线');
        expect(formatWorkspaceInjectHint(ws, result.injected)).toContain('execution=33');
    });

    test('does not inject when user already passed a scope key', () => {
        expect(applyWorkspaceDefaults({ product: 99 }, ws)).toEqual({
            params: { product: 99 },
            injected: {},
        });
        expect(applyWorkspaceDefaults({ productID: 99 }, ws).injected).toEqual({});
        expect(applyWorkspaceDefaults({ execution: 1 }, ws).params).toEqual({ execution: 1 });
        expect(applyWorkspaceDefaults({ scope: 'products', scopeID: 1 }, ws).params).toEqual({
            scope: 'products',
            scopeID: 1,
        });
    });

    test('no-op for empty workspace', () => {
        expect(applyWorkspaceDefaults({ foo: 1 }, { id: 1 })).toEqual({
            params: { foo: 1 },
            injected: {},
        });
        expect(workspaceHasScope({ id: 1 })).toBe(false);
        expect(workspaceHasScope(ws)).toBe(true);
    });
});

describe('workspace resolve / rm / list sort', () => {
    let tempDir: string;

    beforeEach(() => {
        resetConfigStore();
        tempDir = mkdtempSync(join(tmpdir(), 'zentao-ws-'));
        setConfigPath(join(tempDir, 'zentao.json'));
    });

    afterEach(() => {
        resetConfigStore();
        rmSync(tempDir, { recursive: true, force: true });
    });

    function seededProfile(): Profile {
        const profile: Profile = {
            ...mockProfile,
            workspaces: [],
            currentWorkspace: undefined,
        };
        saveProfile(profile);
        return profile;
    }

    test('resolveWorkspaceSelector by id and name', () => {
        const profile = seededProfile();
        const a = createWorkspace(profile, { product: { id: 1, name: 'P1' }, name: '主线迭代' });
        createWorkspace(profile, { product: { id: 2, name: 'P2' }, name: '客户A' });

        expect(resolveWorkspaceSelector(profile, String(a.id)).id).toBe(a.id);
        expect(resolveWorkspaceSelector(profile, '主线迭代').id).toBe(a.id);
        expect(resolveWorkspaceSelector(profile, '主线').id).toBe(a.id); // contains
        expect(() => resolveWorkspaceSelector(profile, '不存在')).toThrow(ZentaoError);
    });

    test('resolveWorkspaceSelector throws E4004 on ambiguous name', () => {
        const profile = seededProfile();
        createWorkspace(profile, { product: { id: 1, name: 'P1' }, name: '测试区' });
        createWorkspace(profile, { product: { id: 2, name: 'P2' }, name: '测试区-备份' });
        // contains "测试" matches both
        try {
            resolveWorkspaceSelector(profile, '测试');
            expect.unreachable();
        } catch (e) {
            expect(e).toBeInstanceOf(ZentaoError);
            expect((e as ZentaoError).code).toBe('4004');
        }
    });

    test('removeWorkspace switches current and can recreate empty', () => {
        const profile = seededProfile();
        const a = createWorkspace(profile, { product: { id: 1, name: 'P1' }, name: 'A' });
        const b = createWorkspace(profile, { product: { id: 2, name: 'P2' }, name: 'B' });
        expect(profile.currentWorkspace).toBe(b.id);

        removeWorkspace(profile, b.id);
        expect(getWorkspaceByIdSafe(profile, b.id)).toBeUndefined();
        expect(profile.currentWorkspace).toBe(a.id);

        removeWorkspace(profile, a.id);
        // 删光后自动建空区
        expect(profile.workspaces?.length).toBe(1);
        expect(workspaceHasScope(profile.workspaces![0])).toBe(false);
    });

    test('listWorkspaces puts current first then lastUsedAt', () => {
        const profile = seededProfile();
        const a = createWorkspace(profile, { product: { id: 1, name: 'P1' }, name: 'A' });
        const b = createWorkspace(profile, { product: { id: 2, name: 'P2' }, name: 'B' });
        // b is current; touch a to be more recent then switch back? setCurrent a
        setCurrentWorkspace(profile, a.id);
        const list = listWorkspaces(profile);
        expect(list[0].id).toBe(a.id);
        expect(list.map((w) => w.id)).toContain(b.id);
    });

    test('patchWorkspace updates current in place', () => {
        const profile = seededProfile();
        const ws = createWorkspace(profile, { product: { id: 1, name: 'P1' }, name: '旧' });
        const patched = patchWorkspace(profile, ws.id, {
            execution: { id: 9, name: 'E9' },
            name: '新备注',
        });
        expect(patched?.execution?.id).toBe(9);
        expect(patched?.product?.id).toBe(1);
        expect(patched?.name).toBe('新备注');
        expect(profile.workspaces).toHaveLength(1);
    });

    test('findWorkspacesByName exact over contains', () => {
        const profile = seededProfile();
        createWorkspace(profile, { product: { id: 1, name: 'P1' }, name: '主' });
        createWorkspace(profile, { product: { id: 2, name: 'P2' }, name: '主线' });
        expect(findWorkspacesByName(profile, '主')).toHaveLength(1);
        expect(findWorkspacesByName(profile, '主')[0].name).toBe('主');
    });
});

function getWorkspaceByIdSafe(profile: Profile, id: number) {
    return profile.workspaces?.find((w) => w.id === id);
}

describe('workspace-sync helpers', () => {
    test('toWorkspaceRef handles id/name/object/number', () => {
        expect(toWorkspaceRef(5)).toEqual({ id: 5, name: '#5' });
        expect(toWorkspaceRef({ id: 3, name: '产品' })).toEqual({ id: 3, name: '产品' });
        expect(toWorkspaceRef({ id: 3, title: '需求' })).toEqual({ id: 3, name: '需求' });
        expect(toWorkspaceRef(undefined, 9)).toEqual({ id: 9, name: '#9' });
        expect(toWorkspaceRef(undefined)).toBeUndefined();
    });

    test('refsFromProduct/Project/Execution extract parents', () => {
        expect(refsFromProduct({ id: 1, name: 'P1' })).toEqual({
            product: { id: 1, name: 'P1' },
        });
        expect(refsFromProject({
            id: 2,
            name: 'Prj',
            products: [{ id: 1, name: 'P1' }],
        })).toEqual({
            project: { id: 2, name: 'Prj' },
            product: { id: 1, name: 'P1' },
        });
        expect(refsFromExecution({
            id: 3,
            name: 'Sprint',
            project: 2,
            projectName: 'Prj',
            products: [1],
        })).toEqual({
            execution: { id: 3, name: 'Sprint' },
            project: { id: 2, name: 'Prj' },
            product: { id: 1, name: '#1' },
        });
    });
});

describe('setWorkspaceFromScopeOptions + autoSet', () => {
    let tempDir: string;

    beforeEach(() => {
        resetConfigStore();
        tempDir = mkdtempSync(join(tmpdir(), 'zentao-ws-api-'));
        setConfigPath(join(tempDir, 'zentao.json'));
    });

    afterEach(() => {
        resetConfigStore();
        rmSync(tempDir, { recursive: true, force: true });
    });

    function mockClient(routes: Record<string, unknown>): ZentaoClient {
        return {
            async get(path: string) {
                if (routes[path] !== undefined) return routes[path];
                throw Object.assign(new Error(`unexpected GET ${path}`), {
                    name: 'ZentaoError',
                    code: 'E_HTTP_ERROR',
                    details: { status: 404, url: path, body: '' },
                });
            },
            async request(path: string, options?: { method?: string }) {
                const key = `${options?.method ?? 'GET'} ${path}`;
                if (routes[key] !== undefined) return routes[key];
                if (routes[path] !== undefined) return routes[path];
                throw Object.assign(new Error(`unexpected ${key}`), {
                    name: 'ZentaoError',
                    code: 'E_HTTP_ERROR',
                    details: { status: 404, url: path, body: '' },
                });
            },
        } as unknown as ZentaoClient;
    }

    test('setWorkspaceFromScopeOptions --product fetches and upserts', async () => {
        const profile: Profile = { ...mockProfile };
        saveProfile(profile);
        const client = mockClient({
            'GET /products/12': { status: 'success', product: { id: 12, name: '产品12' } },
        });

        // product/get goes through SDK request which uses client.request with resolved path
        const client2 = {
            async request(path: string, options?: { method?: string; query?: unknown; body?: unknown }) {
                void options;
                if (path === '/products/12') {
                    return { status: 'success', product: { id: 12, name: '产品12' } };
                }
                throw new Error(`unexpected ${path}`);
            },
        } as unknown as ZentaoClient;

        const ws = await setWorkspaceFromScopeOptions(client2, getCurrentProfile()!, { product: 12 });
        expect(ws.product).toEqual({ id: 12, name: '产品12' });
        expect(getCurrentProfile()!.currentWorkspace).toBe(ws.id);
        void client;
    });

    test('setWorkspaceFromScopeOptions --project uses raw GET /projects/:id', async () => {
        saveProfile({ ...mockProfile });
        const client = mockClient({
            '/projects/5': { status: 'success', project: { id: 5, name: '项目5', products: [{ id: 1, name: 'P' }] } },
        });
        // client.get is used for project
        const clientGet = {
            async get(path: string) {
                if (path === '/projects/5') {
                    return { status: 'success', project: { id: 5, name: '项目5', products: [{ id: 1, name: 'P' }] } };
                }
                throw new Error(path);
            },
            async request() {
                throw new Error('should not request');
            },
        } as unknown as ZentaoClient;

        const ws = await setWorkspaceFromScopeOptions(clientGet, getCurrentProfile()!, { project: 5 });
        expect(ws.project).toEqual({ id: 5, name: '项目5' });
        expect(ws.product).toEqual({ id: 1, name: 'P' });
        void client;
    });

    test('autoSetWorkspaceFromResult on product get', async () => {
        saveProfile({ ...mockProfile });
        const client = {
            async request() { throw new Error('no fetch needed'); },
            async get() { throw new Error('no fetch needed'); },
        } as unknown as ZentaoClient;

        const ws = await autoSetWorkspaceFromResult(
            client,
            getCurrentProfile()!,
            'product',
            'get',
            { id: 7, name: '产品7' },
        );
        expect(ws?.product).toEqual({ id: 7, name: '产品7' });
        expect(getCurrentProfile()!.currentWorkspace).toBe(ws!.id);
    });
});
