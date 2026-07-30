import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
    getAllProfiles,
    getCurrentProfile,
    profileKey,
    setCurrentProfile,
} from '../../config/store.js';
import { ZentaoError } from '../../errors.js';
import type { AuthProvider } from '../server.js';
import { jsonResult, wrapTool } from '../common.js';

async function handleGetCurrentUser(auth: AuthProvider) {
    const client = await auth.getClient();
    const profile = getCurrentProfile();
    const account = profile?.account;

    let user: Record<string, unknown> | undefined;
    try {
        const usersResp = await client.get<Record<string, unknown>>('/users', {
            query: { browseType: 'inside', recPerPage: 100 },
        });
        const usersRaw = (usersResp as Record<string, unknown>).users;
        const users = Array.isArray(usersRaw) ? usersRaw as Array<Record<string, unknown>> : [];
        user = account
            ? users.find((item) => String(item.account ?? '') === account)
            : undefined;
    } catch {
        // Low-privilege accounts may not list users.
    }

    const fallback = account ? { account } : {};
    const result = user
        ?? (profile?.user && Object.keys(profile.user).length > 0 ? profile.user : fallback);

    return jsonResult(result);
}

function handleListProfiles() {
    const profiles = getAllProfiles();
    if (profiles.length === 0) throw new ZentaoError('E1006');

    const current = getCurrentProfile();
    const currentKey = current ? profileKey(current.account, current.server) : '';

    return jsonResult({
        currentProfile: currentKey,
        profiles: profiles.map((p) => {
            const key = profileKey(p.account, p.server);
            return {
                key,
                account: p.account,
                server: p.server,
                current: key === currentKey,
            };
        }),
    });
}

async function handleSwitchUser(input: { profileKey: string }, auth: AuthProvider) {
    const success = setCurrentProfile(input.profileKey);
    if (!success) throw new ZentaoError('E1007');

    auth.resetClient();
    await auth.getClient();

    const current = getCurrentProfile();
    const currentKey = current ? profileKey(current.account, current.server) : input.profileKey;
    return jsonResult({
        status: 'success',
        currentProfile: currentKey,
    });
}

export function registerUserTools(server: McpServer, auth: AuthProvider): void {
    server.tool(
        'get_current_user',
        '获取当前登录禅道账号信息',
        {},
        { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
        async () => wrapTool(() => handleGetCurrentUser(auth)),
    );

    server.tool(
        'list_profiles',
        '列出本地已登录的禅道账号配置（不含密码/Token）',
        {},
        { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
        async () => wrapTool(async () => handleListProfiles()),
    );

    server.tool(
        'switch_user',
        '切换当前登录账号（profileKey，格式 account@server 或 account）',
        {
            profileKey: z.string().describe('目标用户配置标识，支持 account@server、account 或 account@hostname'),
        },
        { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
        async (input) => wrapTool(() => handleSwitchUser(input as { profileKey: string }, auth)),
    );
}
