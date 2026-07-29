/**
 * Terminal multi-select: ↑↓ move, Space toggle, a all, Enter confirm.
 * No external deps; uses stdin raw mode when available.
 */

export interface MultiSelectItem {
    value: string;
    label: string;
}

export interface MultiSelectOptions {
    title: string;
    items: MultiSelectItem[];
    /** Prompt stream (default stderr, keeps stdout clean for piping). */
    output?: NodeJS.WriteStream;
    /** Minimum required selections (default 1). */
    min?: number;
    /** Initially selected values. */
    initial?: string[];
}

const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';
const CLEAR_LINE = '\x1b[2K';

function isRawModeSupported(stdin: NodeJS.ReadStream): boolean {
    return typeof (stdin as NodeJS.ReadStream & { setRawMode?: unknown }).setRawMode === 'function'
        && Boolean(stdin.isTTY);
}

/**
 * Interactive multi-select. Resolves with selected item values.
 * Rejects on Ctrl+C or non-TTY.
 */
export async function multiSelect(options: MultiSelectOptions): Promise<string[]> {
    const { title, items } = options;
    const out = options.output ?? process.stderr;
    const min = options.min ?? 1;
    const stdin = process.stdin;

    if (!stdin.isTTY || !out.isTTY || !isRawModeSupported(stdin)) {
        throw new Error('当前终端不支持交互多选，请显式传入目标参数。');
    }
    if (items.length === 0) {
        throw new Error('无可选项。');
    }

    const selected = new Set<number>();
    if (options.initial?.length) {
        const valueIndex = new Map(items.map((item, i) => [item.value, i]));
        for (const v of options.initial) {
            const idx = valueIndex.get(v);
            if (idx !== undefined) selected.add(idx);
        }
    }

    let cursor = 0;
    let lineCount = 0;
    let firstPaint = true;

    const paint = (hint?: string): void => {
        if (!firstPaint && lineCount > 0) {
            out.write(`\x1b[${lineCount}A`);
        }
        firstPaint = false;

        const lines: string[] = [
            title,
            '',
        ];

        for (let i = 0; i < items.length; i++) {
            const mark = selected.has(i) ? 'x' : ' ';
            const pointer = i === cursor ? '❯' : ' ';
            lines.push(`${pointer} [${mark}] ${items[i].label}`);
        }

        lines.push('');
        lines.push(hint ?? '↑↓ 移动  空格 勾选  a 全选  回车 确认  Ctrl+C 取消');

        lineCount = lines.length;
        for (const line of lines) {
            out.write(`${CLEAR_LINE}${line}\n`);
        }
    };

    const cleanup = (): void => {
        out.write(SHOW_CURSOR);
        try {
            stdin.setRawMode(false);
        } catch {
            /* ignore */
        }
        stdin.pause();
        stdin.removeListener('data', onData);
    };

    let onData: (chunk: Buffer | string) => void = () => {};

    return new Promise((resolve, reject) => {
        out.write(HIDE_CURSOR);
        stdin.setRawMode(true);
        stdin.resume();
        stdin.setEncoding('utf8');

        paint();

        onData = (chunk: Buffer | string) => {
            const key = typeof chunk === 'string' ? chunk : chunk.toString('utf8');

            // Ctrl+C
            if (key === '\u0003') {
                cleanup();
                out.write('\n');
                reject(new Error('已取消。'));
                return;
            }

            // Enter
            if (key === '\r' || key === '\n') {
                if (selected.size < min) {
                    paint(`至少选择 ${min} 项（已选 ${selected.size}）`);
                    return;
                }
                cleanup();
                out.write('\n');
                const values = items
                    .map((item, i) => (selected.has(i) ? item.value : null))
                    .filter((v): v is string => v !== null);
                resolve(values);
                return;
            }

            // Space — toggle
            if (key === ' ') {
                if (selected.has(cursor)) selected.delete(cursor);
                else selected.add(cursor);
                paint();
                return;
            }

            // a / A — toggle all
            if (key === 'a' || key === 'A') {
                if (selected.size === items.length) selected.clear();
                else {
                    for (let i = 0; i < items.length; i++) selected.add(i);
                }
                paint();
                return;
            }

            // Up: ESC [ A  or  k
            if (key === '\u001b[A' || key === 'k') {
                cursor = (cursor - 1 + items.length) % items.length;
                paint();
                return;
            }

            // Down: ESC [ B  or  j
            if (key === '\u001b[B' || key === 'j') {
                cursor = (cursor + 1) % items.length;
                paint();
                return;
            }
        };

        stdin.on('data', onData);
    });
}
