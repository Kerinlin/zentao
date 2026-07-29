import { Command } from 'commander';
import { ensureAuth } from '../auth/flow.js';
import { getCurrentProfile } from '../config/store.js';
import {
    getCurrentWorkspace,
    listWorkspaces,
    setCurrentWorkspace,
    getWorkspaceById,
    setWorkspaceName,
    resolveWorkspaceSelector,
    removeWorkspace,
    patchWorkspace,
    workspaceHasScope,
} from '../config/workspace.js';
import {
    patchWorkspaceFromScopeOptions,
    setWorkspaceFromScopeOptions,
} from '../config/workspace-sync.js';
import { ZentaoError, formatError } from '../errors.js';
import { formatTable, formatList, formatJson } from '../utils/format.js';
import type { Workspace, GlobalOptions } from '../types/index.js';

/** 将工作区引用展平为适合表格/列表展示的中文字段 */
export function workspaceToDisplay(ws: Workspace): Record<string, unknown> {
    return {
        ID: ws.id,
        名称: ws.name?.trim() ? ws.name : '（未命名）',
        产品: ws.product ? `#${ws.product.id} ${ws.product.name}` : '空',
        项目: ws.project ? `#${ws.project.id} ${ws.project.name}` : '空',
        执行: ws.execution ? `#${ws.execution.id} ${ws.execution.name}` : '空',
        最近使用: ws.lastUsedAt ? ws.lastUsedAt.replace('T', ' ').replace(/\.\d+Z$/, 'Z') : '-',
    };
}

function parsePositiveId(raw: string | undefined, option: string): number | undefined {
    if (raw === undefined || raw === '') return undefined;
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) {
        throw new ZentaoError('E2009', { option, reason: '必须是正整数 ID' });
    }
    return id;
}

function requireProfile(): NonNullable<ReturnType<typeof getCurrentProfile>> {
    const profile = getCurrentProfile();
    if (!profile) throw new ZentaoError('E1006');
    return profile;
}

function printWorkspace(ws: Workspace, globalOpts: GlobalOptions): void {
    if (globalOpts.format === 'json' || globalOpts.format === 'raw') {
        console.log(formatJson({ status: 'success', data: ws }));
    } else {
        console.log(formatList(workspaceToDisplay(ws)));
    }
}

function parseScopeOpts(opts: Record<string, string>): {
    productId?: number;
    projectId?: number;
    executionId?: number;
    nameOpt?: string;
    hasScopeOpts: boolean;
} {
    const productId = parsePositiveId(opts.product, 'product');
    const projectId = parsePositiveId(opts.project, 'project');
    const executionId = parsePositiveId(opts.execution, 'execution');
    const nameOpt = opts.name?.trim() ? opts.name.trim() : undefined;
    return {
        productId,
        projectId,
        executionId,
        nameOpt,
        hasScopeOpts: productId !== undefined || projectId !== undefined || executionId !== undefined,
    };
}

const SCOPE_OPTIONS = [
    ['--product <id>', '产品 ID'] as const,
    ['--project <id>', '项目 ID'] as const,
    ['--execution <id>', '执行 ID'] as const,
    ['--name <name>', '工作区名称/备注（本地标识）'] as const,
];

function addScopeOptions(cmd: Command): Command {
    for (const [flags, desc] of SCOPE_OPTIONS) {
        cmd.option(flags, desc);
    }
    return cmd;
}

/** 注册 `zentao workspace` 及其子命令 */
export function registerWorkspaceCommand(program: Command): void {
    const wsCmd = program
        .command('workspace')
        .description('管理工作区（当前产品 / 项目 / 执行上下文）')
        .argument('[id]', '工作区 ID 或名称')
        .action((id: string | undefined) => {
            const globalOpts = program.opts() as GlobalOptions;
            try {
                const profile = requireProfile();

                if (id && !['ls', 'set', 'add', 'rm', 'remove', 'delete'].includes(id)) {
                    const ws = resolveWorkspaceSelector(profile, id);
                    printWorkspace(ws, globalOpts);
                    return;
                }

                const ws = getCurrentWorkspace(profile);
                printWorkspace(ws, globalOpts);
                if (!globalOpts.silent && globalOpts.format !== 'json' && globalOpts.format !== 'raw') {
                    if (!workspaceHasScope(ws)) {
                        console.error('提示: 当前工作区尚未设置范围，可执行 zentao workspace set --product=<id>（或 add / --project / --execution）');
                    }
                }
            } catch (error) {
                if (error instanceof ZentaoError) {
                    console.error(formatError(error, globalOpts.format ?? 'markdown'));
                    process.exit(1);
                }
                throw error;
            }
        });

    wsCmd
        .command('ls')
        .description('查看所有工作区（当前优先，其余按最近使用排序）')
        .action(() => {
            const globalOpts = program.opts() as GlobalOptions;
            try {
                const profile = requireProfile();
                const workspaces = listWorkspaces(profile);
                const currentId = profile.currentWorkspace;

                if (globalOpts.format === 'json' || globalOpts.format === 'raw') {
                    console.log(formatJson({ status: 'success', data: workspaces }));
                    return;
                }

                if (workspaces.length === 0) {
                    console.log('暂无工作区');
                    return;
                }

                const rows = workspaces.map((ws) => ({
                    ...workspaceToDisplay(ws),
                    使用中: ws.id === currentId ? '是' : '否',
                }));
                console.log(formatTable(rows));
            } catch (error) {
                if (error instanceof ZentaoError) {
                    console.error(formatError(error, globalOpts.format ?? 'markdown'));
                    process.exit(1);
                }
                throw error;
            }
        });

    // set：切换 + 就地改当前/目标工作区
    addScopeOptions(
        wsCmd
            .command('set')
            .description('切换工作区，或就地修改目标工作区的名称/范围（不新建）')
            .argument('[selector]', '工作区 ID 或名称；省略则操作当前工作区'),
    ).action(async (selector: string | undefined, opts: Record<string, string>) => {
        const globalOpts = program.opts() as GlobalOptions;
        try {
            const { productId, projectId, executionId, nameOpt, hasScopeOpts } = parseScopeOpts(opts);
            const profile = requireProfile();

            let target: Workspace | undefined;
            if (selector) {
                target = resolveWorkspaceSelector(profile, selector);
                setCurrentWorkspace(profile, target.id);
                target = getCurrentWorkspace(profile);
            } else {
                target = getCurrentWorkspace(profile);
            }

            let ws: Workspace = target;

            if (hasScopeOpts) {
                const { client, profile: authProfile } = await ensureAuth({
                    insecure: globalOpts.insecure,
                    timeout: globalOpts.timeout,
                });
                ws = await patchWorkspaceFromScopeOptions(
                    client,
                    authProfile,
                    {
                        product: productId,
                        project: projectId,
                        execution: executionId,
                        name: nameOpt,
                    },
                    target.id,
                );
            } else if (nameOpt) {
                const renamed = setWorkspaceName(profile, nameOpt, target.id);
                if (!renamed) throw new ZentaoError('E4001');
                ws = renamed;
            } else if (!selector) {
                throw new ZentaoError('E2009', {
                    option: 'set',
                    reason: '请提供工作区 ID/名称，或 --name / --product / --project / --execution',
                });
            }

            if (!globalOpts.silent) {
                printWorkspace(ws, globalOpts);
            }
        } catch (error) {
            if (error instanceof ZentaoError) {
                console.error(formatError(error, globalOpts.format ?? 'markdown'));
                process.exit(1);
            }
            throw error;
        }
    });

    // add：按对象新建或切换到对应主键工作区（原 set --product 语义）
    addScopeOptions(
        wsCmd
            .command('add')
            .description('按产品/项目/执行新建或切换到对应工作区（按主键复用）'),
    ).action(async (opts: Record<string, string>) => {
        const globalOpts = program.opts() as GlobalOptions;
        try {
            const { productId, projectId, executionId, nameOpt, hasScopeOpts } = parseScopeOpts(opts);
            if (!hasScopeOpts) {
                throw new ZentaoError('E2009', {
                    option: 'add',
                    reason: '请提供 --product / --project / --execution',
                });
            }

            const { client, profile } = await ensureAuth({
                insecure: globalOpts.insecure,
                timeout: globalOpts.timeout,
            });
            const ws = await setWorkspaceFromScopeOptions(client, profile, {
                product: productId,
                project: projectId,
                execution: executionId,
                name: nameOpt,
            });

            if (!globalOpts.silent) {
                printWorkspace(ws, globalOpts);
            }
        } catch (error) {
            if (error instanceof ZentaoError) {
                console.error(formatError(error, globalOpts.format ?? 'markdown'));
                process.exit(1);
            }
            throw error;
        }
    });

    wsCmd
        .command('rm')
        .aliases(['remove', 'delete'])
        .description('删除工作区（删当前区时自动切换到最近使用的其他区）')
        .argument('<selector>', '工作区 ID 或名称')
        .action((selector: string) => {
            const globalOpts = program.opts() as GlobalOptions;
            try {
                const profile = requireProfile();
                const target = resolveWorkspaceSelector(profile, selector);
                const removed = removeWorkspace(profile, target.id);

                if (!globalOpts.silent) {
                    if (globalOpts.format === 'json' || globalOpts.format === 'raw') {
                        console.log(formatJson({
                            status: 'success',
                            data: {
                                removed,
                                current: getCurrentWorkspace(profile),
                            },
                        }));
                    } else {
                        console.log(`已删除工作区 #${removed.id}${removed.name ? `「${removed.name}」` : ''}`);
                        console.log('');
                        console.log('当前工作区:');
                        printWorkspace(getCurrentWorkspace(profile), globalOpts);
                    }
                }
            } catch (error) {
                if (error instanceof ZentaoError) {
                    console.error(formatError(error, globalOpts.format ?? 'markdown'));
                    process.exit(1);
                }
                throw error;
            }
        });
}

// re-export for tests that may import helpers
export { getWorkspaceById, patchWorkspace };
