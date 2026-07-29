import { createInterface, type Interface } from "node:readline";

/** 交互式登录收集到的原始输入（密码与 Token 二选一由长度启发式区分） */
export interface PromptResult {
    url: string;
    account: string;
    password: string;
    token: string;
}

/** 已有配置的默认值，用于回显 */
export interface PromptDefaults {
    url?: string;
    account?: string;
}

function ask(rl: Interface, question: string): Promise<string> {
    return new Promise((resolve) => {
        rl.question(question, (answer) => resolve(answer));
    });
}

/**
 * 在 TTY 上询问 URL、账号与密码/Token。
 * 若第三项长度为 40，则按禅道 Token 常见长度视为 Token，否则视为密码。
 * 传入 defaults 时将已有配置回显为默认值，用户直接回车即可保留。
 */
export async function promptLogin(defaults?: PromptDefaults): Promise<PromptResult> {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    try {
        const urlHint = defaults?.url ? ` (${defaults.url})` : '';
        const urlInput = await ask(rl, `禅道服务地址 (URL)${urlHint}: `);
        const url = (urlInput.trim() || defaults?.url || '').replace(/\/+$/, '');
        if (!url) throw new Error('URL is required');

        const accountHint = defaults?.account ? ` (${defaults.account})` : '';
        const accountInput = await ask(rl, `用户名 (Account)${accountHint}: `);
        const account = accountInput.trim() || defaults?.account || '';
        if (!account) throw new Error('Account is required');

        const password = await ask(rl, '密码(Password) 或 Token : ');
        if (!password) throw new Error('Password or Token is required');

        try {
            new URL(url);
        } catch {
            throw new Error(`Invalid URL: ${url}`);
        }

        const isToken = password.length === 40;
        return {
            url,
            account,
            password: isToken ? '' : password,
            token: isToken ? password : '',
        };
    } finally {
        rl.close();
    }
}
