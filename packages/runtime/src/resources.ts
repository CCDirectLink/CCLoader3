import * as resourcesPlain from './resources-plain';
import * as patchsteps from '@ccloader3/common/vendor-libs/patch-steps';
import type { ParsedPath, PatchFile } from 'ultimate-crosscode-typedefs/patch-steps-lib';
import * as utils from '@ccloader3/common/utils';
import { PatchList, ResourcePatchList } from './patch-list';
import * as paths from '@ccloader3/common/paths';
import * as types from 'ultimate-crosscode-typedefs/modloader-stdlib/resources';
import {
  ResourceGenerator,
  ResourcePatcherWithDeps,
} from 'ultimate-crosscode-typedefs/modloader-stdlib/patch-list';

export const MOD_PROTOCOL = 'mod:';
export const MOD_PROTOCOL_PREFIX = `${MOD_PROTOCOL}//`;

export const assetOverridesTable = new Map<string, string>();
export const textGenerators = new PatchList<
  ResourceGenerator<string, types.TextGeneratorContext>
>();
export const jsonPatches = new ResourcePatchList<unknown, types.JSONPatcherContext>();
export const jsonGenerators = new PatchList<
  ResourceGenerator<unknown, types.JSONGeneratorContext>
>();
export const imagePatches = new ResourcePatchList<HTMLCanvasElement, types.ImagePatcherContext>();
export const imageGenerators = new PatchList<
  ResourceGenerator<HTMLImageElement | HTMLCanvasElement, types.ImageGeneratorContext>
>();

{
  let assetOverridesFromMods = new Map<string, modloader.Mod[]>();

  for (let mod of modloader.loadedMods.values()) {
    for (let asset of mod.assets) {
      if (asset.endsWith('.json.patch') || asset.endsWith('.patch.json')) {
        let patchedAsset = `${asset.slice(0, -'.json.patch'.length)}.json`;
        registerPatchstepsPatch(mod, asset, patchedAsset);
        continue;
      }

      let modsWithThisAsset = utils.mapGetOrInsert(assetOverridesFromMods, asset, []);
      modsWithThisAsset.push(mod);
    }
  }

  for (let [asset, modsWithThisAsset] of assetOverridesFromMods) {
    if (modsWithThisAsset.length > 1) {
      console.warn(
        `Conflict between overrides for '${asset}' found in mods '${modsWithThisAsset
          .map((mod) => mod.id)
          .join("', '")}'. Using the override from mod '${modsWithThisAsset[0].id}'`,
      );
    }

    let overridePath = `${modsWithThisAsset[0].assetsDirectory}${asset}`;
    assetOverridesTable.set(asset, overridePath);
  }
}

function registerPatchstepsPatch(
  mod: modloader.Mod,
  patchFileRelativePath: string,
  patchedAssetPath: string,
): void {
  jsonPatches.add(patchedAssetPath, {
    dependencies: () => {
      return resourcesPlain.loadJSON<PatchFile>(
        wrapPathIntoURL(`${mod.assetsDirectory}${patchFileRelativePath}`).href,
      );
    },

    patcher: async (data, patchData) => {
      let debugState = new PatchstepsCustomDebugState(mod);
      debugState.addFile([/* fromGame */ false, patchFileRelativePath]);
      await patchsteps.patch(data, patchData, patchstepsResourceLoader, debugState);

      return data;
    },
  });

  function patchstepsResourceLoader(fromGame: string | boolean, url: string): Promise<unknown> {
    return fromGame === false
      ? resourcesPlain.loadJSON(wrapPathIntoURL(mod.resolvePath(url)).href)
      : loadJSON(url);
  }
}

export async function loadText(
  path: string,
  options?: types.LoadTextOptions | null,
): Promise<string> {
  options = options ?? {};

  let { resolvedPath, requestedAsset } = resolvePathAdvanced(path, options);

  if ((options.allowGenerators ?? true) && requestedAsset != null) {
    let generators = textGenerators.forPath(requestedAsset);
    if (generators.length > 0) {
      let ctx: types.TextGeneratorContext = { resolvedPath, requestedAsset, options };
      return runResourceGenerator('text file', path, generators, ctx);
    }
  }

  return resourcesPlain.loadText(wrapPathIntoURL(resolvedPath).href);
}

export async function loadJSON<T = unknown>(
  path: string,
  options?: types.LoadJSONOptions | null,
): Promise<T> {
  options = options ?? {};

  let { resolvedPath, requestedAsset } = resolvePathAdvanced(path, options);
  let data: unknown = null!;
  let shouldFetchRealData = true;

  if ((options.allowGenerators ?? true) && requestedAsset != null) {
    let generators = jsonGenerators.forPath(requestedAsset);
    if (generators.length > 0) {
      let ctx: types.JSONGeneratorContext = { resolvedPath, requestedAsset, options };
      data = await runResourceGenerator('JSON file', path, generators, ctx);
      shouldFetchRealData = false;
    }
  }

  if (shouldFetchRealData) {
    data = await resourcesPlain.loadJSON(wrapPathIntoURL(resolvedPath).href);
  }

  if (requestedAsset != null) {
    let patchers = jsonPatches.forPath(requestedAsset);
    if (patchers.length > 0) {
      let ctx: types.JSONPatcherContext = { resolvedPath, requestedAsset, options };
      data = await runResourcePatches('JSON file', path, data, patchers, ctx);
    }
  }

  return data as T;
}

export async function loadImage(
  path: string,
  options?: types.LoadImageOptions | null,
): Promise<HTMLImageElement | HTMLCanvasElement> {
  options = options ?? {};

  let { resolvedPath, requestedAsset } = resolvePathAdvanced(path, options);
  let data: HTMLImageElement | HTMLCanvasElement = null!;
  let shouldFetchRealData = true;

  if ((options.allowGenerators ?? true) && requestedAsset != null) {
    let generators = imageGenerators.forPath(requestedAsset);
    if (generators.length > 0) {
      let ctx: types.ImageGeneratorContext = { resolvedPath, requestedAsset, options };
      data = await runResourceGenerator('image', path, generators, ctx);
      shouldFetchRealData = false;
    }
  }

  if (shouldFetchRealData) {
    data = await resourcesPlain.loadImage(wrapPathIntoURL(resolvedPath).href);
  }

  if (requestedAsset != null) {
    let patchers = imagePatches.forPath(requestedAsset);
    if (patchers.length > 0) {
      if (!(data instanceof HTMLCanvasElement)) {
        data = imageToCanvas(data);
      }
      let ctx: types.ImagePatcherContext = { resolvedPath, requestedAsset, options };
      data = await runResourcePatches('image', path, data, patchers, ctx);
    }
  }

  switch (options.returnCanvas) {
    case 'always':
      if (!(data instanceof HTMLCanvasElement)) data = imageToCanvas(data);
      break;
    case 'never':
      if (data instanceof HTMLCanvasElement) data = await canvasToImage(data);
      break;
    case 'if-patched':
      break;
  }

  return data;

  function imageToCanvas(image: HTMLImageElement): HTMLCanvasElement {
    let canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    let ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    return canvas;
  }

  function canvasToImage(canvas: HTMLCanvasElement): Promise<HTMLImageElement> {
    return resourcesPlain.loadImage(canvas.toDataURL('image/png'));
  }
}

async function runResourceGenerator<Data, Ctx>(
  kind: string,
  path: string,
  matchingGenerators: Array<ResourceGenerator<Data, Ctx>>,
  context: Ctx,
): Promise<Data> {
  try {
    if (matchingGenerators.length === 1) {
      let generator = matchingGenerators[0];
      return generator(context);
    } else if (matchingGenerators.length > 1) {
      throw new Error(
        `Conflict between ${matchingGenerators.length} matching generators for '${path}' found`,
      );
    } else {
      throw new Error('unreachable');
    }
  } catch (err) {
    if (utils.errorHasMessage(err)) {
      err.message = `Failed to generate ${kind} '${path}': ${err.message}`;
    }
    throw err;
  }
}

async function runResourcePatches<Data, Ctx>(
  kind: string,
  path: string,
  data: Data,
  patchers: Array<ResourcePatcherWithDeps<Data, unknown, Ctx>>,
  context: Ctx,
): Promise<Data> {
  try {
    /* eslint-disable no-undefined */

    let allDependencies: unknown[] = await Promise.all(
      patchers.map((patcher) =>
        patcher.dependencies != null ? patcher.dependencies(context) : undefined,
      ),
    );

    for (let i = 0; i < patchers.length; i++) {
      let patcher = patchers[i];
      let deps = allDependencies[i];
      let newData = await patcher.patcher(data, deps, context);
      if (newData !== undefined) data = newData;
    }

    return data;

    /* eslint-enable no-undefined */
  } catch (err) {
    if (utils.errorHasMessage(err)) {
      err.message = `Failed to patch ${kind} '${path}': ${err.message}`;
    }
    throw err;
  }
}

export function resolvePath(uri: string, options?: types.ResolvePathOptions | null): string {
  return resolvePathAdvanced(uri, options).resolvedPath;
}

export function resolvePathToURL(path: string, options?: types.ResolvePathOptions | null): string {
  return wrapPathIntoURL(resolvePath(path, options)).href;
}

export function resolvePathAdvanced(
  uri: string,
  options?: types.ResolvePathOptions | null,
): types.ResolvePathAdvancedResult {
  options = options ?? {};

  let resolvedPath: string;
  let requestedAsset: string | null = null;

  let modResourcePath = applyModURLProtocol(uri);
  if (modResourcePath != null) {
    resolvedPath = modResourcePath;
  } else {
    let normalizedPath = paths.normalize(uri);

    if (paths.isAbsolute(normalizedPath)) {
      // `jailRelative` could've been performed instead, but it has the same
      // effect as `stripRoot` on absolute paths here because the path has
      // already been normalized, therefore the more time-expensive function can
      // be avoided
      resolvedPath = paths.stripRoot(normalizedPath);
    } else {
      let gameAssetsPath = paths.stripRoot(getGameAssetsURL().pathname);
      resolvedPath = paths.jailRelative(paths.join(gameAssetsPath, normalizedPath));

      if ((options.allowPatching ?? true) && resolvedPath.startsWith(gameAssetsPath)) {
        requestedAsset = resolvedPath.slice(gameAssetsPath.length);

        if (options.allowAssetOverrides ?? true) {
          let overridePath = assetOverridesTable.get(requestedAsset);
          if (overridePath != null) {
            resolvedPath = overridePath;
          }
        }
      }
    }
  }

  return { resolvedPath, requestedAsset };
}

export function wrapPathIntoURL(path: string): URL {
  let url = utils.cwdFilePathToURL(path, getGameAssetsURL().href);
  url.href += getCacheSuffix();
  return url;
}

export function getGameAssetsURL(): URL {
  let str: string;
  if (typeof ig !== 'undefined') {
    str = ig.root;
  } else if (window.IG_ROOT != null) {
    str = window.IG_ROOT;
  } else {
    str = '';
  }
  return new URL(str, document.baseURI);
}

export function getCacheSuffix(): string {
  if (typeof ig !== 'undefined') {
    return ig.getCacheSuffix();
  } else if (window.IG_GAME_CACHE != null && window.IG_GAME_CACHE) {
    return `?nocache=${window.IG_GAME_CACHE}`;
  } else {
    return '';
  }
}

function applyModURLProtocol(fullURI: string): string | null {
  if (!fullURI.startsWith(MOD_PROTOCOL_PREFIX)) return null;

  try {
    let uri = fullURI.slice(MOD_PROTOCOL_PREFIX.length);
    if (uri.length === 0) {
      throw new Error('the URI is empty');
    }

    let modIDSeparatorIndex = uri.indexOf('/');
    if (modIDSeparatorIndex < 0) {
      throw new Error("'/' after the mod ID is missing");
    }

    let modID = uri.slice(0, modIDSeparatorIndex);
    if (modID.length === 0) {
      throw new Error('the mod ID is empty');
    }

    let filePath = uri.slice(modIDSeparatorIndex + 1);
    if (filePath.length === 0) {
      throw new Error('the file path is empty');
    }

    let mod = modloader.loadedMods.get(modID);
    if (mod == null) {
      throw new Error(`mod '${modID}' not found`);
    }

    return mod.resolvePath(filePath);
  } catch (err) {
    if (utils.errorHasMessage(err)) {
      err.message = `Invalid '${MOD_PROTOCOL_PREFIX}' URL '${fullURI}': ${err.message}`;
    }
    throw err;
  }
}

class PatchstepsCustomDebugState extends patchsteps.DebugState {
  public constructor(private currentMod: modloader.Mod) {
    super();
  }

  public translateParsedPath(parsedPath: ParsedPath): string {
    if (parsedPath != null) {
      let [protocol, path] = parsedPath;

      // note that switch-case performs strict, i.e. `===`, comparisons
      switch (protocol) {
        case true:
        case 'game':
          return resolvePath(path);

        case false:
        case 'mod':
          return this.currentMod.resolvePath(path);
      }
    }

    // fallback to the default implementation on unknown paths and protocols
    return super.translateParsedPath(parsedPath);
  }
}

export const namespace: typeof ccmod.resources = {
  plain: resourcesPlain.namespace,
  assetOverridesTable,
  textGenerators,
  jsonPatches,
  jsonGenerators,
  imagePatches,
  imageGenerators,
  loadText,
  loadJSON,
  loadImage,
  resolvePath,
  resolvePathToURL,
  resolvePathAdvanced,
  wrapPathIntoURL,
  getGameAssetsURL,
  getCacheSuffix,
};
