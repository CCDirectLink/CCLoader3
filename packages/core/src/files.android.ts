import * as filesBrowser from './files.browser';
import { Config } from './config';

export { isReadable, loadText } from './files.browser';

export async function getModDirectoriesIn(dir: string, config: Config): Promise<string[]> {
  if (dir === `${config.gameAssetsDir}mods/`) {
    try {
      let modsDirEntries = JSON.parse(CrossAndroidModListProvider.getModListAsJson()) as string[];
      let modSubdirs: string[] = [];
      for (let modDirName of modsDirEntries) {
        if (modDirName.endsWith('/')) {
          modSubdirs.push(`${dir}/${modDirName.slice(0, -1)}`);
        }
      }
      return modSubdirs;
    } catch (err) {
      console.error('Failed to get the list of mods from CrossAndroid:', err);
    }
  }
  return filesBrowser.getModDirectoriesIn(dir, config);
}

export async function getInstalledExtensions(config: Config): Promise<string[]> {
  try {
    return JSON.parse(CrossAndroidExtensionListProvider.getExtensionListAsJson());
  } catch (err) {
    console.error('Failed to get the list of extensions from CrossAndroid:', err);
  }
  return filesBrowser.getInstalledExtensions(config);
}
