import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const api = await import(pathToFileURL(join(root, 'dist/index.js')).href);
assert.equal(typeof api.ZentaoClient, 'function');
assert.equal(typeof api.request, 'function');
assert.equal(api.VERSION, packageJson.version);
assert.match(api.BUILD, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

const client = new api.ZentaoClient('https://zentao.example.com/api.php/v2');
assert.equal(client.baseUrl, 'https://zentao.example.com/api.php/v2');

const browserApi = await import(pathToFileURL(join(root, 'dist/browser.js')).href);
assert.equal(typeof browserApi.ZentaoClient, 'function');
assert.equal(browserApi.VERSION, api.VERSION);
assert.equal(browserApi.BUILD, api.BUILD);

console.log(`Node ${process.version} package smoke test passed.`);
