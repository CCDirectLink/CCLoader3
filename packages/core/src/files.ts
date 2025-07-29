import * as filesDesktop from './files.desktop';
import * as filesBrowser from './files.browser';
import * as filesAndroid from './files.android';
import * as filesCCMod from './files.ccmod';
import * as utils from '@ccloader3/common/utils';

const modules = {
  [utils.PlatformType.DESKTOP]: filesDesktop,
  [utils.PlatformType.ANDROID]: filesAndroid,
  [utils.PlatformType.BROWSER]: filesBrowser,
};
const currentModule = modules[utils.PLATFORM_TYPE];

export const { getModPathsIn, getInstalledExtensions } = currentModule;

export async function isReadable(path: string): Promise<boolean> {
  return (await filesCCMod.isReadable(path)) || currentModule.isReadable(path);
}

export async function readFile(path: string): Promise<ArrayBuffer> {
  return (await filesCCMod.readFile(path)) || currentModule.readFile(path);
}

export async function loadText(path: string): Promise<string> {
  return (await filesCCMod.loadText(path)) || currentModule.loadText(path);
}

export async function findRecursively(dir: string): Promise<string[] | null> {
  return (
    (await filesCCMod.findRecursively(dir)) ||
    ('findRecursively' in currentModule ? currentModule.findRecursively(dir) : null)
  );
}
