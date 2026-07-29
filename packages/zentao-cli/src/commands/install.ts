import { Command } from 'commander';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface, type Interface } from 'node:readline';
import type { GlobalOptions } from '../types/index.js';
import { PACKAGE_NAME, fetchLatestVersion } from '../utils/update-notifier.js';
import { getCurrentProfile } from '../config/store.js';

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

/** 解析 zentao 可执行文件路径：优先 PATH，再 fallback 到 npm 全局 bin */
function resolveZentaoBin(): string {
    // 1) 直接 PATH 命中
    const direct = spawnSync(
        process.platform === 'win32' ? 'where' : 'which',
        ['zentao'],
        { encoding: 'utf-8', shell: false },
    );
    if (direct.status === 0) {
        const found = direct.stdout.trim().split(/\r?\n/)[0];
        if (found) return found;
    }
    // 2) npm 全局 bin
    const binDir = resolveNpmGlobalBin();
    if (binDir) {
        const candidate = process.platform === 'win32'
            ? `${binDir}/zentao.cmd`
            : `${binDir}/zentao`;
        if (existsSync(candidate)) return candidate;
    }
    // 3) fallback 让 shell 自己找
    return 'zentao';
}

/** 调用 zentao 子命令（继承 stdio，触发其内置交互） */
function runZentaoSubcommand(args: string[]): number {
    const zentaoBin = resolveZentaoBin();
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
        .description('一键安装或配置 zentao-cli（检测环境 → 安装 → 登录 → 安装技能）')
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
                // 步骤 1：幂等检测 + 远程版本对比，远程较新则自动升级
                const installed = getInstalledCliVersion();
                if (installed) {
                    let latest: string | null = null;
                    try {
                        latest = await fetchLatestVersion();
                    } catch { /* 离线场景忽略 */ }

                    if (latest && latest !== installed) {
                        // 远程较新：直接升级，不问
                        console.log(`检测到 zentao-cli ${installed} → ${latest}，自动升级...`);
                        // 继续走步骤 2~4 执行全局安装
                    } else {
                        // 已是最新或无法获取远程版本
                        const label = latest ? `${installed}（已是最新版）` : `${installed}（无法获取远程版本）`;
                        console.log(`检测到已安装 zentao-cli ${label}`);
                        let action: 'skip' | 'upgrade' | 'exit' = 'skip';
                        if (interactive) {
                            const a = await ask(rl, '已安装，请选择: 1) 跳过安装 2) 覆盖升级 3) 退出 [1] ');
                            if (a === '2') action = 'upgrade';
                            else if (a === '3') action = 'exit';
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
                    }
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
                rl.close();
            }
        });
}

/** 安装后的「登录 + 技能安装」流程 */
async function runPostInstallFlow(rl: Interface, interactive: boolean): Promise<void> {
    // 非交互模式（curl|sh 管道）：跳过需要 TTY 输入的 login/add-skill
    if (!interactive) {
        console.log('\n安装完成。请在终端中运行以下命令完成配置:');
        console.log('  zentao login       # 登录禅道服务');
        console.log('  zentao add-skill   # 安装 AI Agent 技能\n');
        return;
    }

    // 步骤 5：登录（已有配置时询问是否重新配置，login 会回显已有字段）
    const existing = getCurrentProfile();
    let doLogin: boolean;
    if (existing) {
        console.log(`\n当前已登录: ${existing.account}@${existing.server}`);
        doLogin = await confirm(rl, '是否重新配置登录信息？', false);
    } else {
        doLogin = await confirm(rl, '\n是否立即登录禅道服务？', true);
    }
    if (doLogin) {
        const status = runZentaoSubcommand(['login']);
        if (status !== 0) {
            console.error('登录失败，请稍后使用 `zentao login` 重试。');
            process.exit(1);
        }
    }

    // 步骤 6：技能安装
    let doSkill = true;
    if (interactive) {
        doSkill = await confirm(rl, '\n是否安装 zentao CLI 技能到 AI Agent？', true);
    }
    if (doSkill) {
        const status = runZentaoSubcommand(['add-skill']);
        if (status !== 0) {
            console.error('技能安装失败，请稍后使用 `zentao add-skill` 重试。');
            process.exit(1);
        }
    }

    // 步骤 7：总结
    console.log('\n\x1b[32m✓ 配置完成！\x1b[0m\n');
    console.log('快速上手:');
    console.log('  zentao                  # 查看可用命令');
    console.log('  zentao login            # 重新登录或切换账号');
    console.log('  zentao product          # 查看禅道产品');
    console.log('  zentao help             # 查看帮助');
    console.log('');
}
