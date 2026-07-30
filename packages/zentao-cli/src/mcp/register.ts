import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthProvider } from './server.js';
import { registerBugTools } from './tools/bugs.js';
import { registerUserTools } from './tools/user.js';
import { registerWorkspaceTools } from './tools/workspace.js';
import { registerUploadTools } from './tools/upload.js';
import { registerCatalogTools } from './tools/catalog.js';

/** Fixed MCP tool set (Bug-centric curated tools). Full-module auto-registration removed. */
export const MCP_TOOL_NAMES = [
    'list_bugs',
    'get_bug',
    'create_bug',
    'update_bug',
    'delete_bug',
    'resolve_bug',
    'close_bug',
    'activate_bug',
    'get_current_user',
    'list_profiles',
    'switch_user',
    'list_workspaces',
    'create_workspace',
    'switch_workspace',
    'upload_image',
    'list_products',
    'list_projects',
    'list_builds',
    'list_users',
] as const;

export function registerMcpTools(server: McpServer, auth: AuthProvider): void {
    registerBugTools(server, auth);
    registerUserTools(server, auth);
    registerWorkspaceTools(server, auth);
    registerUploadTools(server, auth);
    registerCatalogTools(server, auth);
}
