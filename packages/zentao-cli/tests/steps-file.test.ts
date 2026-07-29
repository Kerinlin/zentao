import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyStepsFile, buildParams } from '../src/modules/args';
import { ZentaoError } from '../src/errors';

function writeTempMd(content: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'zentao-steps-'));
    const path = join(dir, 'steps.md');
    writeFileSync(path, content, 'utf8');
    return path;
}

describe('applyStepsFile / --steps-file', () => {
    test('no file → identity', () => {
        const input = { title: 'x', steps: 'plain' };
        expect(applyStepsFile(input)).toEqual(input);
    });

    test('reads Markdown file and sets steps HTML', () => {
        const path = writeTempMd(`## 问题描述

定位错误

![shot](/zentao/file-read-1.png)
`);
        const params = applyStepsFile({ stepsFile: path, title: 't' });
        expect(params.steps).toContain('<p><strong>问题描述</strong></p>');
        expect(params.steps).toContain('<p>定位错误</p>');
        expect(params.steps).toContain('src="/zentao/file-read-1.png"');
        expect(params.stepsFile).toBeUndefined();
        expect(params['steps-file']).toBeUndefined();
        expect(params.title).toBe('t');
    });

    test('accepts kebab-case steps-file key', () => {
        const path = writeTempMd('## A\n\nb');
        const params = applyStepsFile({ 'steps-file': path });
        expect(params.steps).toContain('<strong>A</strong>');
        expect(params['steps-file']).toBeUndefined();
    });

    test('conflicts with --steps', () => {
        const path = writeTempMd('## A\n\nb');
        expect(() => applyStepsFile({ stepsFile: path, steps: 'old' })).toThrow(ZentaoError);
        try {
            applyStepsFile({ stepsFile: path, steps: 'old' });
        } catch (e) {
            expect(e).toBeInstanceOf(ZentaoError);
            expect((e as ZentaoError).code).toBe('2009');
        }
    });

    test('missing file → E2011', () => {
        try {
            applyStepsFile({ stepsFile: join(tmpdir(), 'zentao-no-such-steps-file-xyz.md') });
            expect.unreachable();
        } catch (e) {
            expect(e).toBeInstanceOf(ZentaoError);
            expect((e as ZentaoError).code).toBe('2011');
        }
    });

    test('empty file → E2009', () => {
        const path = writeTempMd('   \n  ');
        try {
            applyStepsFile({ stepsFile: path });
            expect.unreachable();
        } catch (e) {
            expect(e).toBeInstanceOf(ZentaoError);
            expect((e as ZentaoError).code).toBe('2009');
        }
    });

    test('buildParams wires --steps-file= via unknown option regex', () => {
        const path = writeTempMd('## T\n\nbody');
        const params = buildParams({}, 'create', [`--steps-file=${path}`, '--title=hi']);
        expect(params.title).toBe('hi');
        expect(params.steps).toContain('<strong>T</strong>');
        expect(params.stepsFile).toBeUndefined();
        expect(params['steps-file']).toBeUndefined();
    });

    test('buildParams: plain --steps not converted', () => {
        const params = buildParams({}, 'create', ['--steps=## not converted', '--title=x']);
        expect(params.steps).toBe('## not converted');
    });

    test('directory path is not a file → E2011', () => {
        const dir = mkdtempSync(join(tmpdir(), 'zentao-steps-dir-'));
        mkdirSync(join(dir, 'nested'), { recursive: true });
        try {
            applyStepsFile({ stepsFile: dir });
            expect.unreachable();
        } catch (e) {
            expect(e).toBeInstanceOf(ZentaoError);
            expect((e as ZentaoError).code).toBe('2011');
        }
    });
});
