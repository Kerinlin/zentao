import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ZentaoClient,
  addProfile,
  deleteProfile,
  getAllProfiles,
  getProfile,
  setGlobalOptions,
  switchProfile,
} from '../src/index';

function createMockServer(handler: (req: Request) => Response | Promise<Response>) {
  return Bun.serve({
    port: 0,
    fetch: handler,
  });
}

let tempHome = '';
let previousHome: string | undefined;

beforeEach(async () => {
  tempHome = mkdtempSync(join(tmpdir(), 'zentao-api-profiles-'));
  previousHome = process.env.HOME;
  process.env.HOME = tempHome;
  setGlobalOptions({
    client: undefined,
    recPerPage: undefined,
    limit: undefined,
    timeout: undefined,
    insecure: undefined,
    persistProfiles: undefined,
  });
});

afterEach(() => {
  setGlobalOptions({
    client: undefined,
    recPerPage: undefined,
    limit: undefined,
    timeout: undefined,
    insecure: undefined,
    persistProfiles: undefined,
  });
  if (previousHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = previousHome;
  }
  rmSync(tempHome, { recursive: true, force: true });
});

describe('persistent profiles', () => {
  test('stores profiles on disk and uses account@server as profile key', async () => {
    await expect(getAllProfiles()).resolves.toEqual([]);

    const profile = await addProfile({
      server: 'https://zentao.example.com/',
      account: 'admin',
      token: 'token-1',
      user: { id: 1, realname: 'Admin' },
      config: { timeout: 5000 },
    });

    expect(profile.key).toBe('admin@https://zentao.example.com');
    await expect(getAllProfiles()).resolves.toEqual([
      expect.objectContaining({
        key: 'admin@https://zentao.example.com',
        server: 'https://zentao.example.com',
        account: 'admin',
        token: 'token-1',
        user: { id: 1, realname: 'Admin' },
      }),
    ]);
    await expect(getProfile('admin@https://zentao.example.com')).resolves.toEqual(expect.objectContaining({
      token: 'token-1',
    }));

    const stored = JSON.parse(readFileSync(join(tempHome, '.config/zentao/zentao.json'), 'utf8'));
    expect(stored.currentProfile).toBe('admin@https://zentao.example.com');
    expect(stored.profiles).toEqual([
      expect.objectContaining({
        server: 'https://zentao.example.com',
        account: 'admin',
        token: 'token-1',
      }),
    ]);
    expect(stored.profiles[0].key).toBeUndefined();
    expect(statSync(join(tempHome, '.config/zentao')).mode & 0o777).toBe(0o700);
    expect(statSync(join(tempHome, '.config/zentao/zentao.json')).mode & 0o777).toBe(0o600);
  });

  test('switches and deletes the current profile', async () => {
    await addProfile({ server: 'https://one.example.com', account: 'admin', token: 'one' });
    await addProfile({ server: 'https://two.example.com', account: 'dev', token: 'two' });

    await switchProfile('admin@https://one.example.com');

    await expect(getProfile()).resolves.toEqual(expect.objectContaining({
      key: 'admin@https://one.example.com',
      token: 'one',
    }));

    await expect(deleteProfile('admin@https://one.example.com')).resolves.toBe(true);
    await expect(getProfile()).resolves.toEqual(expect.objectContaining({
      key: 'dev@https://two.example.com',
      token: 'two',
    }));
    await expect(deleteProfile('missing@https://two.example.com')).resolves.toBe(false);
  });

  test('creates a client from the current profile', async () => {
    let receivedToken: string | null = null;
    const server = createMockServer((req) => {
      receivedToken = req.headers.get('Token');
      return Response.json({ status: 'success' });
    });

    try {
      await addProfile({
        server: server.url.toString(),
        account: 'admin',
        token: 'saved-token',
        config: { timeout: 1234, insecure: false },
      });

      const client = await ZentaoClient.fromProfile();
      await client.get('/products');

      expect(client.siteUrl).toBe(server.url.toString().replace(/\/$/, ''));
      expect(receivedToken ?? '').toBe('saved-token');
    } finally {
      server.stop();
    }
  });

  test('persists successful logins when enabled in global options', async () => {
    const server = createMockServer((req) => {
      if (new URL(req.url).pathname.endsWith('/users/login')) {
        return Response.json({
          status: 'success',
          token: 'login-token',
          user: { id: 1, account: 'admin', realname: 'Admin' },
        });
      }
      return Response.json({ status: 'success' });
    });

    try {
      setGlobalOptions({ persistProfiles: true });
      const client = new ZentaoClient({ baseUrl: server.url.toString(), timeout: 3210 });

      await client.login('admin', 'secret');

      await expect(getProfile()).resolves.toEqual(expect.objectContaining({
        key: `admin@${server.url.toString().replace(/\/$/, '')}`,
        token: 'login-token',
        user: { id: 1, account: 'admin', realname: 'Admin' },
        config: expect.objectContaining({ timeout: 3210 }),
      }));
    } finally {
      server.stop();
    }
  });
});
