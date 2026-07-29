import { describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
    assertUploadableImagePath,
    isAllowedImageExt,
    UPLOAD_IMAGE_EXTENSIONS,
} from '../src/commands/upload';
import { ZentaoError } from '../src/errors';

describe('upload helpers', () => {
    test('isAllowedImageExt accepts common image extensions', () => {
        expect(isAllowedImageExt('a.PNG')).toBe(true);
        expect(isAllowedImageExt('/tmp/x.jpeg')).toBe(true);
        expect(isAllowedImageExt('shot.webp')).toBe(true);
        expect(isAllowedImageExt('notes.md')).toBe(false);
        expect(isAllowedImageExt('noext')).toBe(false);
    });

    test('whitelist contains expected extensions', () => {
        for (const ext of ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']) {
            expect(UPLOAD_IMAGE_EXTENSIONS.has(ext)).toBe(true);
        }
    });

    test('assertUploadableImagePath accepts real image file', () => {
        const dir = join(tmpdir(), `zentao-upload-test-${Date.now()}`);
        mkdirSync(dir, { recursive: true });
        const file = join(dir, 'ok.png');
        writeFileSync(file, new Uint8Array([1, 2, 3]));
        try {
            expect(assertUploadableImagePath(file)).toBe(file);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    test('assertUploadableImagePath rejects missing file', () => {
        expect(() => assertUploadableImagePath('/tmp/zentao-no-such-file-xyz.png')).toThrow(ZentaoError);
        try {
            assertUploadableImagePath('/tmp/zentao-no-such-file-xyz.png');
        } catch (error) {
            expect(error).toBeInstanceOf(ZentaoError);
            expect((error as ZentaoError).code).toBe('2011');
        }
    });

    test('assertUploadableImagePath rejects disallowed extension', () => {
        const dir = join(tmpdir(), `zentao-upload-test-${Date.now()}`);
        mkdirSync(dir, { recursive: true });
        const file = join(dir, 'notes.txt');
        writeFileSync(file, 'hello');
        try {
            expect(() => assertUploadableImagePath(file)).toThrow(ZentaoError);
            try {
                assertUploadableImagePath(file);
            } catch (error) {
                expect((error as ZentaoError).code).toBe('2012');
            }
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
