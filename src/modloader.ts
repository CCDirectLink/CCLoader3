import * as files from './files.js';
import * as configM from './config.js';
import * as manifestM from './manifest.js';
import { Mod } from './mod.js';
import * as game from './game.js';
import semver from '../common/vendor-libs/semver.js';
import * as utils from '../common/dist/utils.js';
import * as dependencyResolver from './dependency-resolver.js';
import * as modDataStorage from './mod-data-storage.js';
import { LegacyManifest, Manifest } from 'ultimate-crosscode-typedefs/file-types/mod-manifest';
import { LoadingStage, ModID } from 'ultimate-crosscode-typedefs/modloader/mod';
import * as consoleM from '../common/dist/console.js';
import ajv, { JSONSchemaType } from "../common/vendor-libs/ajv.js";

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

  let runtimeModBaseDirectory = utils.cwdFilePathFromURL(new URL('../runtime', import.meta.url));
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
    loadedMods,
    modDataStorage: modDataStorage.namespace,
    Mod: {},
    _runtimeMod: runtimeMod,
  };

  console.log('beginning the game boot sequence...');
  await game.buildNecessaryDOM(config);

  await initModPluginClasses(loadedMods);
  console.log('mod plugin classes created!');

  console.log("stage 'preload' reached!");
  await executeStage(loadedMods, 'preload');

  console.log('running the main game script...');
  let domReadyCallback = await game.loadMainScript(
    config,
    runtimeMod.pluginClassInstance as import('../runtime/src/_main').default,
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
  let filePath = utils.cwdFilePathFromURL(new URL('../metadata.json', import.meta.url));
  let jsonText = await files.loadText(filePath);
  let data = JSON.parse(jsonText) as { version: string };
  return { version: new semver.SemVer(data.version) };
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

  // TODO: cache this offline, add redundancies, (bundle with latest?).
  let schema: JSONSchemaType<Manifest>;

  // Need to cache it locally and add redundancy.
  await fetch("https://schema.ccmod.xyz/1.0.0")
    .then(response => response.json())
    .then(data => {
      schema = data;
    });

  let modsCountPerDir = new Map<string, number>();
  await Promise.all(
    allModsList.map(async ({ parentDir, dir }) => {
      try {
        let mod = await loadModMetadata(dir, schema);
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

async function loadModMetadata(baseDirectory: string, schema?: JSONSchemaType<Manifest>): Promise<Mod | null> {
  let manifestFile: string = `${baseDirectory}/ccmod.json`;
  return files.loadText(manifestFile)
    .then(manifestText => {
      const manifestData: Manifest = JSON.parse(manifestText);
      if (schema) {
        const ajvValidator = new ajv({ allErrors: true });
        const validate = ajvValidator.compile(schema);

        const isValid = validate(manifestData);
        if (isValid) {
          return new Mod(baseDirectory, manifestData, false);
        } else {
          console.error(validate.errors);
          return null;
        }
      } else {
        return new Mod(baseDirectory, manifestData, false);
      }
    })
    .catch(reason => {
      console.warn(`Failed to load ccmod.json, reason: ${reason.message}. Attempting to load legacy manifest.`)
      manifestFile = `${baseDirectory}/package.json`;
      return files.loadText(manifestFile)
        .then(manifestText => {
          console.warn(`Using legacy manifest for mod ${baseDirectory};`);
          const legacyManifestData: LegacyManifest = JSON.parse(manifestText);
          const manifestData: Manifest = manifestM.convertFromLegacy(legacyManifestData);
          return new Mod(baseDirectory, manifestData, true);
        }).catch(reason => {
          console.error(`Failed to load legacy manifest, reason: ${reason.message}`);
          return null;
        })
    });
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
