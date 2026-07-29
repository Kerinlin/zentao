#!/usr/bin/env bun
/**
 * 一键发版脚本。
 *
 * 前提：代码改动已经 commit（工作区干净）。
 * 流程：交互收集变更 → 生成 changeset → version → build 验证 → publish → push tag。
 *
 * 用法：bun run release
 */
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const root = process.cwd();

function sh(cmd: string): string {
    return execSync(cmd, { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
}
function run(cmd: string): void {
    execSync(cmd, { cwd: root, stdio: 'inherit' });
}
function readPkg(dir: string): { name: string; version: string } {
    return JSON.parse(fs.readFileSync(path.join(root, dir, 'package.json'), 'utf8'));
}

const rl = readline.createInterface({ input, output });
const ask = (p: string) => rl.question(p).then(a => a.trim());

async function pick(prompt: string, options: string[]): Promise<number> {
    console.log('\n' + prompt);
    options.forEach((o, i) => console.log(`  ${i + 1}) ${o}`));
    while (true) {
        const ans = await ask(`输入序号 (1-${options.length}): `);
        const n = parseInt(ans, 10);
        if (!Number.isNaN(n) && n >= 1 && n <= options.length) return n - 1;
        console.log('  无效，重输');
    }
}

async function confirm(prompt: string, def = false): Promise<boolean> {
    const ans = await ask(`${prompt} (${def ? 'Y/n' : 'y/N'}): `);
    if (!ans) return def;
    return /^[yY]/.test(ans);
}

async function main() {
    console.log('🚀 zentao monorepo 一键发版\n');

    // 1. 预检查：工作区干净
    const status = sh('git status --porcelain');
    if (status) {
        console.log('❌ 工作区有未提交改动，请先 commit：');
        console.log(status);
        process.exit(1);
    }

    // 2. 预检查：npm 登录
    try {
        const who = sh('npm whoami');
        console.log(`✅ npm 已登录：${who}`);
    } catch {
        console.log('❌ 未登录 npm，请先执行 npm login');
        process.exit(1);
    }

    const api = readPkg('packages/zentao-api');
    const cli = readPkg('packages/zentao-cli');
    console.log('\n当前版本：');
    console.log(`  @kerin/zentao-api  ${api.version}`);
    console.log(`  @kerin/zentao-cli  ${cli.version}`);

    // 3. 选择要发布的包
    const which = await pick('本次发布哪些包？', [
        '@kerin/zentao-api',
        '@kerin/zentao-cli',
        '两个都发',
    ]);
    let relApi = which === 0 || which === 2;
    let relCli = which === 1 || which === 2;

    // 4. api 联动 cli：cli 的 dist 会 bundle api，改 api 必须重发 cli
    if (relApi && !relCli) {
        console.log('\n⚠️  cli 的 dist 会 bundle api。改 api 后 cli 用户拿不到新代码，除非重发 cli。');
        if (await confirm('同时发布 cli？', true)) relCli = true;
    }

    const LEVELS = ['patch', 'minor', 'major'];
    const entries: { name: string; level: string; summary: string }[] = [];

    if (relApi) {
        const li = await pick('@kerin/zentao-api 版本类型？', LEVELS);
        const summary = await ask('变更说明（一句话）：');
        entries.push({ name: '@kerin/zentao-api', level: LEVELS[li], summary });
    }
    if (relCli) {
        const li = await pick('@kerin/zentao-cli 版本类型？', LEVELS);
        const summary = await ask('变更说明（一句话）：');
        entries.push({ name: '@kerin/zentao-cli', level: LEVELS[li], summary });
    }

    // 5. 生成 changeset 并提交
    const fm = entries.map(e => `"${e.name}": ${e.level}`).join('\n');
    const body = entries.map(e => `- ${e.summary}`).join('\n');
    const csFile = path.join(root, '.changeset', `release-${Date.now()}.md`);
    fs.writeFileSync(csFile, `---\n${fm}\n---\n\n${body}\n`);
    console.log('\n📝 生成 changeset');

    run('git add .');
    run('git commit -q -m "+ add changeset for release"');
    console.log('✅ changeset 已 commit');

    // 6. version：更新版本号 + CHANGELOG
    console.log('\n🔧 changeset version ...');
    run('bunx changeset version');

    // 7. build 验证（确保 bundle 没问题）
    console.log('\n🔧 build 验证 ...');
    run('bun run build');

    const newApi = readPkg('packages/zentao-api');
    const newCli = readPkg('packages/zentao-cli');
    console.log('\n版本变化：');
    if (relApi) console.log(`  @kerin/zentao-api  ${api.version} → ${newApi.version}`);
    if (relCli) console.log(`  @kerin/zentao-cli  ${cli.version} → ${newCli.version}`);

    // 8. 确认
    if (!(await confirm('\n确认发布到 npm？', false))) {
        console.log('已取消。回滚执行：git reset --hard HEAD~1');
        rl.close();
        process.exit(0);
    }

    // 9. 提交版本变更
    run('git add .');
    const tags: string[] = [];
    if (relApi) tags.push(`api@${newApi.version}`);
    if (relCli) tags.push(`cli@${newCli.version}`);
    run(`git commit -q -m "+ release ${tags.join(' ')}"`);

    // 10. 发布（各包 prepublishOnly 会自动 build）
    console.log('\n📦 publishing ...');
    run('bunx changeset publish');

    // 11. 推送 commit + tag
    console.log('\n🔧 git push --follow-tags ...');
    run('git push --follow-tags');

    console.log('\n✅ 发布完成');
    rl.close();
}

main().catch((e: Error) => {
    console.error('\n❌ 发版中断：', e.message);
    console.error('检查 git status / git log，手动处理未完成的步骤。');
    console.error('若 version 已跑但未 publish：git reset --hard HEAD~1 回滚。');
    process.exit(1);
});
