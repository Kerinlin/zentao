import { afterEach, describe, expect, test } from 'bun:test';
import { ZentaoClient, ZentaoError, setGlobalOptions } from '../src/index';

function createMockServer(handler: (req: Request) => Response | Promise<Response>) {
  return Bun.serve({
    port: 0,
    fetch: handler,
  });
}

afterEach(() => {
  setGlobalOptions({
    client: undefined,
    recPerPage: undefined,
    limit: undefined,
    timeout: undefined,
    insecure: undefined,
  });
});

describe('ZentaoClient.uploadImage', () => {
  test('uploads via file-ajaxUpload.json with imgFile and Token as zentaosid', async () => {
    let receivedPath = '';
    let receivedToken: string | null = null;
    let receivedZentaosid: string | null = null;
    let receivedUid: string | null = null;
    let receivedField: FormDataEntryValue | null = null;
    let receivedFileName = '';

    const server = createMockServer(async (req) => {
      const url = new URL(req.url);
      receivedPath = url.pathname;
      receivedToken = req.headers.get('Token');
      receivedZentaosid = url.searchParams.get('zentaosid');
      receivedUid = url.searchParams.get('uid');
      const form = await req.formData();
      receivedField = form.get('imgFile');
      const file = form.get('imgFile');
      if (file && typeof file === 'object' && 'name' in file) {
        receivedFileName = (file as File).name;
      }
      return Response.json({ error: 0, url: '/zentao/file-read-1001.png' });
    });

    try {
      const base = server.url.toString().replace(/\/$/, '');
      const client = new ZentaoClient({
        baseUrl: `${base}/zentao`,
        token: 'test-token-abc',
      });
      const result = await client.uploadImage({
        fileName: 'shot.png',
        data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      });

      expect(receivedPath).toBe('/zentao/file-ajaxUpload.json');
      // Closure writes are invisible to CFA; String() keeps bun expect typings happy.
      expect(String(receivedToken)).toBe('test-token-abc');
      expect(String(receivedZentaosid)).toBe('test-token-abc');
      expect(receivedUid).toBeTruthy();
      expect(receivedField).not.toBeNull();
      expect(receivedFileName).toBe('shot.png');
      expect(result.url).toBe('/zentao/file-read-1001.png');
      expect(result.fileName).toBe('shot.png');
      expect(result.absoluteUrl).toBe(`${new URL(base).origin}/zentao/file-read-1001.png`);
    } finally {
      server.stop();
    }
  });

  test('accepts result=success response shape', async () => {
    const server = createMockServer(() =>
      Response.json({ result: 'success', url: '/zentao/file-read-2.png' }),
    );

    try {
      const base = server.url.toString().replace(/\/$/, '');
      const client = new ZentaoClient({ baseUrl: base, token: 't' });
      const result = await client.uploadImage({
        fileName: 'a.jpg',
        data: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }),
      });
      expect(result.url).toBe('/zentao/file-read-2.png');
      expect(result.absoluteUrl).toContain('/zentao/file-read-2.png');
    } finally {
      server.stop();
    }
  });

  test('throws E_NO_TOKEN when token is missing', async () => {
    const client = new ZentaoClient({ baseUrl: 'https://zentao.example.com' });
    await expect(
      client.uploadImage({ fileName: 'a.png', data: new Uint8Array([1]) }),
    ).rejects.toMatchObject({ code: 'E_NO_TOKEN' } satisfies Partial<ZentaoError>);
  });

  test('throws E_UPLOAD_FAILED on business failure', async () => {
    const server = createMockServer(() =>
      Response.json({ result: 'fail', message: '文件格式不在规定范围内' }),
    );

    try {
      const client = new ZentaoClient({
        baseUrl: server.url.toString(),
        token: 't',
      });
      await expect(
        client.uploadImage({ fileName: 'a.png', data: new Uint8Array([1]) }),
      ).rejects.toMatchObject({
        code: 'E_UPLOAD_FAILED',
        message: expect.stringContaining('文件格式不在规定范围内'),
      });
    } finally {
      server.stop();
    }
  });

  test('throws E_UPLOAD_FAILED on non-JSON body', async () => {
    const server = createMockServer(() => new Response('<html>login</html>', { status: 200 }));

    try {
      const client = new ZentaoClient({
        baseUrl: server.url.toString(),
        token: 't',
      });
      await expect(
        client.uploadImage({ fileName: 'a.png', data: new Uint8Array([1]) }),
      ).rejects.toMatchObject({ code: 'E_UPLOAD_FAILED' });
    } finally {
      server.stop();
    }
  });

  test('throws E_MISSING_PARAM when fileName is empty', async () => {
    const client = new ZentaoClient({ baseUrl: 'https://zentao.example.com', token: 't' });
    await expect(
      client.uploadImage({ fileName: '  ', data: new Uint8Array([1]) }),
    ).rejects.toMatchObject({ code: 'E_MISSING_PARAM' });
  });
});
