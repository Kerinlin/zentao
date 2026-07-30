import { describe, test, expect } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { MCP_TOOL_NAMES } from '../src/mcp/register.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('MCP server (stdio e2e smoke)', () => {
    test(
        'listTools returns exactly the curated MCP tools',
        async () => {
            const transport = new StdioClientTransport({
                command: 'bun',
                args: ['run', join(repoRoot, 'src/index.ts'), 'mcp'],
                cwd: repoRoot,
            });

            const client = new Client({ name: 'zentao-cli-e2e', version: '0.0.0' });
            try {
                await client.connect(transport);
                const { tools } = await client.listTools();

                expect(tools.length).toBe(MCP_TOOL_NAMES.length);
                const names = new Set(tools.map(t => t.name));
                for (const name of MCP_TOOL_NAMES) {
                    expect(names.has(name)).toBe(true);
                }

                // Old full-module surface must be gone
                expect(names.has('zentao_bug')).toBe(false);
                expect(names.has('zentao_task')).toBe(false);
                expect(names.has('zentao_profile')).toBe(false);
                expect(names.has('zentao_switch_profile')).toBe(false);
                expect(names.has('list_products')).toBe(true);
                expect(names.has('list_projects')).toBe(true);
                expect(names.has('list_builds')).toBe(true);
                expect(names.has('list_users')).toBe(true);

                for (const t of tools) {
                    expect(t.inputSchema).toBeDefined();
                    expect(t.inputSchema?.type).toBe('object');
                }

                const listBugs = tools.find(t => t.name === 'list_bugs');
                expect(listBugs?.annotations?.readOnlyHint).toBe(true);

                const deleteBug = tools.find(t => t.name === 'delete_bug');
                expect(deleteBug?.annotations?.destructiveHint).toBe(true);

                const createBug = tools.find(t => t.name === 'create_bug');
                expect(createBug?.annotations?.readOnlyHint).toBe(false);
            } finally {
                await client.close();
            }
        },
        { timeout: 20_000 },
    );
});
