import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type PackageJson = {
  version?: unknown;
};

type BuildInfo = {
  build: string;
  version: string;
};

function replaceRequired(input: string, pattern: RegExp, replacement: string, label: string): string {
  const output = input.replace(pattern, replacement);

  if (output === input) {
    throw new Error(`Failed to inject ${label} into dist/version.js.`);
  }

  return output;
}

async function readBuildInfo(): Promise<BuildInfo> {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as PackageJson;

  if (typeof packageJson.version !== 'string' || packageJson.version.length === 0) {
    throw new Error('package.json must define a non-empty version.');
  }

  return {
    build: new Date().toISOString(),
    version: packageJson.version,
  };
}

async function injectNodeBuildInfo(buildInfo: BuildInfo): Promise<void> {
  const path = join('dist', 'version.js');
  let code = await readFile(path, 'utf8');

  code = replaceRequired(
    code,
    /const fallbackBuild = ['"]development['"];/,
    `const fallbackBuild = ${JSON.stringify(buildInfo.build)};`,
    'BUILD',
  );
  code = replaceRequired(
    code,
    /const fallbackVersion = ['"]0\.0\.0-dev['"];/,
    `const fallbackVersion = ${JSON.stringify(buildInfo.version)};`,
    'VERSION',
  );

  await writeFile(path, code);
}

const buildInfo = await readBuildInfo();

await injectNodeBuildInfo(buildInfo);

const result = await Bun.build({
  entrypoints: ['src/browser-global.ts'],
  outdir: 'dist/browser',
  target: 'browser',
  format: 'iife',
  globalName: 'ZentaoAPI',
  minify: true,
  define: {
    __ZENTAO_API_BUILD__: JSON.stringify(buildInfo.build),
    __ZENTAO_API_VERSION__: JSON.stringify(buildInfo.version),
  },
} as any);

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

await rename(join('dist/browser', 'browser-global.js'), join('dist/browser', 'zentao-api.global.js'));
