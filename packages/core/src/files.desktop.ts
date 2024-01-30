import * as utils from '@ccloader3/common/utils';
import { Config } from './config';

const fs = (window.require?.('fs') as typeof import('fs'))?.promises;
const fsconst = (window.require?.('fs') as typeof import('fs'))?.constants;

export async function loadText(path: string): Promise<string> {
  return fs.readFile(path, 'utf8');
}

export async function isReadable(path: string): Promise<boolean> {
  try {
    await fs.access(path, fsconst.R_OK);
    return true;
  } catch (_err) {
    return false;
  }
}

export async function findRecursively(dir: string): Promise<string[]> {
  if (dir.endsWith('/')) dir = dir.slice(0, -1);

  let fileList: string[] = [];
  await findRecursivelyInternal(dir, '', fileList);
  return fileList;
}

async function findRecursivelyInternal(
  currentDir: string,
  relativePrefix: string,
  fileList: string[],
): Promise<void> {
  let contents: string[];
  try {
    contents = await fs.readdir(currentDir);
  } catch (err) {
    if (utils.errorHasCode(err) && err.code === 'ENOENT') return;
    throw err;
  }

  await Promise.all(
    contents.map(async (name) => {
      let fullPath = `${currentDir}/${name}`;
      let stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        await findRecursivelyInternal(fullPath, `${relativePrefix}${name}/`, fileList);
      } else {
        fileList.push(`${relativePrefix}${name}`);
      }
    }),
  );
}

export async function getModDirectoriesIn(dir: string, _config: Config): Promise<string[]> {
  if (dir.endsWith('/')) dir = dir.slice(0, -1);

  let allContents: string[];
  try {
    allContents = await fs.readdir(dir);
  } catch (err) {
    if (utils.errorHasCode(err) && err.code === 'ENOENT') {
      await fs.mkdir(dir);
      allContents = await fs.readdir(dir);
    }
    throw err;
  }

  let modDirectories: string[] = [];
  await Promise.all(
    allContents.map(async (name) => {
      let fullPath = `${dir}/${name}`;
      // the `withFileTypes` option of `readdir` can't be used here because it
      // doesn't dereference symbolic links similarly to `stat`
      let stat = await fs.stat(fullPath);
      if (stat.isDirectory()) modDirectories.push(fullPath);
    }),
  );
  return modDirectories;
}

// Replicates the behavior of `ig.ExtensionList#loadExtensionsNWJS`.
export async function getInstalledExtensions(config: Config): Promise<string[]> {
  let igRoot = (config.impactConfig.IG_ROOT as string) ?? '';
  let igDebug = Boolean(config.impactConfig.IG_GAME_DEBUG);
  let extensionsDir = `${igRoot}${igDebug ? 'data' : 'assets'}/extension`;

  let allContents: string[];
  try {
    allContents = await fs.readdir(extensionsDir);
  } catch (err) {
    // Older versions of the game simply don't have the support for extensions.
    if (utils.errorHasCode(err) && err.code === 'ENOENT') return [];
    throw err;
  }

  let extensionIds: string[] = [];
  await Promise.all(
    allContents.map(async (name) => {
      // No idea why this is checked by the game.
      if (name.startsWith('.')) return;

      if (igDebug) {
        // The debug mode is interesting: it seems that when it is enabled,
        // only extension manifests are loaded from `data/extension/`, while
        // the files of the extensions reside inside game's normal directory
        // structure. So, extension directories with assets are created only
        // when the game is compiled for release.
        if (name.endsWith('.json')) {
          extensionIds.push(name.slice(0, -5));
        }
        return;
      }

      try {
        // The game also checks if the containing directory exists before
        // checking if there is a file inside, but it is redundant.
        await fs.access(`${extensionsDir}/${name}/${name}.json`);
      } catch (_err) {
        return;
      }
      extensionIds.push(name);
    }),
  );
  return extensionIds;
}
