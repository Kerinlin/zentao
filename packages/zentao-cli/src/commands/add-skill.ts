import { Command } from 'commander';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GlobalOptions } from '../types/index.js';
import { multiSelect } from '../utils/multi-select.js';
import {
    SKILL_AGENT_NAMES,
    SKILL_AGENT_TARGETS,
    SKILL_NAMES,
    tildeDisplay,
} from '../agent-install/targets.js';

function resolveSkillSource(skillName: string): string {
    const thisFile = fileURLToPath(import.meta.url);
    const thisDir = dirname(thisFile);

    const candidates = [
        join(thisDir, '..', '..', 'skills', skillName),       // from src/commands/
        join(thisDir, '..', 'skills', skillName),             // from dist/
        join(thisDir, '..', '..', '..', 'skills', skillName), // from dist/ in node_modules
    ];

    for (const candidate of candidates) {
        if (existsSync(candidate)) return candidate;
    }

    throw new Error(
        `找不到技能源目录，已尝试路径:\n${candidates.map((p) => `  - ${p}`).join('\n')}\n` +
        '请确认 zentao-cli 安装完整，或从源码目录运行。',
    );
}

async function promptAgentSelection(): Promise<string[]> {
    if (!process.stdin.isTTY || !process.stderr.isTTY) {
        throw new Error(
            `未指定 agent，请在交互终端中选择，或显式传入: ${SKILL_AGENT_NAMES.join('|')}|all`,
        );
    }

    try {
        return await multiSelect({
            title: '请选择要安装的 AI Agent（可多选）:',
            items: SKILL_AGENT_NAMES.map((name) => ({
                value: name,
                label: SKILL_AGENT_TARGETS[name].label,
            })),
            min: 1,
        });
    } catch (error) {
        const msg = String((error as Error).message ?? error);
        if (msg.includes('不支持交互多选') || msg.includes('当前终端')) {
            throw new Error(
                `未指定 agent，请在交互终端中选择，或显式传入: ${SKILL_AGENT_NAMES.join('|')}|all`,
            );
        }
        throw error;
    }
}

function resolveAgents(agent: string): string[] {
    const normalized = agent.toLowerCase();
    if (normalized === 'all') return [...SKILL_AGENT_NAMES];
    if (SKILL_AGENT_TARGETS[normalized]) return [normalized];
    throw new Error(
        `不支持的 agent: ${agent}\n可用选项: ${SKILL_AGENT_NAMES.join('、')}、all`,
    );
}

function copySkillDir(srcDir: string, destDir: string): void {
    mkdirSync(destDir, { recursive: true });
    for (const entry of readdirSync(srcDir)) {
        const srcPath = join(srcDir, entry);
        const destPath = join(destDir, entry);
        if (statSync(srcPath).isDirectory()) {
            copySkillDir(srcPath, destPath);
        } else {
            writeFileSync(destPath, readFileSync(srcPath));
        }
    }
}

function installSkill(agent: string, skillName: string, silent: boolean): void {
    const target = SKILL_AGENT_TARGETS[agent];
    const sourcePath = resolveSkillSource(skillName);
    const destDir = join(target.dir, skillName);

    copySkillDir(sourcePath, destDir);

    if (!silent) {
        console.log(`已安装 ${skillName} 技能到 ${target.label}: ${tildeDisplay(destDir)}`);
    }
}

/**
 * 安装技能（供 `add-skill` 命令与 `install` 同进程调用）。
 * 未传 agent 时走交互多选。
 */
export async function runAddSkill(options: { agent?: string; silent?: boolean } = {}): Promise<void> {
    const silent = !!options.silent;
    const agents = options.agent ? resolveAgents(options.agent) : await promptAgentSelection();

    for (const a of agents) {
        for (const skillName of SKILL_NAMES) {
            installSkill(a, skillName, silent);
        }
    }
}

/** 注册 `zentao add-skill`：安装禅道 CLI 技能到 AI Agent */
export function registerAddSkillCommand(program: Command): void {
    program
        .command('add-skill')
        .description('安装禅道 CLI 技能到 AI Agent')
        .argument('[agent]', `目标 Agent (${SKILL_AGENT_NAMES.join('|')}|all)`)
        .action(async (agent?: string) => {
            const globalOpts = program.opts() as GlobalOptions;
            try {
                await runAddSkill({ agent, silent: !!globalOpts.silent });
            } catch (error) {
                console.error(String((error as Error).message ?? error));
                process.exit(1);
            }
        });
}
