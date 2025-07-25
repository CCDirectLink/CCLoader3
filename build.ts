import * as esbuild from 'esbuild';
import copyStaticFiles from 'esbuild-copy-static-files';
import path from 'path';
import * as fs from 'fs';

const isWatch = process.argv[2] === 'watch';

function donePlugin(outfile: string): esbuild.Plugin {
  return {
    name: 'done plugin',
    setup(build) {
      build.onEnd(async (res) => {
        let code = res.outputFiles![0]?.text;
        if (!code) return; // when compile errors

        await fs.promises.writeFile(outfile, code);

        const bytes = code.length;
        const kb = bytes / 1024;
        console.log(outfile, `${kb.toFixed(1)}kb`);
      });
    },
  };
}

const commonOptions = {
  format: 'esm',
  platform: 'node',
  target: 'es2018',

  write: false,
  bundle: true,
  minify: false,
  sourcemap: 'inline',
} as const;

function core(): esbuild.BuildOptions {
  const outfile = path.join('./dist', `core.js`);

  return {
    entryPoints: ['packages/core/src/main.ts'],

    ...commonOptions,

    plugins: [donePlugin(outfile)],
  };
}

function runtime(): esbuild.BuildOptions {
  const outfile = path.join('./dist', 'runtime', 'main.js');

  return {
    entryPoints: ['packages/runtime/src/_main.ts'],

    ...commonOptions,

    plugins: [
      copyStaticFiles({
        src: `./packages/runtime/ccmod.json`,
        dest: `./dist/runtime/ccmod.json`,
      }),
      copyStaticFiles({
        src: `./packages/runtime/media`,
        dest: `./dist/runtime/media`,
      }),
      copyStaticFiles({
        src: `./packages/runtime/assets`,
        dest: `./dist/runtime/assets`,
      }),
      donePlugin(outfile),
    ],
  };
}

function ccmodServiceWorker(): esbuild.BuildOptions {
  const outfile = path.join('./', 'dist-ccmod-service-worker.js');
  return {
    entryPoints: ['packages/core/src/service-worker.ts'],

    ...commonOptions,

    plugins: [donePlugin(outfile)],
  };
}

const modules: Array<() => esbuild.BuildOptions> = [core, runtime, ccmodServiceWorker];

async function run(): Promise<void> {
  fs.promises.mkdir('./dist', { recursive: true });

  if (isWatch) {
    console.clear();
    await Promise.all(
      modules.map(async (module) => {
        const ctx = await esbuild.context(module());
        await ctx.watch();
      }),
    );
  } else {
    await Promise.all(
      modules.map(async (module) => {
        await esbuild.build(module());
      }),
    );
    // eslint-disable-next-line no-process-exit
    process.exit(); // because esbuild keeps the process alive for some reason
  }
}
run();
