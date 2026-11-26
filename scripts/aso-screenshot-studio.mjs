import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Screenshot Studio (MIT) https://github.com/Hyunsang-coder/auto-image
const revision = 'ab706f3949fe2fad15e861661d14eecdc6369151';
const cache = fileURLToPath(new URL('../data/screenshot-studio', import.meta.url));
const checkout = join(cache, revision);

function run(command, args, options) {
  return new Promise((done, fail) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.on('error', fail);
    child.on('close', (code, signal) => {
      if (code === 0) done();
      else fail(new Error(`${command} 执行失败（${signal || code}）`));
    });
  });
}

async function setup() {
  if (!existsSync(checkout)) {
    await mkdir(cache, { recursive: true });
    const staging = await mkdtemp(join(cache, 'install-'));
    try {
      const options = { cwd: staging };
      await run('git', ['init', '--quiet'], options);
      await run('git', ['fetch', '--quiet', '--depth=1', 'https://github.com/Hyunsang-coder/auto-image.git', revision], options);
      await run('git', ['checkout', '--quiet', '--detach', 'FETCH_HEAD'], options);
      // Rendering uses Chromium, so the optional Node canvas build is unnecessary.
      await run('npm', ['ci', '--include=dev', '--ignore-scripts'], options);
      try {
        await rename(staging, checkout);
      } catch (error) {
        if (!['EEXIST', 'ENOTEMPTY'].includes(error.code) || !existsSync(checkout)) throw error;
      }
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  }
  await run(process.execPath, ['node_modules/@playwright/test/cli.js', 'install', 'chromium', '--only-shell'], { cwd: checkout });
  console.log(`Screenshot Studio 已就绪，导入规格位于 ${join(checkout, 'docs/project-import.md')}`);
}

const [command, input, output, ...flags] = process.argv.slice(2);
const modes = { validate: ['--validate'], render: ['--report'], bundle: ['--bundle'] };
try {
  if (command === 'setup' && !input) {
    await setup();
  } else if (Object.hasOwn(modes, command) && input && output) {
    if (!existsSync(checkout)) throw new Error('请先运行 npm run aso:studio -- setup');
    const paths = [resolve(input), resolve(output)];
    process.chdir(checkout);
    const upstreamRequire = createRequire(join(checkout, 'package.json'));
    const { createServer } = await import(pathToFileURL(upstreamRequire.resolve('vite')).href);
    // Use our own loopback port because Growmory may already occupy 5173.
    const server = await createServer({
      server: { host: '127.0.0.1', port: 5180, watch: null, hmr: false },
      plugins: [{
        name: 'growmory-local-screenshot-studio',
        transformIndexHtml: html => html.replace(/<script\b[^>]*static\.cloudflareinsights\.com\/beacon\.min\.js[^>]*><\/script>/g, ''),
      }],
    });
    try {
      await server.listen();
      const baseUrl = `http://127.0.0.1:${server.httpServer.address().port}/app/`;
      await run(process.execPath, ['scripts/headless-export.mjs', ...paths, ...modes[command], ...flags], {
        cwd: checkout,
        env: { ...process.env, BASE_URL: baseUrl },
      });
    } finally {
      await server.close();
    }
  } else {
    throw new Error('用法：npm run aso:studio -- setup 或 npm run aso:studio -- <validate|render|bundle> <输入路径> <输出目录>');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
