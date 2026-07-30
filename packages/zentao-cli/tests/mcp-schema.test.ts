import { describe, test, expect } from 'bun:test';
import { z } from 'zod';
import { objectFromShape, normalizeObjectSchema } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js';
import { listBugsSchema, createBugSchema } from '../src/mcp/tools/bugs.js';
import { listProductsSchema, listBuildsSchema } from '../src/mcp/tools/catalog.js';

function convertShape(shape: Record<string, z.ZodTypeAny>) {
    const wrapped = objectFromShape(shape);
    const norm = normalizeObjectSchema(wrapped);
    return toJsonSchemaCompat(norm!, {
        strictUnions: true,
        pipeStrategy: 'input',
    });
}

describe('MCP tool input JSON Schema', () => {
    test('converts record with string keys (params field shape)', () => {
        const actionEnum = ['list', 'get'] as [string, ...string[]];
        const shape = {
            action: z.enum(actionEnum).describe('op'),
            params: z.record(z.string(), z.unknown()).optional().describe('params'),
        };

        const wrapped = objectFromShape(shape);
        const norm = normalizeObjectSchema(wrapped);
        expect(norm).toBeDefined();

        const json = toJsonSchemaCompat(norm!, {
            strictUnions: true,
            pipeStrategy: 'input',
        });

        expect(json.type).toBe('object');
        expect(json.properties && 'params' in json.properties).toBe(true);
    });

    test('converts simple string and number fields', () => {
        const json = convertShape({
            name: z.string().describe('name'),
            count: z.number().optional().describe('count'),
        });

        expect(json.type).toBe('object');
        expect(json.properties.name).toBeDefined();
        expect(json.properties.count).toBeDefined();
    });

    test('converts enum field', () => {
        const json = convertShape({
            status: z.enum(['active', 'closed']).describe('status'),
        });

        expect(json.properties.status).toBeDefined();
    });

    test('converts array of strings', () => {
        const json = convertShape({
            tags: z.array(z.string()).optional().describe('tags'),
        });

        expect(json.properties.tags).toBeDefined();
    });

    test('marks required vs optional fields', () => {
        const json = convertShape({
            required: z.string(),
            optional: z.string().optional(),
        });

        expect(json.required).toContain('required');
        expect(json.required ?? []).not.toContain('optional');
    });

    test('list_bugs schema has scope + paging + filter, no action bag', () => {
        const json = convertShape(listBugsSchema);
        expect(json.properties.projectId).toBeDefined();
        expect(json.properties.productId).toBeDefined();
        expect(json.properties.page).toBeDefined();
        expect(json.properties.browseType).toBeDefined();
        expect(json.properties.filter).toBeDefined();
        expect(json.properties.orderBy).toBeDefined();
        expect(json.properties.recPerPage).toBeDefined();
        // filter is string[] for AI-readable multi conditions
        const filterSchema = json.properties.filter as { type?: string; items?: unknown };
        expect(filterSchema.type).toBe('array');
        expect(json.properties.action).toBeUndefined();
        expect(json.properties.params).toBeUndefined();
    });

    test('create_bug schema requires title', () => {
        const json = convertShape(createBugSchema);
        expect(json.properties.title).toBeDefined();
        expect(json.required).toContain('title');
        expect(json.properties.openedBuild).toBeDefined();
        expect(json.properties.productId).toBeDefined();
    });

    test('list_products schema has paging, no action bag', () => {
        const json = convertShape(listProductsSchema);
        expect(json.properties.page).toBeDefined();
        expect(json.properties.browseType).toBeDefined();
        expect(json.properties.action).toBeUndefined();
    });

    test('list_builds schema has project/execution scope', () => {
        const json = convertShape(listBuildsSchema);
        expect(json.properties.projectId).toBeDefined();
        expect(json.properties.executionId).toBeDefined();
    });
});
