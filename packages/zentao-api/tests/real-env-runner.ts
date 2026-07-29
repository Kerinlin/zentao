import { createRealEnvTestRun } from './real-env-support';

const run = createRealEnvTestRun(Bun.argv[0]);
const subprocess = Bun.spawnSync({
  cmd: run.cmd,
  env: run.env,
  stdin: 'inherit',
  stdout: 'inherit',
  stderr: 'inherit',
});

process.exit(subprocess.exitCode);
