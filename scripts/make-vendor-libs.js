#!/usr/bin/env node

// This script compiles libraries used by the modloader at runtime such that
// they can be vendored in common/vendor-libs/ and such that they can be loaded
// inside nwjs. This obviously means that the libraries in question must be
// loaded with ES imports and not require(), like the rest of the modloader,
// because this is nwjs. Hence an ES module-capable bundler (EDIT: bundling in
// and of itself is not necessary, perhaps a transpiler of CJS-to-ES might be
// up for the job, but I don't know of any such projects and I've already
// written the code and this comment, so...) is necessary, and this immediately
// disqualifies Webpack (which right now doesn't support spewing out ES
// modules, see <https://github.com/webpack/webpack/issues/2933>, but kinda
// does, see
// <https://github.com/webpack/webpack/issues/2933#issuecomment-774253975>, and
// they shipped experimental support in v5, but I couldn't get it to generate
// ES exports) and Browserify (I mean, come on, it's really old, but see
// <https://github.com/browserify/browserify/issues/1186>), and leaves us with
// Rollup and esbuild.
//
// I initially used Rollup to do the job, and the config even ended up being
// nice, but... First of all, Rollup's CJS parser can't handle circular
// dependencies, which appear in both semver and JSZip, and there are multiple
// open tickets about it: <https://github.com/rollup/plugins/issues/879>
// <https://github.com/npm/node-semver/issues/381>
// <https://github.com/rollup/plugins/issues/879#issuecomment-836612918>
// <https://github.com/npm/node-semver/issues/318>
// <https://github.com/rollup/rollup/issues/1507>
// <https://github.com/nodejs/readable-stream/issues/348>
// <https://github.com/Stuk/jszip/issues/673>. The offending behavior was
// introduced in v19 of the CJS plugin, but downgrading to v18 doesn't really
// help: semver compiles and is usable, but JSZip isn't, because of the second
// issue. Unlike contemporary bundlers, which generate sort of a map of module
// IDs to functions with module bodies, and where each module function gets its
// own scope separate from any other module, and where really asynchronous
// imports are emulated with synchronous require(), Rollup puts everything in
// the top-level scope, where modules are not separated lexically from each
// other, but instead renaming of identifiers is used to prevent name
// collisions. And this leads to the issue: everything is moved to the
// top-level scope, so conditional require()s in ifs or try-catches become
// impossible to do, and every module is executed regardless. This is how it
// would've been if bundling wasn't used and instead Rollup transpiled every
// file into an equivalent ES module, because you can't do conditional imports
// of ES modules either (without the dynamic import, but that's another story).
// So, in essence, Rollup replicates the runtime characteristics of ES modules
// here, and contemporary bundlers generate modules which get access to an
// almost real require(). This wouldn't have been a problem had JSZip not used
// conditional imports for supporting Nodejs streams, see
// <https://github.com/Stuk/jszip/blob/v3.5.0/lib/support.js#L34-L38> and
// <https://github.com/Stuk/jszip/blob/v3.5.0/lib/stream/StreamHelper.js#L10-L15>.
//
// And so, this leaves me with esbuild. Which, as you can see, at least works.
// Previously I used to patch semver and JSZip by hand to make them ES modules,
// now this can be done automatically. The versions of libraries are pinned in
// package.json, so, if updating is needed, make sure to pin with the `=`
// semver operator. Updates of the libraries *are possible*, but some things
// must be said about supported versions though:
//
// 1. semver in v7.0.0 was split into many little modules, which may help with
// "tree-shaking" in big applications, but I am bundling the entire library
// regardless, so it's more of a pain in the ass to me, rather than a benefit.
// In versions and below 6.x it is contained in a single file, and there are no
// significant API differences between 6.2 and 6.3.
//
// 2. JSZip in v3.6.0 uses a script prebuilt with Browserify when compiling for
// browsers, v3.5.0 does not, and I'd prefer to build everything from source
// rather than mixing build systems. However, that means turning of the browser
// mode in esbuild and setting up aliases for the `readable-stream-browser.js`
// module. Although, given that it's nwjs, we might as well provide support
// using the builtin `stream` module if possible...
//
// Anyway. Good luck and stay vigilant.

const esbuild = require('esbuild');
const paths = require('path');
const fs = require('fs');

const entryPoints = {
  jszip: 'jszip/lib/index.js',
  semver: 'semver',
  'strip-json-comments': 'strip-json-comments',
};

esbuild.build({
  entryPoints,
  bundle: true,
  outdir: paths.resolve(__dirname, '../packages/common/src/vendor-libs'),
  format: 'esm',
  plugins: [
    {
      // In commemoration of <https://github.com/webpack-contrib/null-loader>.
      name: 'null-loader',
      setup(build) {
        build.onResolve({ filter: /^stream$/ }, (args) => ({
          path: args.path,
          namespace: 'null-loader-ns',
        }));
        build.onLoad({ filter: /^/, namespace: 'null-loader-ns' }, (_args) => ({
          contents: 'throw new Error("This is a stub generated by null-loader");',
          loader: 'js',
        }));
      },
    },
    {
      name: 'postprocess',
      setup(build) {
        build.onEnd(async () => {
          for (const name of Object.keys(entryPoints)) {
            const path = paths.resolve(__dirname, `../common/vendor-libs/${name}.js`);
            let file = fs.readFileSync(path).toString();
            file = `// @ts-nocheck\n${file}`;
            fs.writeFileSync(path.replace('.js', '.ts'), file);
            fs.rmSync(path);
          }
        });
      },
    },
  ],
});
