import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';

describe('browser bundle', () => {
  test('exposes window.ZentaoAPI with build info and rejects insecure requests in browser runtime', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'zentao-api-browser-'));
    const injectedVersion = '1.2.3-test';
    const injectedBuild = '2026-05-10T01:02:03.000Z';
    const storage = new Map<string, string>();
    let receivedToken: string | undefined;

    try {
      const result = await Bun.build({
        entrypoints: ['src/browser-global.ts'],
        outdir: dir,
        target: 'browser',
        format: 'iife',
        globalName: 'ZentaoAPI',
        define: {
          __ZENTAO_API_BUILD__: JSON.stringify(injectedBuild),
          __ZENTAO_API_VERSION__: JSON.stringify(injectedVersion),
        },
      } as any);

      expect(result.success).toBe(true);

      const code = readFileSync(join(dir, 'browser-global.js'), 'utf8');
      const context = vm.createContext({
        window: {},
        self: {},
        console,
        setTimeout,
        clearTimeout,
        URL,
        URLSearchParams,
        AbortController,
        Headers,
        Response,
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => storage.set(key, value),
          removeItem: (key: string) => storage.delete(key),
          clear: () => storage.clear(),
          key: (index: number) => Array.from(storage.keys())[index] ?? null,
          get length() {
            return storage.size;
          },
        },
        fetch: (_url: string, init?: RequestInit) => {
          const headers = new Headers(init?.headers);
          receivedToken = headers.get('Token') ?? undefined;
          return Promise.resolve(Response.json({ status: 'success' }));
        },
      });

      vm.runInContext(code, context);

      const api = (context as any).ZentaoAPI ?? (context as any).window.ZentaoAPI;
      expect((context as any).window.ZentaoAPI.VERSION).toBe(injectedVersion);
      expect((context as any).window.ZentaoAPI.BUILD).toBe(injectedBuild);
      expect(api.VERSION).toBe(injectedVersion);
      expect(api.BUILD).toBe(injectedBuild);
      expect(api.ZentaoClient).toBeFunction();
      const client = new api.ZentaoClient('https://zentao.example.com');

      await expect(client.request('/products', { insecure: true })).rejects.toThrow('insecure');

      await api.addProfile({
        server: 'https://zentao.example.com/',
        account: 'admin',
        token: 'browser-token',
      });
      expect(storage.get(api.ZENTAO_PROFILES_STORAGE_KEY)).toContain('admin@https://zentao.example.com');
      await expect(api.getProfile()).resolves.toEqual(expect.objectContaining({
        key: 'admin@https://zentao.example.com',
        token: 'browser-token',
      }));

      const profileClient = await api.ZentaoClient.fromProfile();
      await profileClient.get('/products');
      expect(receivedToken).toBe('browser-token');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
