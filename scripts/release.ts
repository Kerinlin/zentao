#!/usr/bin/env bun
/**
 * 一键发版脚本。
 *
 * 前提：代码改动已经 commit（工作区干净）。
 * 流程：选包 + 版本类型 → 自动从 git log 生成 changelog → version → build 验证 → publish → push tag。
 *
 * 用法：bun run release
 */
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const root = process.cwd();

const PACKAGES = [
    { name: "@kerin/zentao-api", dir: "packages/zentao-api", short: "api" },
    { name: "@kerin/zentao-cli", dir: "packages/zentao-cli", short: "cli" },
] as const;

type Pkg = (typeof PACKAGES)[number];

function sh(cmd: string): string {
    return execSync(cmd, { cwd: root, stdio: ["pipe", "pipe", "pipe"] }).toString().trim();
}
function run(cmd: string): void {
    execSync(cmd, { cwd: root, stdio: "inherit" });
}
function readPkg(dir: string): { name: string; version: string } {
    return JSON.parse(fs.readFileSync(path.join(root, dir, "package.json"), "utf8"));
}

const rl = readline.createInterface({ input, output });
const ask = (p: string) => rl.question(p).then((a) => a.trim());

async function pick(prompt: string, options: string[]): Promise<number> {
    console.log("\n" + prompt);
    options.forEach((o, i) => console.log(`  ${i + 1}) ${o}`));
    while (true) {
        const ans = await ask(`输入序号 (1-${options.length}): `);
        const n = parseInt(ans, 10);
        if (!Number.isNaN(n) && n >= 1 && n <= options.length) return n - 1;
        console.log("  无效，重输");
    }
}

async function confirm(prompt: string, def = false): Promise<boolean> {
    const ans = await ask(`${prompt} (${def ? "Y/n" : "y/N"}): `);
    if (!ans) return def;
    return /^[yY]/.test(ans);
}

/** Last publish tag for package, e.g. @kerin/zentao-cli@1.2.0 */
function lastPackageTag(pkgName: string): string | null {
    try {
        const tags = sh(`git tag -l "${pkgName}@*" --sort=-v:refname`);
        if (!tags) return null;
        return tags.split("\n")[0] ?? null;
    } catch {
        return null;
    }
}

/** Noise commits that should not appear in user-facing changelog. */
function isNoiseCommit(subject: string): boolean {
    return (
        /^\+?\s*release\b/i.test(subject) ||
        /^\+?\s*add changeset\b/i.test(subject) ||
        /^chore:\s*(release|changeset)/i.test(subject) ||
        /^Merge\b/.test(subject)
    );
}

/**
 * Collect commit subjects that touched this package since last release tag.
 * Falls back to whole-repo recent commits if package has no tag yet.
 */
function collectChangelog(pkg: Pkg): string[] {
    const tag = lastPackageTag(pkg.name);
    const range = tag ? `${tag}..HEAD` : "HEAD";
    let log = "";
    try {
        log = sh(`git log ${range} --pretty=format:%s -- ${pkg.dir}`);
    } catch {
        log = "";
    }

    let subjects = log
        ? log.split("\n").map((s) => s.trim()).filter(Boolean)
        : [];

    // No package-scoped commits (e.g. only root/docs changed) → try monorepo commits
    // that are not pure release noise, limited to recent window.
    if (subjects.length === 0) {
        try {
            log = sh(`git log ${range} --pretty=format:%s --max-count=20`);
            subjects = log
                ? log.split("\n").map((s) => s.trim()).filter(Boolean)
                : [];
        } catch {
            subjects = [];
        }
    }

    const seen = new Set<string>();
    const unique: string[] = [];
    for (const s of subjects) {
        if (isNoiseCommit(s)) continue;
        if (seen.has(s)) continue;
        seen.add(s);
        unique.push(s);
    }
    return unique;
}

/**
 * Changesets body: one paragraph per commit → one CHANGELOG bullet each.
 * Do NOT prefix with "- "; changesets already wraps body as list items.
 */
function formatChangesetBody(commits: string[]): string {
    if (commits.length === 0) return "bug fixes and improvements";
    return commits.join("\n\n");
}

function listPendingChangesets(): string[] {
    const dir = path.join(root, ".changeset");
    if (!fs.existsSync(dir)) return [];
    return fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".md") && f !== "README.md")
        .sort();
}

async function main() {
    console.log("🚀 zentao monorepo 一键发版\n");

    // 1. 预检查：工作区干净
    const status = sh("git status --porcelain");
    if (status) {
        console.log("❌ 工作区有未提交改动，请先 commit：");
        console.log(status);
        process.exit(1);
    }

    // 2. 预检查：npm 登录
    try {
        const who = sh("npm whoami");
        console.log(`✅ npm 已登录：${who}`);
    } catch {
        console.log("❌ 未登录 npm，请先执行 npm login");
        process.exit(1);
    }

    const api = readPkg("packages/zentao-api");
    const cli = readPkg("packages/zentao-cli");
    console.log("\n当前版本：");
    console.log(`  @kerin/zentao-api  ${api.version}`);
    console.log(`  @kerin/zentao-cli  ${cli.version}`);

    const pending = listPendingChangesets();
    if (pending.length > 0) {
        console.log("\n⚠️  已有 pending changesets（version 时会一并消费）：");
        for (const f of pending) {
            const content = fs.readFileSync(path.join(root, ".changeset", f), "utf8");
            const first = content.split("\n").slice(0, 6).join("\n");
            console.log(`  - ${f}`);
            console.log(first.replace(/^/gm, "    "));
        }
    }

    // 3. 选择要发布的包
    const which = await pick("本次发布哪些包？", [
        "@kerin/zentao-api",
        "@kerin/zentao-cli",
        "两个都发",
    ]);
    let relApi = which === 0 || which === 2;
    let relCli = which === 1 || which === 2;

    // 4. api 联动 cli：cli 的 dist 会 bundle api，改 api 必须重发 cli
    if (relApi && !relCli) {
        console.log("\n⚠️  cli 的 dist 会 bundle api。改 api 后 cli 用户拿不到新代码，除非重发 cli。");
        if (await confirm("同时发布 cli？", true)) relCli = true;
    }

    const LEVELS = ["patch", "minor", "major"] as const;
    const selected = PACKAGES.filter(
        (p) => (p.short === "api" && relApi) || (p.short === "cli" && relCli),
    );

    type Entry = { pkg: Pkg; level: string; commits: string[]; body: string };
    const entries: Entry[] = [];

    for (const pkg of selected) {
        const li = await pick(`${pkg.name} 版本类型？`, [...LEVELS]);
        const commits = collectChangelog(pkg);
        const body = formatChangesetBody(commits);
        entries.push({ pkg, level: LEVELS[li], commits, body });
    }

    // 5. 展示自动生成的 changelog，用户只确认版本类型是否 OK
    console.log("\n📝 自动生成 changelog（来自上次发版 tag 之后的 git log）：");
    for (const e of entries) {
        const tag = lastPackageTag(e.pkg.name) ?? "(无历史 tag)";
        console.log(`\n  ${e.pkg.name}  [${e.level}]  since ${tag}`);
        if (e.commits.length === 0) {
            console.log("    (无匹配 commit，使用兜底文案) bug fixes and improvements");
        } else {
            for (const c of e.commits) console.log(`    - ${c}`);
        }
    }

    if (!(await confirm("\nchangelog / 版本类型 OK？继续生成 changeset", true))) {
        console.log("已取消。");
        rl.close();
        process.exit(0);
    }

    // 6. 每包独立 changeset（避免多包共享 body 导致 CHANGELOG 串包）
    console.log("\n📝 生成 changeset");
    const ts = Date.now();
    for (const e of entries) {
        const csFile = path.join(root, ".changeset", `release-${e.pkg.short}-${ts}.md`);
        const content = `---\n"${e.pkg.name}": ${e.level}\n---\n\n${e.body}\n`;
        fs.writeFileSync(csFile, content);
        console.log(`  + ${path.relative(root, csFile)}`);
    }

    run("git add .");
    run('git commit -q -m "+ add changeset for release"');
    console.log("✅ changeset 已 commit");

    // 7. version：更新版本号 + CHANGELOG
    console.log("\n🔧 changeset version ...");
    run("bunx changeset version");

    // 8. build 验证（确保 bundle 没问题）
    console.log("\n🔧 build 验证 ...");
    run("bun run build");

    const newApi = readPkg("packages/zentao-api");
    const newCli = readPkg("packages/zentao-cli");
    console.log("\n版本变化：");
    if (relApi) console.log(`  @kerin/zentao-api  ${api.version} → ${newApi.version}`);
    if (relCli) console.log(`  @kerin/zentao-cli  ${cli.version} → ${newCli.version}`);

    // 9. 确认发布
    if (!(await confirm("\n确认发布到 npm？", false))) {
        console.log("已取消。回滚执行：git reset --hard HEAD~1");
        rl.close();
        process.exit(0);
    }

    // 10. 提交版本变更
    run("git add .");
    const tags: string[] = [];
    if (relApi) tags.push(`api@${newApi.version}`);
    if (relCli) tags.push(`cli@${newCli.version}`);
    run(`git commit -q -m "+ release ${tags.join(" ")}"`);

    // 11. 发布（各包 prepublishOnly 会自动 build）
    console.log("\n📦 publishing ...");
    run("bunx changeset publish");

    // 12. 推送 commit + tag
    console.log("\n🔧 git push --follow-tags ...");
    run("git push --follow-tags");

    console.log("\n✅ 发布完成");
    rl.close();
}

main().catch((e: Error) => {
    console.error("\n❌ 发版中断：", e.message);
    console.error("检查 git status / git log，手动处理未完成的步骤。");
    console.error("若 version 已跑但未 publish：git reset --hard HEAD~1 回滚。");
    process.exit(1);
});
