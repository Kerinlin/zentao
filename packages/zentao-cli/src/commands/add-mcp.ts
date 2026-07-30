import { Command } from 'commander';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { GlobalOptions } from '../types/index.js';
import { getCurrentProfile } from '../config/store.js';
import { multiSelect } from '../utils/multi-select.js';
import {
    MCP_AGENT_NAMES,
    MCP_AGENT_TARGETS,
    MCP_PRIMARY_NAME,
    tildeDisplay,
} from '../agent-install/targets.js';
import { deepSet, readJsonFile, writeJsonFile } from '../agent-install/json-file.js';

/** MCP stdio entry: relies on `zentao login` profile (no env credentials). */
function buildMcpEntry() {
    return {
        command: 'zentao',
        args: ['mcp'],
    };
}

/* ── Auth gate ── */

/** MCP reuses local profile from `zentao login`; no password in agent config. */
function requireLoggedInProfile(): { account: string; server: string } {
    const profile = getCurrentProfile();
    if (!profile?.token) {
        throw new Error('未登录禅道，请先运行 zentao login');
    }
    return { account: profile.account, server: profile.server };
}

/* ── Agent Selection ── */

async function promptAgentSelection(): Promise<string[]> {
    if (!process.stdin.isTTY || !process.stderr.isTTY) {
        throw new Error(
            `未指定 agent，请在交互终端中选择，或显式传入: ${MCP_AGENT_NAMES.join('|')}|all`,
        );
    }

    try {
        return await multiSelect({
            title: '请选择要配置的 AI Agent（可多选）:',
            items: MCP_AGENT_NAMES.map((name) => ({
                value: name,
                label: MCP_AGENT_TARGETS[name].label,
            })),
            min: 1,
        });
    } catch (error) {
        const msg = String((error as Error).message ?? error);
        if (msg.includes('不支持交互多选') || msg.includes('当前终端')) {
            throw new Error(
                `未指定 agent，请在交互终端中选择，或显式传入: ${MCP_AGENT_NAMES.join('|')}|all`,
            );
        }
        throw error;
    }
}

function resolveAgents(agent: string): string[] {
    const normalized = agent.toLowerCase();
    if (normalized === 'all') return [...MCP_AGENT_NAMES];
    if (MCP_AGENT_TARGETS[normalized]) return [normalized];
    throw new Error(
        `不支持的 agent: ${agent}\n可用选项: ${MCP_AGENT_NAMES.join('、')}、all`,
    );
}

/* ── Config Writers ── */

function writeMcpServersConfig(configPath: string): void {
    const config = readJsonFile(configPath);
    deepSet(config, ['mcpServers', MCP_PRIMARY_NAME], buildMcpEntry());
    writeJsonFile(configPath, config);
}

function writeVscodeConfig(configPath: string): void {
    const config = readJsonFile(configPath, true);
    deepSet(config, ['servers', MCP_PRIMARY_NAME], {
        type: 'stdio',
        ...buildMcpEntry(),
    });
    writeJsonFile(configPath, config);
}

function writeOpenCodeConfig(configPath: string): void {
    const config = readJsonFile(configPath);
    deepSet(config, ['mcp', MCP_PRIMARY_NAME], {
        type: 'local',
        command: ['zentao', 'mcp'],
        enabled: true,
    });
    writeJsonFile(configPath, config);
}

function writeCodexToml(configPath: string): void {
    mkdirSync(dirname(configPath), { recursive: true });

    let content = existsSync(configPath) ? readFileSync(configPath, 'utf-8') : '';

    const sectionHeader = `[mcp_servers.${MCP_PRIMARY_NAME}]`;
    const section = [
        sectionHeader,
        'command = "zentao"',
        'args = ["mcp"]',
    ].join('\n') + '\n';

    const headerIdx = content.indexOf(sectionHeader);
    if (headerIdx >= 0) {
        let nextSectionIdx = content.indexOf('\n[', headerIdx + sectionHeader.length);
        if (nextSectionIdx < 0) {
            content = content.substring(0, headerIdx) + section;
        } else {
            content = content.substring(0, headerIdx) + section + content.substring(nextSectionIdx);
        }
    } else {
        const trimmed = content.trimEnd();
        content = (trimmed ? trimmed + '\n\n' : '') + section;
    }

    writeFileSync(configPath, content, 'utf-8');
}

function printCherryStudioConfig(silent: boolean): void {
    if (silent) return;
    const entry = buildMcpEntry();
    process.stderr.write('\nCherry Studio 不支持文件配置，请在 Settings > MCP Server 中手动添加:\n\n');
    console.log(JSON.stringify({ name: MCP_PRIMARY_NAME, type: 'stdio', ...entry }, null, 2));
}

/* ── Main Install Logic ── */

function installMcp(agent: string, silent: boolean): void {
    const target = MCP_AGENT_TARGETS[agent];

    switch (target.format) {
        case 'mcpServers':
            writeMcpServersConfig(target.configPath);
            break;
        case 'vscode':
            writeVscodeConfig(target.configPath);
            break;
        case 'opencode':
            writeOpenCodeConfig(target.configPath);
            break;
        case 'codex':
            writeCodexToml(target.configPath);
            break;
        case 'cherry-studio':
            printCherryStudioConfig(silent);
            return;
    }

    if (!silent) {
        console.log(`已配置 MCP 到 ${target.label}: ${tildeDisplay(target.configPath)}`);
    }
}

/* ── Command Registration ── */

/** 注册 `zentao add-mcp`：配置禅道 MCP 服务到 AI Agent */
export function registerAddMcpCommand(program: Command): void {
    program
        .command('add-mcp')
        .description('配置禅道 MCP 服务到 AI Agent')
        .argument('[agent]', `目标 Agent (${MCP_AGENT_NAMES.join('|')}|all)`)
        .action(async (agent?: string) => {
            const globalOpts = program.opts() as GlobalOptions;
            const silent = !!globalOpts.silent;

            try {
                const profile = requireLoggedInProfile();
                const agents = agent ? resolveAgents(agent) : await promptAgentSelection();

                if (!silent) {
                    console.log(`使用当前登录: ${profile.account}@${profile.server}`);
                    console.log('MCP 将通过本地 zentao 配置鉴权（无需在 Agent 配置中写入密码）');
                }

                for (const a of agents) {
                    installMcp(a, silent);
                }
            } catch (error) {
                console.error(String((error as Error).message ?? error));
                process.exit(1);
            }
        });
}
