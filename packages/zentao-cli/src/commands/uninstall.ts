import { Command } from 'commander';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import {
    MCP_AGENT_TARGETS,
    MCP_SERVER_KEYS,
    SKILL_AGENT_TARGETS,
    SKILL_NAMES,
    getCompletionScriptPaths,
    tildeDisplay,
    type McpAgentTarget,
} from '../agent-install/targets.js';
import { deepDeleteKeys, readJsonFile, writeJsonFile } from '../agent-install/json-file.js';
import { getConfigPath } from '../config/store.js';
import { PACKAGE_NAME } from '../utils/update-notifier.js';
import type { GlobalOptions } from '../types/index.js';

type ItemStatus = 'ok' | 'skip' | 'fail' | 'manual';

interface PlanItem {
    kind: 'skill' | 'mcp' | 'completion' | 'config' | 'cli' | 'manual';
    label: string;
    detail: string;
    /** Absolute path when relevant */
    path?: string;
    agent?: string;
    format?: McpAgentTarget['format'];
}

interface RunResult {
    status: ItemStatus;
    message: string;
}

/* ── Plan builders ── */

function planSkillRemovals(): PlanItem[] {
    const items: PlanItem[] = [];
    for (const [agent, target] of Object.entries(SKILL_AGENT_TARGETS)) {
        for (const skillName of SKILL_NAMES) {
            const path = join(target.dir, skillName);
            if (!existsSync(path)) continue;
            items.push({
                kind: 'skill',
                label: `${target.label} / ${skillName}`,
                detail: tildeDisplay(path),
                path,
                agent,
            });
        }
    }
    return items;
}

function mcpKeysPresent(container: unknown): string[] {
    if (!container || typeof container !== 'object' || Array.isArray(container)) return [];
    const obj = container as Record<string, unknown>;
    return MCP_SERVER_KEYS.filter((k) => Object.prototype.hasOwnProperty.call(obj, k));
}

function planMcpRemovals(): PlanItem[] {
    const items: PlanItem[] = [];

    for (const [agent, target] of Object.entries(MCP_AGENT_TARGETS)) {
        if (target.format === 'cherry-studio') {
            items.push({
                kind: 'manual',
                label: `${target.label} MCP`,
                detail: '无文件配置，请在 Settings > MCP Server 中手动移除 zentao / zentao-cli',
                agent,
                format: target.format,
            });
            continue;
        }

        if (!target.configPath || !existsSync(target.configPath)) continue;

        try {
            if (target.format === 'codex') {
                const content = readFileSync(target.configPath, 'utf-8');
                const found = MCP_SERVER_KEYS.filter((k) => content.includes(`[mcp_servers.${k}]`));
                if (found.length === 0) continue;
                items.push({
                    kind: 'mcp',
                    label: `${target.label} MCP`,
                    detail: `${tildeDisplay(target.configPath)} 键: ${found.join(', ')}`,
                    path: target.configPath,
                    agent,
                    format: target.format,
                });
                continue;
            }

            const jsonc = target.format === 'vscode';
            const config = readJsonFile(target.configPath, jsonc);
            let parent: unknown;
            if (target.format === 'mcpServers') parent = config.mcpServers;
            else if (target.format === 'vscode') parent = config.servers;
            else if (target.format === 'opencode') parent = config.mcp;
            else parent = undefined;

            const found = mcpKeysPresent(parent);
            if (found.length === 0) continue;

            items.push({
                kind: 'mcp',
                label: `${target.label} MCP`,
                detail: `${tildeDisplay(target.configPath)} 键: ${found.join(', ')}`,
                path: target.configPath,
                agent,
                format: target.format,
            });
        } catch {
            items.push({
                kind: 'mcp',
                label: `${target.label} MCP`,
                detail: `${tildeDisplay(target.configPath)}（将尝试清理，可能因解析失败而失败）`,
                path: target.configPath,
                agent,
                format: target.format,
            });
        }
    }

    return items;
}

function planCompletionRemovals(): PlanItem[] {
    return getCompletionScriptPaths()
        .filter((p) => existsSync(p))
        .map((path) => ({
            kind: 'completion' as const,
            label: 'Shell 补全脚本',
            detail: tildeDisplay(path),
            path,
        }));
}

function planConfigPurge(purge: boolean): PlanItem[] {
    if (!purge) return [];
    const path = getConfigPath();
    if (!existsSync(path)) {
        return [{
            kind: 'config',
            label: '本地配置 (--purge)',
            detail: `${tildeDisplay(path)}（不存在，将跳过）`,
            path,
        }];
    }
    return [{
        kind: 'config',
        label: '本地配置 (--purge)',
        detail: tildeDisplay(path),
        path,
    }];
}

function planCliRemoval(): PlanItem {
    return {
        kind: 'cli',
        label: '全局 CLI 包',
        detail: `npm uninstall -g ${PACKAGE_NAME}`,
    };
}

function buildPlan(purge: boolean): PlanItem[] {
    return [
        ...planSkillRemovals(),
        ...planMcpRemovals(),
        ...planCompletionRemovals(),
        ...planConfigPurge(purge),
        planCliRemoval(),
    ];
}

/* ── Executors ── */

function removeSkill(item: PlanItem): RunResult {
    if (!item.path) return { status: 'skip', message: '无路径' };
    if (!existsSync(item.path)) return { status: 'skip', message: '已不存在' };
    try {
        rmSync(item.path, { recursive: true, force: true });
        return { status: 'ok', message: `已删除 ${tildeDisplay(item.path)}` };
    } catch (error) {
        return { status: 'fail', message: String((error as Error).message ?? error) };
    }
}

function removeCodexSections(content: string, keys: readonly string[]): { content: string; removed: string[] } {
    let next = content;
    const removed: string[] = [];
    for (const key of keys) {
        const header = `[mcp_servers.${key}]`;
        const headerIdx = next.indexOf(header);
        if (headerIdx < 0) continue;
        const nextSectionIdx = next.indexOf('\n[', headerIdx + header.length);
        const endIdx = nextSectionIdx < 0 ? next.length : nextSectionIdx;
        next = next.slice(0, headerIdx) + next.slice(endIdx);
        next = next.replace(/\n{3,}/g, '\n\n');
        removed.push(key);
    }
    const trimmed = next.trim();
    return {
        content: trimmed ? `${trimmed}\n` : '',
        removed,
    };
}

function removeMcp(item: PlanItem): RunResult {
    if (item.kind === 'manual' || item.format === 'cherry-studio') {
        return { status: 'manual', message: item.detail };
    }
    if (!item.path || !item.format) return { status: 'skip', message: '无路径' };
    if (!existsSync(item.path)) return { status: 'skip', message: '配置文件不存在' };

    try {
        if (item.format === 'codex') {
            const raw = readFileSync(item.path, 'utf-8');
            const { content, removed } = removeCodexSections(raw, MCP_SERVER_KEYS);
            if (removed.length === 0) return { status: 'skip', message: '未找到 MCP 段' };
            writeFileSync(item.path, content, 'utf-8');
            return { status: 'ok', message: `已移除 ${removed.join(', ')} @ ${tildeDisplay(item.path)}` };
        }

        const jsonc = item.format === 'vscode';
        const config = readJsonFile(item.path, jsonc);
        let parentPath: string[];
        if (item.format === 'mcpServers') parentPath = ['mcpServers'];
        else if (item.format === 'vscode') parentPath = ['servers'];
        else if (item.format === 'opencode') parentPath = ['mcp'];
        else return { status: 'skip', message: `不支持的 format: ${item.format}` };

        const removed = deepDeleteKeys(config, parentPath, MCP_SERVER_KEYS);
        if (removed.length === 0) return { status: 'skip', message: '未找到 MCP 键' };
        writeJsonFile(item.path, config);
        return { status: 'ok', message: `已移除 ${removed.join(', ')} @ ${tildeDisplay(item.path)}` };
    } catch (error) {
        return { status: 'fail', message: String((error as Error).message ?? error) };
    }
}

function removeFile(item: PlanItem): RunResult {
    if (!item.path) return { status: 'skip', message: '无路径' };
    if (!existsSync(item.path)) return { status: 'skip', message: '已不存在' };
    try {
        unlinkSync(item.path);
        return { status: 'ok', message: `已删除 ${tildeDisplay(item.path)}` };
    } catch (error) {
        return { status: 'fail', message: String((error as Error).message ?? error) };
    }
}

function removeCli(): RunResult {
    const result = spawnSync('npm', ['uninstall', '-g', PACKAGE_NAME], {
        encoding: 'utf-8',
        shell: process.platform === 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.error) {
        return { status: 'fail', message: result.error.message };
    }
    if (result.status !== 0) {
        const err = (result.stderr || result.stdout || '').trim();
        return {
            status: 'fail',
            message: err || `npm uninstall 退出码 ${result.status}`,
        };
    }
    const out = (result.stdout || '').trim();
    return {
        status: 'ok',
        message: out || `已执行 npm uninstall -g ${PACKAGE_NAME}`,
    };
}

function executeItem(item: PlanItem): RunResult {
    switch (item.kind) {
        case 'skill':
            return removeSkill(item);
        case 'mcp':
            return removeMcp(item);
        case 'manual':
            return { status: 'manual', message: item.detail };
        case 'completion':
        case 'config':
            return removeFile(item);
        case 'cli':
            return removeCli();
        default:
            return { status: 'skip', message: '未知类型' };
    }
}

/* ── UI ── */

function printPlan(items: PlanItem[], purge: boolean): void {
    console.log('将执行以下卸载操作:\n');
    if (items.length === 0) {
        console.log('  （无匹配项，仍会尝试 npm 卸载 CLI）\n');
        return;
    }

    const groups: { title: string; kinds: PlanItem['kind'][] }[] = [
        { title: 'Skill', kinds: ['skill'] },
        { title: 'MCP', kinds: ['mcp', 'manual'] },
        { title: '补全脚本', kinds: ['completion'] },
        { title: '本地配置', kinds: ['config'] },
        { title: 'CLI', kinds: ['cli'] },
    ];

    for (const group of groups) {
        const subset = items.filter((i) => group.kinds.includes(i.kind));
        if (subset.length === 0) continue;
        console.log(`${group.title}:`);
        for (const item of subset) {
            console.log(`  - ${item.label}: ${item.detail}`);
        }
        console.log('');
    }

    if (!purge) {
        console.log('提示: 默认保留本地登录配置；彻底清除请加 --purge\n');
    }
}

async function confirmProceed(): Promise<boolean> {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        return false;
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question('确认卸载？[y/N] ', (answer) => {
            rl.close();
            const v = answer.trim().toLowerCase();
            resolve(v === 'y' || v === 'yes');
        });
    });
}

function statusIcon(status: ItemStatus): string {
    switch (status) {
        case 'ok':
            return '✓';
        case 'skip':
            return '·';
        case 'manual':
            return '!';
        case 'fail':
            return '✗';
    }
}

/* ── Main ── */

export async function runUninstall(options: {
    yes?: boolean;
    purge?: boolean;
    silent?: boolean;
} = {}): Promise<number> {
    const yes = !!options.yes;
    const purge = !!options.purge;
    const silent = !!options.silent;

    const plan = buildPlan(purge);

    if (!silent) {
        printPlan(plan, purge);
    }

    const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
    if (!yes) {
        if (!interactive) {
            if (!silent) {
                console.error('非交互环境请使用 -y/--yes 确认执行。以上为计划，未做任何修改。');
            }
            return 2;
        }
        const ok = await confirmProceed();
        if (!ok) {
            if (!silent) console.log('已取消。');
            return 0;
        }
    }

    let failCount = 0;
    let okCount = 0;
    let skipCount = 0;
    let manualCount = 0;

    for (const item of plan) {
        const result = executeItem(item);
        if (result.status === 'fail') failCount++;
        else if (result.status === 'ok') okCount++;
        else if (result.status === 'manual') manualCount++;
        else skipCount++;

        if (!silent) {
            console.log(`${statusIcon(result.status)} ${item.label}: ${result.message}`);
        }
    }

    if (!silent) {
        console.log('');
        console.log(`完成: 成功 ${okCount}，跳过 ${skipCount}，需手动 ${manualCount}，失败 ${failCount}`);
        if (failCount === 0) {
            console.log('卸载流程结束。如仍能运行 zentao，请检查 PATH 是否指向其它安装（bun/pnpm/standalone）。');
        }
    }

    return failCount > 0 ? 1 : 0;
}

/** 注册 `zentao uninstall`：卸载 skill / MCP / 补全 /（可选配置）/ CLI */
export function registerUninstallCommand(program: Command): void {
    program
        .command('uninstall')
        .description('卸载 zentao-cli：清理 Agent skill/MCP、补全脚本，并 npm 全局卸载 CLI')
        .option('-y, --yes', '跳过确认，直接执行')
        .option('--purge', '同时删除当前生效的本地配置文件（含登录凭证）')
        .action(async (opts: { yes?: boolean; purge?: boolean }) => {
            const globalOpts = program.opts() as GlobalOptions;
            try {
                const code = await runUninstall({
                    yes: !!opts.yes,
                    purge: !!opts.purge,
                    silent: !!globalOpts.silent,
                });
                process.exitCode = code;
                if (code !== 0) process.exit(code);
            } catch (error) {
                console.error(String((error as Error).message ?? error));
                process.exit(1);
            }
        });
}
