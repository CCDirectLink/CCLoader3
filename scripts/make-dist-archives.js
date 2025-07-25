#!/usr/bin/env node

const archiver = require('archiver');
const fs = require('fs');
const paths = require('path');
const streams = require('stream');
const glob = require('readdir-glob');
const subprocess = require('child_process');
const zlib = require('zlib');

async function main() {
  let projectDir = paths.dirname(__dirname);
  let modloaderMeta = JSON.parse(
    await fs.promises.readFile(paths.join(projectDir, 'metadata.json'), 'utf8'),
  );

  let committerTime = (() => {
    let result = subprocess.spawnSync(
      'git',
      ['log', '--max-count=1', '--date=unix', '--pretty=format:%cd'],
      { cwd: projectDir, stdio: ['pipe', 'pipe', 'inherit'], encoding: 'utf8' },
    );
    if (result.error != null) throw result.error;
    return new Date(parseInt(result.stdout, 10) * 1000);
  })();

  /**
   * @param {archiver.Archiver} archive
   * @param {string=} prefix
   * @returns {Promise<void>}
   */
  function archiveAddModloaderFiles(archive, prefix = '') {
    return new Promise((resolve, reject) => {
      let searcher = glob(projectDir, {
        pattern: [
          'LICENSE',
          'main.css',
          'main.html',
          'metadata.json',
          'dist/**/{,*.js,*.d.ts,*.js.map}',
          'dist/runtime/ccmod.json',
          'dist/runtime/**/{,*.js,*.d.ts,*.js.map}',
          'dist/runtime/assets/**/{,*.json.patch}',
          'dist/runtime/media/**/{,*.png}',
          'dist-ccmod-service-worker.js',
        ],
        ignore: ['**/*.tsbuildinfo'],
        skip: ['node_modules', '.git'], // Don't waste time descending into these directories.
        stat: true, // Return results of fs.(l)stat.
        mark: true, // Add traling slashes to directories.
        silent: true, // Don't print errors to console.
      });

      // <https://github.com/archiverjs/node-archiver/blob/5.3.1/lib/core.js#L632-L682>
      searcher.on('match', (match) => {
        searcher.pause();
        let { stat } = match;
        archive.file(match.absolute, {
          prefix,
          name: match.relative,
          stats: stat,
          // Set mtimes for reproducibility of archives.
          date: committerTime,
          // Restricts modes to a subset of two which we actually care about,
          // plus they aren't used on Windows anyway.
          mode: stat.isDirectory() || (stat.mode & fs.constants.S_IXUSR) !== 0 ? 0o755 : 0o644,
          callback: () => searcher.resume(),
        });
      });
      searcher.on('error', (error) => reject(error));
      searcher.on('end', () => resolve());
    });
  }

  /**
   * @param {archiver.Archiver} archive
   * @param {archiver.EntryData} data
   * @param {Buffer=} source
   * @returns {Promise<void>}
   */
  function archiveAdd(archive, data, source = null) {
    return new Promise((resolve) => {
      archive.append(source, { date: committerTime, ...data, callback: resolve });
    });
  }

  /**
   * @param {archiver.Format} format
   * @param {archiver.ArchiverOptions} options
   * @param {string} filename
   * @param {(archive: archiver.Archiver) => Promise<void>} callback
   * @returns {Promise<void>}
   */
  async function createArchive(format, options, filename, callback) {
    let archive = archiver.create(format, options);
    let fileStream = fs.createWriteStream(filename);
    let archivePromise = streams.promises.pipeline(archive, fileStream);
    try {
      await callback(archive);
    } catch (error) {
      archive.emit('error', error);
    }
    await archive.finalize();
    await archivePromise;
  }

  /** @type {zlib.ZlibOptions} */
  let zlibOpts = { level: zlib.constants.Z_DEFAULT_COMPRESSION };
  for (let format of [
    {
      id: 'tar',
      fileExt: 'tgz',
      options: { gzip: true, gzipOptions: zlibOpts },
    },
    {
      id: 'zip',
      fileExt: 'zip',
      options: { zlib: zlibOpts },
    },
  ]) {
    createArchive(
      format.id,
      format.options,
      `ccloader_v${modloaderMeta.version}_package.${format.fileExt}`,
      (archive) => archiveAddModloaderFiles(archive, ''),
    );

    createArchive(
      format.id,
      format.options,
      `ccloader_v${modloaderMeta.version}_quick-install.${format.fileExt}`,
      async (archive) => {
        let modloaderDirName = 'ccloader3';
        let packageJsonData = {
          name: 'CrossCode',
          version: '1.0.0',
          main: `${modloaderDirName}/main.html`,
          'chromium-args': [
            '--ignore-gpu-blacklist',
            '--ignore-gpu-blocklist',
            '--disable-direct-composition',
            '--disable-background-networking',
            '--in-process-gpu',
            '--password-store=basic',
          ].join(' '),
          window: {
            toolbar: false,
            icon: 'favicon.png',
            width: 1136,
            height: 640,
            fullscreen: false,
          },
        };
        let packageJsonText = Buffer.from(`${JSON.stringify(packageJsonData, null, 2)}\n`, 'utf8');
        await archiveAdd(archive, { name: 'package.json' }, packageJsonText);
        await archiveAdd(archive, { name: 'assets/' });
        await archiveAdd(archive, { name: 'assets/mods/' });
        await archiveAdd(archive, { name: `${modloaderDirName}/` });
        await archiveAddModloaderFiles(archive, modloaderDirName);
      },
    );
  }

  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
