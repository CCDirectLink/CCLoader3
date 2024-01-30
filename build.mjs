import * as esbuild from 'esbuild';
import copyStaticFiles from 'esbuild-copy-static-files'
import path from 'path';

const config = {
    core: 'packages/core/src/main.ts',
    runtime: 'packages/runtime/src/_main.ts'
};

async function build(name, entry) {
    let outfile = path.join('./dist', `${name}.js`);
    if (name === "runtime") outfile = path.join('./dist', 'runtime', 'main.js');

    /** @type {import("esbuild").BuildOptions} */
    const esbuildConfig = {
        entryPoints: [entry],
        outfile,

        format: 'esm',
        platform: 'node',

        treeShaking: true,
        bundle: true,
        minify: true,
        sourcemap: 'inline',

        plugins: [
            copyStaticFiles({
                src: `./packages/runtime/ccmod.json`,
                dest: `./dist/runtime/ccmod.json`
            }),
            copyStaticFiles({
                src: `./packages/runtime/media`,
                dest: `./dist/runtime/media`
            }),
            copyStaticFiles({
                src: `./packages/runtime/assets`,
                dest: `./dist/runtime/assets`
            })
        ]
    };

    await esbuild.build(esbuildConfig);
}

const promises = [];
for (const [name, path] of Object.entries(config)) {
    promises.push(build(name, path));
}
void Promise.all(promises);
