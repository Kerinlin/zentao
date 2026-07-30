import { describe, test, expect } from 'bun:test';
import { resolveListScope, resolveBuildScope, omitStepsUnlessPicked, omitFieldsUnlessPicked } from '../src/mcp/common.js';
import { ZentaoError } from '../src/errors.js';

describe('resolveListScope', () => {
    test('single projectId', () => {
        expect(resolveListScope({ projectId: 12 })).toEqual({ project: '12' });
    });

    test('single productId', () => {
        expect(resolveListScope({ productId: 3 })).toEqual({ product: '3' });
    });

    test('empty falls back to workspace (empty opts)', () => {
        expect(resolveListScope({})).toEqual({});
    });

    test('multiple scopes throws E2009', () => {
        try {
            resolveListScope({ projectId: 1, productId: 2 });
            expect.unreachable('should throw');
        } catch (e) {
            expect(e).toBeInstanceOf(ZentaoError);
            expect((e as ZentaoError).code).toBe('2009');
        }
    });
});

describe('omitStepsUnlessPicked', () => {
    const rows = [
        { id: 1, title: 'a', steps: '<p>x</p>' },
        { id: 2, title: 'b', steps: '<p>y</p>' },
    ];

    test('strips steps when pick absent', () => {
        const out = omitStepsUnlessPicked(rows) as Array<Record<string, unknown>>;
        expect(out[0].steps).toBeUndefined();
        expect(out[0].title).toBe('a');
        expect(out[1].id).toBe(2);
    });

    test('keeps data when pick present', () => {
        const out = omitStepsUnlessPicked(rows, 'id,title,steps') as Array<Record<string, unknown>>;
        expect(out[0].steps).toBe('<p>x</p>');
    });

    test('non-array passthrough', () => {
        expect(omitStepsUnlessPicked({ id: 1, steps: 'x' })).toEqual({ id: 1, steps: 'x' });
    });
});

describe('resolveBuildScope', () => {
    test('project only', () => {
        expect(resolveBuildScope({ projectId: 5 })).toEqual({ project: '5' });
    });

    test('both throws', () => {
        try {
            resolveBuildScope({ projectId: 1, executionId: 2 });
            expect.unreachable('should throw');
        } catch (e) {
            expect(e).toBeInstanceOf(ZentaoError);
            expect((e as ZentaoError).code).toBe('2009');
        }
    });
});

describe('omitFieldsUnlessPicked', () => {
    test('strips listed fields', () => {
        const out = omitFieldsUnlessPicked(
            [{ id: 1, desc: 'x', name: 'a' }],
            undefined,
            ['desc'],
        ) as Array<Record<string, unknown>>;
        expect(out[0].desc).toBeUndefined();
        expect(out[0].name).toBe('a');
    });
});
