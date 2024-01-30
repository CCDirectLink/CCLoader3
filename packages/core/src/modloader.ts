import * as files from './files';
import * as configM from './config';
import * as manifestM from './manifest';
import { Mod } from './mod';
import * as game from './game';
import semver from '@ccloader3/common/vendor-libs/semver';
import * as utils from '@ccloader3/common/utils';
import * as dependencyResolver from './dependency-resolver';
import * as modDataStorage from './mod-data-storage';
import { LegacyManifest, Manifest } from 'ultimate-crosscode-typedefs/file-types/mod-manifest';
import { LoadingStage, ModID } from 'ultimate-crosscode-typedefs/modloader/mod';
import * as consoleM from '@ccloader3/common/console';

type ModsMap = Map<ModID, Mod>;
type ReadonlyModsMap = ReadonlyMap<ModID, Mod>;

export async function boot(): Promise<void> {
  consoleM.inject();

  let modloaderMetadata = await loadModloaderMetadata();
  console.log(`CCLoader ${modloaderMetadata.version}`);

  let config = await configM.load(modloaderMetadata.version);

  try {
    await modDataStorage.readImmediately();
  } catch (err) {
    if (utils.errorHasMessage(err)) {
      err.message = `Failed to read mod data storage: ${err.message}`;
    }
    throw err;
  }
  console.log(`loaded mod data storage and settings, ${modDataStorage.data.size} entries`);

  let { version: gameVersion, hotfix: gameVersionHotfix } = await game.loadVersion(config);
  console.log(`crosscode ${gameVersion}-${gameVersionHotfix}`);

  let runtimeModBaseDirectory = utils.cwdFilePathFromURL(
    // @ts-expect-error we're not using CJS
    new URL('../dist/runtime', import.meta.url),
  );
  let runtimeMod: Mod | null;
  try {
    runtimeMod = await loadModMetadata(runtimeModBaseDirectory);
    if (!(runtimeMod != null)) {
      throw new Error('Assertion failed: runtimeMod != null');
    }
  } catch (err) {
    if (utils.errorHasMessage(err)) {
      err.message = `Failed to load metadata of the runtime mod in '${runtimeModBaseDirectory}', please check if you installed CCLoader correctly! ${err.message}`;
    }
    throw err;
  }
  console.log(`${runtimeMod.id} ${runtimeMod.version}`);

  let virtualPackages = new Map<ModID, semver.SemVer>()
    .set('crosscode', gameVersion)
    .set('ccloader', modloaderMetadata.version);
  if (typeof process !== 'undefined') {
    virtualPackages.set('nw', new semver.SemVer(process.versions.nw));
  }

  let installedExtensions = new Map<ModID, semver.SemVer>();
  let enabledExtensions = new Map<ModID, semver.SemVer>();
  await findAllExtensions(config, installedExtensions, enabledExtensions, gameVersion);

  console.log(
    `found ${installedExtensions.size} extensions: ${Array.from(installedExtensions.keys())
      .map((extID) => {
        let str = extID;
        if (!enabledExtensions.has(extID)) str += ' (disabled)';
        return str;
      })
      .join(', ')}`,
  );

  let installedMods = new Map<ModID, Mod>();
  installedMods.set(runtimeMod.id, runtimeMod);
  await loadAllModMetadata(config, installedMods);

  installedMods = dependencyResolver.sortModsInLoadOrder(runtimeMod, installedMods);
  let loadedMods = new Map<ModID, Mod>();
  let loadedModsSetupPromises: Array<Promise<void>> = [];

  for (let [modID, mod] of installedMods) {
    if (mod !== runtimeMod && !modDataStorage.isModEnabled(modID)) {
      continue;
    }

    let dependencyProblems = dependencyResolver.verifyModDependencies(
      mod,
      installedMods,
      virtualPackages,
      installedExtensions,
      enabledExtensions,
      loadedMods,
    );
    if (dependencyProblems.length > 0) {
      for (let problem of dependencyProblems) {
        console.warn(`Problem with requirements of mod '${modID}': ${problem}`);
      }
      continue;
    }

    loadedMods.set(modID, mod);
    loadedModsSetupPromises.push(
      mod.findAllAssets().catch((err) => {
        console.error(`An error occured while searching assets of mod '${modID}':`, err);
      }),
    );
  }

  if (!loadedMods.has(runtimeMod.id)) {
    throw new Error('Could not load the runtime mod, game initialization is impossible!');
  }

  await Promise.all(loadedModsSetupPromises);

  console.log(
    `${loadedMods.size} mods will be loaded: ${Array.from(loadedMods.values())
      .map((mod) => {
        let str = mod.id;
        if (mod.version != null) str += ` v${mod.version}`;
        return str;
      })
      .join(', ')}`,
  );

  window.modloader = {
    name: 'ccloader',
    version: modloaderMetadata.version,
    gameVersion,
    gameVersionHotfix,
    installedMods,
    config,
    loadedMods,
    modDataStorage: modDataStorage.namespace,
    Mod: {},
    _runtimeMod: runtimeMod,
  } as typeof modloader;

  console.log('beginning the game boot sequence...');
  await game.buildNecessaryDOM(config);

  await initModPluginClasses(loadedMods);
  console.log('mod plugin classes created!');

  console.log("stage 'preload' reached!");
  await executeStage(loadedMods, 'preload');

  console.log('running the main game script...');
  let domReadyCallback = await game.loadMainScript(
    config,
    runtimeMod.pluginClassInstance as import('@ccloader3/runtime/_main').default,
  );

  console.log("stage 'postload' reached!");
  await executeStage(loadedMods, 'postload');
  domReadyCallback();

  let startGameFn = await game.getStartFunction();
  console.log("stage 'prestart' reached!");
  if (utils.PLATFORM_TYPE === utils.PlatformType.ANDROID) {
    try {
      CrossAndroid.executePostGameLoad();
    } catch (err) {
      console.error(`Failed to apply CrossAndroid's built-in mods:`, err);
    }
  }
  await executeStage(loadedMods, 'prestart');

  console.log('running startCrossCode()...');
  startGameFn();

  let activeDelegateFn = await game.getDelegateActivationFunction();
  console.log("stage 'poststart' reached!");
  await executeStage(loadedMods, 'poststart');

  activeDelegateFn();
  console.log('crosscode with mods is now fully loaded!');
}

async function loadModloaderMetadata(): Promise<{ version: semver.SemVer }> {
  // @ts-expect-error we're not using CJS
  let filePath = utils.cwdFilePathFromURL(new URL('../metadata.json', import.meta.url));
  let jsonText = await files.loadText(filePath);
  let data = JSON.parse(jsonText) as { version: string };
  return {
    version: new semver.SemVer(data.version, {
      includePrerelease: true,
    }),
  };
}

async function loadAllModMetadata(config: configM.Config, installedMods: ModsMap): Promise<void> {
  let allModsList: Array<{ parentDir: string; dir: string }> = [];
  for (let dir of config.modsDirs) {
    let subdirsList: string[];
    try {
      subdirsList = await files.getModDirectoriesIn(dir, config);
    } catch (err) {
      console.warn(`Failed to load the list of mods in '${dir}':`, err);
      continue;
    }
    for (let subdir of subdirsList) {
      allModsList.push({ parentDir: dir, dir: subdir });
    }
  }

  let modsCountPerDir = new Map<string, number>();
  await Promise.all(
    allModsList.map(async ({ parentDir, dir }) => {
      try {
        let mod = await loadModMetadata(dir);
        if (mod == null) return;

        let modWithSameId = installedMods.get(mod.id);
        if (modWithSameId != null) {
          throw new Error(
            `A mod with ID '${mod.id}' has already been loaded from '${modWithSameId.baseDirectory}'`,
          );
        }

        installedMods.set(mod.id, mod);
        modsCountPerDir.set(parentDir, (modsCountPerDir.get(parentDir) ?? 0) + 1);
      } catch (err) {
        console.error(`An error occured while loading the metadata of a mod in '${dir}':`, err);
      }
    }),
  );

  for (let [dir, count] of modsCountPerDir) {
    console.log(`found ${count} mods in '${dir}'`);
  }
}

async function findAllExtensions(
  config: configM.Config,
  installedExtensions: Map<string, semver.SemVer>,
  enabledExtensions: Map<string, semver.SemVer>,
  defaultExtVersion: semver.SemVer,
): Promise<void> {
  let extList: string[];
  try {
    extList = await files.getInstalledExtensions(config);
  } catch (err) {
    console.warn('Failed to load the extensions list:', err);
    return;
  }
  for (let extID of extList) {
    let extVersion = new semver.SemVer(defaultExtVersion, defaultExtVersion.options);
    if (extID.startsWith('-')) {
      // Extension is disabled
      extID = extID.slice(1);
    } else {
      enabledExtensions.set(extID, extVersion);
    }
    installedExtensions.set(extID, extVersion);
  }
}

let manifestValidator = new manifestM.Validator();

async function loadModMetadata(baseDirectory: string): Promise<Mod | null> {
  let manifestFile: string;
  let manifestText: string;
  let legacyMode = false;

  try {
    manifestFile = `${baseDirectory}/ccmod.json`;
    manifestText = await files.loadText(manifestFile);
  } catch (_e1) {
    try {
      legacyMode = true;
      manifestFile = `${baseDirectory}/package.json`;
      manifestText = await files.loadText(manifestFile);
    } catch (_e2) {
      return null;
    }
  }

  let manifestData: Manifest | LegacyManifest;
  try {
    manifestData = JSON.parse(manifestText);
  } catch (err) {
    if (utils.errorHasMessage(err)) {
      err.message = `Syntax error in mod manifest in '${manifestFile}': ${err.message}`;
    }
    throw err;
  }

  try {
    if (legacyMode) {
      manifestData = manifestData as LegacyManifest;
      manifestValidator.validateLegacy(manifestData);
      manifestData = manifestM.convertFromLegacy(manifestData);
    } else {
      manifestData = manifestData as Manifest;
      manifestValidator.validate(manifestData);
    }
  } catch (err) {
    if (utils.errorHasMessage(err)) {
      err.message = `Invalid mod manifest in '${manifestFile}': ${err.message}`;
      // TODO: put a link to the documentation here
    }
    throw err;
  }

  return new Mod(baseDirectory, manifestData, legacyMode);
}

async function initModPluginClasses(mods: ReadonlyModsMap): Promise<void> {
  for (let mod of mods.values()) {
    try {
      await mod.initClass();
    } catch (err) {
      console.error(`Failed to initialize class of mod '${mod.id}':`, err);
    }
  }
}

async function executeStage(mods: ReadonlyModsMap, stage: LoadingStage): Promise<void> {
  for (let mod of mods.values()) {
    try {
      await mod.executeStage(stage);
    } catch (err) {
      console.error(`Failed to execute ${stage} of mod '${mod.id}':`, err);
    }
  }
}
