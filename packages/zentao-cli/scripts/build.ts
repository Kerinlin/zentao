import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import pkg from '../package.json';
import { buildCompileOptions, parseBuildArgs } from './build-options';

const buildArgs = parseBuildArgs(process.argv.slice(2));
const buildTime = Date.now().toString();

const commonOptions = {
    entrypoints: ['src/index.ts'],
    sourcemap: buildArgs.sourcemap,
    bytecode: buildArgs.bytecode,
    minify: buildArgs.minify,
    define: {
        BUILD_TIME: buildTime,
        BUILD_VERSION: JSON.stringify(pkg.version),
    },
};

if (buildArgs.compile) {
    const compileOptions = buildCompileOptions({
        packageName: pkg.name,
        outdir: buildArgs.outdir,
        outfile: buildArgs.outfile,
        targets: buildArgs.targets,
    });

    for (const option of compileOptions) {
        mkdirSync(dirname(option.outfile), { recursive: true });

        const result = await Bun.build({
            ...commonOptions,
            compile: {
                target: option.bunTarget,
                outfile: option.outfile,
            },
        });

        if (!result.success) {
            console.error(`Build failed: ${option.id}`);
            for (const log of result.logs) {
                console.error(log);
            }
            process.exit(1);
        }

        console.log(`Build succeeded: ${option.outfile}`);
    }
} else {
    const result = await Bun.build({
        ...commonOptions,
        outdir: 'dist',
        target: 'node',
        format: 'esm',
    });

    if (!result.success) {
        console.error('Build failed:');
        for (const log of result.logs) {
            console.error(log);
        }
        process.exit(1);
    }

    chmodSync('bin/zentao.js', 0o755);
    console.log('Build succeeded: dist/index.js');
}
