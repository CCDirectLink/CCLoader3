import * as utils from '@ccloader3/common/utils';
import * as paths from '@ccloader3/common/paths';
import { Config } from './config';

async function request(path: string): Promise<Response> {
  try {
    let res = await fetch(utils.cwdFilePathToURL(path).href);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res;
  } catch (err) {
    if (utils.errorHasMessage(err)) {
      err.message = `Failed to load file '${path}': ${err.message}`;
    }
    throw err;
  }
}

export async function readFile(path: string): Promise<ArrayBuffer> {
  return (await request(path)).arrayBuffer();
}

export async function loadText(path: string): Promise<string> {
  return (await request(path)).text();
}

export async function isReadable(path: string): Promise<boolean> {
  try {
    let res = await fetch(utils.cwdFilePathToURL(path).href, { method: 'HEAD' });
    return res.ok;
  } catch (_err) {
    return false;
  }
}

export async function getModPathsIn(
  dir: string,
  _config: Config,
): Promise<{ modDirectories: string[]; ccmods: string[] }> {
  if (dir.endsWith('/')) dir = dir.slice(0, -1);

  let indexPath = `${dir}/index.json`;
  let indexJsonText = await loadText(indexPath);
  let index: string[];

  try {
    index = JSON.parse(indexJsonText);
  } catch (err) {
    if (utils.errorHasMessage(err)) {
      err.message = `Syntax error in mods directory index in '${indexPath}': ${err.message}`;
    }
    throw err;
  }

  const modPaths = index.map((modDirPath) => paths.join(dir, paths.jailRelative(modDirPath)));
  const modDirectories: string[] = [];
  const ccmods: string[] = [];
  for (const path of modPaths) {
    if (path.endsWith('.ccmod')) {
      ccmods.push(path);
    } else {
      modDirectories.push(path);
    }
  }

  return { modDirectories, ccmods };
}

// Replicates the behavior of `ig.ExtensionList#loadExtensionsPHP`.
export async function getInstalledExtensions(config: Config): Promise<string[]> {
  let igRoot = (config.impactConfig.IG_ROOT as string) ?? '';
  let igDebug = Boolean(config.impactConfig.IG_GAME_DEBUG);
  let extensionsApiUrl = `${igRoot}page/api/get-extension-list.php?debug=${igDebug ? 1 : 0}`;
  try {
    let res = await fetch(extensionsApiUrl);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    // Should the response be validated?
    return JSON.parse(await res.text());
  } catch (err) {
    if (utils.errorHasMessage(err)) {
      err.message = `Failed to send request to '${extensionsApiUrl}': ${err.message}`;
    }
    // throw err;
    return [];
  }
}
