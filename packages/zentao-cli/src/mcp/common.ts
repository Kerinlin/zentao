import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ZentaoClient } from '../api/index.js';
import { getCurrentProfile, getProfileConfig } from '../config/store.js';
import { getCurrentWorkspace } from '../config/workspace.js';
import { DEFAULT_CONFIG } from '../config/defaults.js';
import { ZentaoError } from '../errors.js';
import { executeModuleCommand, type ModuleExecutionResult } from '../modules/executor.js';
import { getModule } from '../modules/helper.js';
import type { ModuleActionOptions, ModuleDefinition, Profile, UserConfig, Workspace } from '../types/index.js';
import type { AuthProvider } from './server.js';

export interface AuthContext {
    client: ZentaoClient;
    profile: Profile;
    config: Required<UserConfig>;
    workspace: Workspace | undefined;
}

export function jsonResult(data: unknown): CallToolResult {
    return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
}

export async function wrapTool(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
    try {
        return await fn();
    } catch (error) {
        if (error instanceof ZentaoError) {
            return {
                isError: true,
                content: [{ type: 'text', text: `E${error.code}: ${error.message}` }],
            };
        }
        return {
            isError: true,
            content: [{ type: 'text', text: (error as Error).message ?? String(error) }],
        };
    }
}

export async function loadAuthContext(auth: AuthProvider): Promise<AuthContext> {
    const client = await auth.getClient();
    const profile = getCurrentProfile();
    if (!profile) throw new ZentaoError('E1006');
    const config = getProfileConfig(profile);
    const workspace = getCurrentWorkspace(profile);
    return { client, profile, config, workspace };
}

export function requireModule(name: string): ModuleDefinition {
    const mod = getModule(name);
    if (!mod) throw new ZentaoError('E2001', { module: name });
    return mod;
}

export function getBugModule(): ModuleDefinition {
    return requireModule('bug');
}

export interface ListScopeInput {
    projectId?: number;
    productId?: number;
    executionId?: number;
}

export interface ResolvedListScope {
    project?: string;
    product?: string;
    execution?: string;
}

/**
 * Resolve list scope: at most one explicit id; zero means workspace fallback in executor.
 */
export function resolveListScope(input: ListScopeInput): ResolvedListScope {
    const present = [
        input.projectId != null ? 'projectId' : null,
        input.productId != null ? 'productId' : null,
        input.executionId != null ? 'executionId' : null,
    ].filter((v): v is string => v != null);

    if (present.length > 1) {
        throw new ZentaoError('E2009', {
            option: 'scope',
            reason: '只能指定 projectId、productId、executionId 之一',
        });
    }

    if (input.projectId != null) return { project: String(input.projectId) };
    if (input.productId != null) return { product: String(input.productId) };
    if (input.executionId != null) return { execution: String(input.executionId) };
    return {};
}

/** Build list scope: projectId or executionId only (API has no product builds path). */
export function resolveBuildScope(input: {
    projectId?: number;
    executionId?: number;
}): ResolvedListScope {
    if (input.projectId != null && input.executionId != null) {
        throw new ZentaoError('E2009', {
            option: 'scope',
            reason: '只能指定 projectId 或 executionId 之一',
        });
    }
    if (input.projectId != null) return { project: String(input.projectId) };
    if (input.executionId != null) return { execution: String(input.executionId) };
    return {};
}

/**
 * When pick is absent, strip `steps` from list rows to keep MCP context small.
 * When pick is present, leave data as-is (executor already applied pick).
 */
export function omitStepsUnlessPicked(data: unknown, pick?: string): unknown {
    return omitFieldsUnlessPicked(data, pick, ['steps']);
}

/** Omit large/sensitive fields when pick is not specified. */
export function omitFieldsUnlessPicked(
    data: unknown,
    pick: string | undefined,
    fields: string[],
): unknown {
    if (pick && pick.trim()) return data;
    if (!Array.isArray(data)) return data;
    return data.map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
        const row = { ...(item as Record<string, unknown>) };
        for (const f of fields) delete row[f];
        return row;
    });
}

export function parsePickFields(pick?: string): string[] | undefined {
    const fields = pick?.split(',').map((f) => f.trim()).filter(Boolean);
    return fields && fields.length > 0 ? fields : undefined;
}

export async function runModuleAction(
    auth: AuthProvider,
    moduleName: string,
    actionName: string,
    options: ModuleActionOptions,
): Promise<ModuleExecutionResult> {
    const { client, config, workspace } = await loadAuthContext(auth);
    const mod = requireModule(moduleName);
    return executeModuleCommand(client, mod, actionName, [], {
        ...options,
        format: 'json',
        yes: true,
    }, config ?? DEFAULT_CONFIG, workspace);
}

export async function runBugAction(
    auth: AuthProvider,
    actionName: string,
    options: ModuleActionOptions,
): Promise<ModuleExecutionResult> {
    return runModuleAction(auth, 'bug', actionName, options);
}

export function bodyParams(body: Record<string, unknown>): string | undefined {
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
        if (v !== undefined && v !== null) cleaned[k] = v;
    }
    return Object.keys(cleaned).length ? JSON.stringify(cleaned) : undefined;
}

/** Shared list response builder. */
export function listResult(
    execution: ModuleExecutionResult,
    data: unknown,
): CallToolResult {
    const response: Record<string, unknown> = { data };
    if (execution.pager) response.pager = execution.pager;
    return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
    };
}
