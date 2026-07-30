import { homedir } from 'node:os';
import { join } from 'node:path';

const home = homedir();

/** Skill package directories installed by `add-skill`. */
export const SKILL_NAMES = ['zentao-cli', 'zentao-tour'] as const;

/** MCP server keys written by `add-mcp` (plus common alias). */
export const MCP_SERVER_KEYS = ['zentao-cli', 'zentao'] as const;

/** Canonical MCP server name used when installing. */
export const MCP_PRIMARY_NAME = 'zentao-cli';

export type McpConfigFormat = 'mcpServers' | 'vscode' | 'opencode' | 'codex' | 'cherry-studio';

export interface SkillAgentTarget {
    label: string;
    dir: string;
}

export interface McpAgentTarget {
    label: string;
    configPath: string;
    format: McpConfigFormat;
}

export function platformAppData(...segments: string[]): string {
    switch (process.platform) {
        case 'darwin':
            return join(home, 'Library', 'Application Support', ...segments);
        case 'win32':
            return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), ...segments);
        default:
            return join(home, '.config', ...segments);
    }
}

export function tildeDisplay(absPath: string): string {
    return absPath.startsWith(home) ? absPath.replace(home, '~') : absPath;
}

/** Default config directory used by store + autocomplete scripts. */
export function defaultZentaoConfigDir(): string {
    return join(home, '.config', 'zentao');
}

/** Shell completion scripts written by `zentao autocomplete`. */
export function getCompletionScriptPaths(): string[] {
    const dir = defaultZentaoConfigDir();
    return ['bash', 'zsh', 'fish'].map((shell) => join(dir, `.zentao-completion.${shell}`));
}

export const SKILL_AGENT_TARGETS: Record<string, SkillAgentTarget> = {
    'claude-code': { label: 'Claude Code', dir: join(home, '.claude', 'skills') },
    'cursor': { label: 'Cursor', dir: join(home, '.cursor', 'skills') },
    'cherry-studio': { label: 'Cherry Studio', dir: join(home, '.cherrystudio', 'skills') },
    'codex': { label: 'Codex', dir: join(home, '.agents', 'skills') },
    'opencode': { label: 'OpenCode', dir: join(home, '.config', 'opencode', 'skills') },
    'vscode': { label: 'VS Code', dir: join(home, '.copilot', 'skills') },
    'antigravity': { label: 'Antigravity', dir: join(home, '.gemini', 'antigravity', 'skills') },
    'gemini': { label: 'Gemini', dir: join(home, '.gemini', 'skills') },
    'workbuddy': { label: 'WorkBuddy', dir: join(home, '.workbuddy', 'skills') },
};

export const MCP_AGENT_TARGETS: Record<string, McpAgentTarget> = {
    'cursor': { label: 'Cursor', configPath: join(home, '.cursor', 'mcp.json'), format: 'mcpServers' },
    'claude-desktop': {
        label: 'Claude Desktop',
        configPath: platformAppData('Claude', 'claude_desktop_config.json'),
        format: 'mcpServers',
    },
    // Claude Code user-scope MCP lives in ~/.claude.json (not ~/.claude/settings.json)
    'claude-code': { label: 'Claude Code', configPath: join(home, '.claude.json'), format: 'mcpServers' },
    'windsurf': {
        label: 'Windsurf',
        configPath: join(home, '.codeium', 'windsurf', 'mcp_config.json'),
        format: 'mcpServers',
    },
    'cline': {
        label: 'Cline',
        configPath: join(home, '.cline', 'data', 'settings', 'cline_mcp_settings.json'),
        format: 'mcpServers',
    },
    'trae': { label: 'Trae', configPath: join(home, '.trae', 'mcp.json'), format: 'mcpServers' },
    'vscode': { label: 'VS Code', configPath: platformAppData('Code', 'User', 'mcp.json'), format: 'vscode' },
    'cherry-studio': { label: 'Cherry Studio', configPath: '', format: 'cherry-studio' },
    'opencode': {
        label: 'OpenCode',
        configPath: join(home, '.config', 'opencode', 'opencode.json'),
        format: 'opencode',
    },
    'codex': { label: 'Codex', configPath: join(home, '.codex', 'config.toml'), format: 'codex' },
    'antigravity': {
        label: 'Antigravity',
        configPath: join(home, '.gemini', 'antigravity', 'mcp_config.json'),
        format: 'mcpServers',
    },
    'gemini': { label: 'Gemini', configPath: join(home, '.gemini', 'mcp_config.json'), format: 'mcpServers' },
};

export const SKILL_AGENT_NAMES = Object.keys(SKILL_AGENT_TARGETS);
export const MCP_AGENT_NAMES = Object.keys(MCP_AGENT_TARGETS);
