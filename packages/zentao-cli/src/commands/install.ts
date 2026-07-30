import { Command } from 'commander';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import { createInterface, type Interface } from 'node:readline';
import type { GlobalOptions } from '../types/index.js';
import { PACKAGE_NAME, fetchLatestVersion } from '../utils/update-notifier.js';
import { getCurrentProfile } from '../config/store.js';
import { runAddSkill } from './add-skill.js';
import { runAddMcp } from './add-mcp.js';

const NODE_MIN_MAJOR = 18;
const NODE_LTS_MAJOR = 22;

/** 交互式问答 helper —— 串行化避免连续调用时的 readline 缓冲问题 */
async function ask(rl: Interface, question: string): Promise<string> {
    await drainStdin();
    return new Promise((resolve) => {
        rl.question(question, (answer) => resolve(answer.trim()));
    });
}

async function confirm(rl: Interface, question: string, defaultValue = false): Promise<boolean> {
    const hint = defaultValue ? '[Y/n]' : '[y/N]';
    await drainStdin();
    return new Promise((resolve) => {
        rl.question(`${question} ${hint} `, (answer) => {
            const v = answer.trim().toLowerCase();
            if (v === '') return resolve(defaultValue);
            resolve(v === 'y' || v === 'yes');
        });
    });
}

/** 清空 stdin 残留数据，防止上一个回车的换行符被下一次 question 读到 */
function drainStdin(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve));
}

function safeCloseRl(rl: Interface): void {
    try {
        rl.close();
    } catch {
        /* already closed */
    }
}

/** 获取 node 版本号（如 '20.11.0'），未装返回 null */
function getNodeVersion(): string | null {
    try {
        const result = spawnSync('node', ['--version'], { encoding: 'utf-8', shell: process.platform === 'win32' });
        if (result.status !== 0) return null;
        const v = result.stdout.trim().replace(/^v/, '');
        return /^\d+\.\d+\.\d+/.test(v) ? v : null;
    } catch {
        return null;
    }
}

/** npm 全局安装参数 */
function buildNpmInstallArgs(): { cmd: string; args: string[] } {
    return { cmd: 'npm', args: ['install', '-g', `${PACKAGE_NAME}@latest`] };
}

/** 解析 npm 全局 bin 目录，用于刚安装完 zentao 却不在当前 PATH 时定位二进制 */
function resolveNpmGlobalBin(): string | null {
    try {
        const result = spawnSync('npm', ['prefix', '-g'], {
            encoding: 'utf-8',
            shell: process.platform === 'win32',
        });
        if (result.status !== 0) return null;
        let out = result.stdout.trim().split(/\r?\n/)[0];
        if (!out) return null;
        return process.platform === 'win32' ? out : `${out}/bin`;
    } catch {
        return null;
    }
}

/** PATH / npm global 上的 zentao（仅作自调用失败时的兜底） */
function resolveZentaoBinFromPath(): string {
    const direct = spawnSync(
        process.platform === 'win32' ? 'where' : 'which',
        ['zentao'],
        { encoding: 'utf-8', shell: false },
    );
    if (direct.status === 0) {
        const found = direct.stdout.trim().split(/\r?\n/)[0];
        if (found) return found;
    }
    const binDir = resolveNpmGlobalBin();
    if (binDir) {
        const candidate = process.platform === 'win32'
            ? `${binDir}/zentao.cmd`
            : `${binDir}/zentao`;
        if (existsSync(candidate)) return candidate;
    }
    return 'zentao';
}

/**
 * 用当前进程同一入口再跑子命令，避免 install 命中 PATH 上旧版全局 zentao。
 * - node/bun + script：`execPath entry ...args`
 * - standalone 二进制：`execPath ...args`
 */
function runZentaoSubcommand(args: string[]): number {
    const entry = process.argv[1];
    if (entry && existsSync(entry)) {
        const result = spawnSync(process.execPath, [entry, ...args], {
            stdio: 'inherit',
            encoding: 'utf-8',
        });
        return result.status ?? 1;
    }

    const execBase = basename(process.execPath);
    const isRuntime = /^(node|bun)(\.exe)?$/i.test(execBase);
    if (!isRuntime) {
        const result = spawnSync(process.execPath, args, {
            stdio: 'inherit',
            encoding: 'utf-8',
        });
        return result.status ?? 1;
    }

    const zentaoBin = resolveZentaoBinFromPath();
    const result = spawnSync(zentaoBin, args, {
        stdio: 'inherit',
        shell: process.platform === 'win32',
        encoding: 'utf-8',
    });
    return result.status ?? 1;
}

/** 已安装 CLI 检测（必须真实命中 PATH，避免 npx 缓存造成的误判） */
function getInstalledCliVersion(): string | null {
    const probe = process.platform === 'win32' ? 'where' : 'which';
    try {
        // 先确认 zentao 真实存在于 PATH，避免 shell:true 命中 npx 缓存
        const locate = spawnSync(probe, ['zentao'], { encoding: 'utf-8', shell: false });
        if (locate.status !== 0) return null;
        const result = spawnSync('zentao', ['version'], { encoding: 'utf-8', shell: process.platform === 'win32' });
        if (result.status !== 0) return null;
        const m = result.stdout.match(/(\d+\.\d+\.\d+)/);
        return m ? m[1] : null;
    } catch {
        return null;
    }
}

/** 检测 stdin 是否为交互式终端（curl|sh 管道下为 false） */
function isInteractiveStdin(): boolean {
    return Boolean(process.stdin.isTTY);
}

/** Node 安装指引（引导脚本会真正执行安装，这里仅作为 TS 子命令内的最后兜底） */
function printNodeInstallGuidance(rl: Interface): void {
    const msg = `\x1b[33m未检测到 Node.js ${NODE_MIN_MAJOR}+，无法继续。\x1b[0m\n` +
        `请先安装 Node.js ${NODE_LTS_MAJOR} LTS：\n` +
        `  macOS:   brew install node\n` +
        `  Windows: winget install OpenJS.NodeJS.LTS\n` +
        `  Linux:   使用对应发行版包管理器\n` +
        `或访问 https://nodejs.org/ 下载安装包。\n` +
        `安装完成后重新运行: zentao install\n`;
    process.stderr.write(msg);
}

/** 子命令入口 */
export function registerInstallCommand(program: Command): void {
    program
        .command('install')
        .description('一键安装或配置 zentao-cli（检测环境 → 安装 → 登录 → 选择 skill/MCP）')
        .option('-y, --yes', '跳过所有交互确认，使用默认值')
        .action(async (opts: { yes?: boolean }) => {
            const globalOpts = program.opts() as GlobalOptions;
            if (globalOpts.silent) {
                console.error('install 子命令需要交互式终端，请勿搭配 --silent。');
                process.exit(2);
            }

            // curl|sh 管道没有 tty，强制走非交互路径（默认值 = 覆盖升级 + 登录 + 装技能）
            const interactive = !opts.yes && isInteractiveStdin();
            const rl = createInterface({
                input: process.stdin,
                output: process.stdout,
                terminal: process.stdin.isTTY ?? false,
            });

            try {
                // 步骤 1：幂等检测 + 远程版本对比
                // - 已是最新 / 无法获取远程：不询问，直接进入后续配置
                // - 本地 ≠ 远程：交互询问 跳过 / 覆盖升级 / 退出；非交互默认覆盖升级
                const installed = getInstalledCliVersion();
                if (installed) {
                    let latest: string | null = null;
                    try {
                        latest = await fetchLatestVersion();
                    } catch { /* 离线场景忽略 */ }

                    if (!latest || latest === installed) {
                        const label = latest
                            ? `${installed}（已是最新版）`
                            : `${installed}（无法获取远程版本）`;
                        console.log(`检测到已安装 zentao-cli ${label}`);
                        console.log('跳过安装步骤，继续配置流程。\n');
                        await runPostInstallFlow(rl, interactive);
                        return;
                    }

                    console.log(`检测到 zentao-cli 本地 ${installed}，远程 ${latest}`);
                    let action: 'skip' | 'upgrade' | 'exit' = interactive ? 'skip' : 'upgrade';
                    if (interactive) {
                        const a = await ask(rl, '本地与远程版本不一致，请选择: 1) 跳过安装 2) 覆盖升级 3) 退出 [1] ');
                        if (a === '2') action = 'upgrade';
                        else if (a === '3') action = 'exit';
                        else action = 'skip';
                    }
                    if (action === 'exit') {
                        console.log('已退出。');
                        return;
                    }
                    if (action === 'skip') {
                        console.log('跳过安装步骤，继续配置流程。\n');
                        await runPostInstallFlow(rl, interactive);
                        return;
                    }
                    console.log(`覆盖升级 ${installed} → ${latest}...`);
                    // 继续走步骤 2~4 执行全局安装
                }

                // 步骤 2：Node 检测
                const nodeVer = getNodeVersion();
                if (!nodeVer) {
                    printNodeInstallGuidance(rl);
                    process.exit(1);
                }
                const nodeMajor = Number(nodeVer.split('.')[0]);
                if (nodeMajor < NODE_MIN_MAJOR) {
                    console.error(`Node 版本过低: ${nodeVer}，需要 ${NODE_MIN_MAJOR}+。请升级 Node 后重试。`);
                    process.exit(1);
                }
                console.log(`✓ Node ${nodeVer}`);

                // 步骤 3：固定使用 npm
                console.log('✓ 使用 npm 安装');

                // 步骤 4：执行全局安装
                const { cmd, args } = buildNpmInstallArgs();
                console.log(`\n执行: ${cmd} ${args.join(' ')}\n`);
                const result = spawnSync(cmd, args, {
                    stdio: 'inherit',
                    shell: process.platform === 'win32',
                    encoding: 'utf-8',
                });
                if (result.status !== 0) {
                    console.error(`\n安装失败（退出码 ${result.status}）。请手动执行: ${cmd} ${args.join(' ')}`);
                    process.exit(1);
                }

                console.log('\n✓ zentao-cli 安装完成');
                await runPostInstallFlow(rl, interactive);
            } finally {
                safeCloseRl(rl);
            }
        });
}

/** AI 接入方式：skill / mcp / 两者 / 跳过 */
type AgentIntegrationChoice = 'skill' | 'mcp' | 'both' | 'skip';

/** 交互选择 skill 或 MCP（编号） */
async function askAgentIntegration(rl: Interface): Promise<AgentIntegrationChoice> {
    console.log('\n请选择要配置的 AI 接入方式:');
    console.log('  1) CLI 技能  (zentao add-skill)  — Agent 通过 skill 调 CLI');
    console.log('  2) MCP 服务  (zentao add-mcp)    — Agent 通过 MCP tools 调禅道（需已登录）');
    console.log('  3) 两者都装');
    console.log('  4) 跳过');
    const answer = await ask(rl, '请输入编号 [1]: ');
    switch (answer) {
        case '2':
            return 'mcp';
        case '3':
            return 'both';
        case '4':
        case 'n':
        case 'N':
            return 'skip';
        case '1':
        case '':
        default:
            // 非法输入时默认 skill，与「编号默认 1」一致
            if (answer !== '' && answer !== '1') {
                console.log(`未识别「${answer}」，按 1) CLI 技能 处理。`);
            }
            return 'skill';
    }
}

/** 安装后的「登录 → 选择 skill/MCP」流程 */
async function runPostInstallFlow(rl: Interface, interactive: boolean): Promise<void> {
    // 非交互模式（curl|sh 管道）：跳过需要 TTY 输入的 login/add-skill/add-mcp
    if (!interactive) {
        console.log('\n安装完成。请在终端中运行以下命令完成配置:');
        console.log('  zentao login       # 登录禅道服务');
        console.log('  zentao add-skill   # 安装 AI Agent 技能');
        console.log('  zentao add-mcp     # 或配置 MCP 服务（需已登录）\n');
        return;
    }

    // ── 1) 先完成登录（再谈 skill/MCP）────────────────────────────
    const existing = getCurrentProfile();
    let doLogin: boolean;
    if (existing) {
        console.log(`\n检测到本地登录配置（非安装默认值，来自本机 ~/.config/zentao）:`);
        console.log(`  ${existing.account}@${existing.server}`);
        doLogin = await confirm(rl, '是否重新登录 / 切换禅道账号？', false);
    } else {
        doLogin = await confirm(rl, '\n是否立即登录禅道服务？', true);
    }

    if (doLogin) {
        // 关闭 readline，把 stdin 交给 login 交互
        safeCloseRl(rl);
        await drainStdin();
        const status = runZentaoSubcommand(['login']);
        if (status !== 0) {
            console.error('登录失败，请稍后使用 `zentao login` 重试。');
            process.exit(1);
        }
        // login 结束后重新打开 readline，供后续选择 skill/MCP
        const rl2 = createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: process.stdin.isTTY ?? false,
        });
        try {
            await chooseAndRunAgentIntegration(rl2);
        } finally {
            safeCloseRl(rl2);
        }
        printInstallDone();
        return;
    }

    // 未重新登录：继续用当前 profile（若无 profile，MCP 会失败并提示先 login）
    await chooseAndRunAgentIntegration(rl);
    safeCloseRl(rl);
    printInstallDone();
}

/** 选择并执行 add-skill / add-mcp（调用前/后自行管理 readline 生命周期） */
async function chooseAndRunAgentIntegration(rl: Interface): Promise<void> {
    const choice = await askAgentIntegration(rl);

    // multi-select / 子流程需要独占 stdin
    safeCloseRl(rl);
    await drainStdin();

    if (choice === 'skip') {
        console.log('已跳过 AI Agent 配置。稍后可运行: zentao add-skill 或 zentao add-mcp');
        return;
    }

    if (choice === 'skill' || choice === 'both') {
        try {
            console.log('\n── 安装 CLI 技能 (add-skill) ──');
            await runAddSkill();
        } catch (error) {
            console.error(String((error as Error).message ?? error));
            console.error('技能安装失败，请稍后使用 `zentao add-skill` 重试。');
            process.exit(1);
        }
    }

    if (choice === 'mcp' || choice === 'both') {
        try {
            console.log('\n── 配置 MCP 服务 (add-mcp) ──');
            const profile = getCurrentProfile();
            if (!profile?.token) {
                console.error('配置 MCP 需要先登录。请运行 `zentao login` 后再执行 `zentao add-mcp`。');
                process.exit(1);
            }
            await runAddMcp();
        } catch (error) {
            console.error(String((error as Error).message ?? error));
            console.error('MCP 配置失败，请稍后使用 `zentao add-mcp` 重试。');
            process.exit(1);
        }
    }
}

function printInstallDone(): void {
    console.log('\n\x1b[32m✓ 配置完成！\x1b[0m\n');
    console.log('快速上手:');
    console.log('  zentao                  # 查看可用命令');
    console.log('  zentao login            # 重新登录或切换账号');
    console.log('  zentao add-skill        # 安装 CLI 技能到 AI Agent');
    console.log('  zentao add-mcp          # 配置 MCP 服务到 AI Agent');
    console.log('  zentao help             # 查看帮助');
    console.log('');
}
