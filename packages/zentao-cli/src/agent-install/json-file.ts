import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Strip JS-style comments and trailing commas from JSONC text */
export function stripJsonComments(text: string): string {
    let result = '';
    let i = 0;
    let inString = false;

    while (i < text.length) {
        if (inString) {
            if (text[i] === '\\') {
                result += text[i] + (text[i + 1] ?? '');
                i += 2;
                continue;
            }
            if (text[i] === '"') inString = false;
            result += text[i++];
            continue;
        }
        if (text[i] === '"') {
            inString = true;
            result += text[i++];
            continue;
        }
        if (text[i] === '/' && text[i + 1] === '/') {
            while (i < text.length && text[i] !== '\n') i++;
            continue;
        }
        if (text[i] === '/' && text[i + 1] === '*') {
            i += 2;
            while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
            i += 2;
            continue;
        }
        result += text[i++];
    }
    return result.replace(/,(\s*[}\]])/g, '$1');
}

export function readJsonFile(filePath: string, jsonc = false): Record<string, unknown> {
    if (!existsSync(filePath)) return {};
    let content = readFileSync(filePath, 'utf-8').trim();
    if (!content) return {};
    if (jsonc) content = stripJsonComments(content);
    try {
        return JSON.parse(content);
    } catch {
        if (!jsonc) return readJsonFile(filePath, true);
        throw new Error(`无法解析配置文件: ${filePath}`);
    }
}

export function deepSet(obj: Record<string, unknown>, keyPath: string[], value: unknown): void {
    let current = obj;
    for (let i = 0; i < keyPath.length - 1; i++) {
        const key = keyPath[i];
        if (!current[key] || typeof current[key] !== 'object' || Array.isArray(current[key])) {
            current[key] = {};
        }
        current = current[key] as Record<string, unknown>;
    }
    current[keyPath[keyPath.length - 1]] = value;
}

export function writeJsonFile(filePath: string, data: Record<string, unknown>): void {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

/** Remove keys from a nested object path; returns removed key names. */
export function deepDeleteKeys(
    obj: Record<string, unknown>,
    parentPath: string[],
    keys: readonly string[],
): string[] {
    let current: unknown = obj;
    for (const segment of parentPath) {
        if (!current || typeof current !== 'object' || Array.isArray(current)) return [];
        current = (current as Record<string, unknown>)[segment];
    }
    if (!current || typeof current !== 'object' || Array.isArray(current)) return [];

    const container = current as Record<string, unknown>;
    const removed: string[] = [];
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(container, key)) {
            delete container[key];
            removed.push(key);
        }
    }
    return removed;
}
