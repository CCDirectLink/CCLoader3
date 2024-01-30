import semver from '@ccloader3/common/vendor-libs/semver';
import * as paths from '@ccloader3/common/paths';
import * as utils from '@ccloader3/common/utils';
import * as filesDesktop from './files.desktop';
import { Manifest } from 'ultimate-crosscode-typedefs/file-types/mod-manifest';
import {
  Dependency,
  LegacyPluginClass,
  LoadingStage,
  ModID,
  Mod as ModPublic,
  PluginClass,
} from 'ultimate-crosscode-typedefs/modloader/mod';

export class Mod implements ModPublic {
  public readonly id: ModID;
  public readonly version: semver.SemVer | null = null;
  public readonly dependencies: ReadonlyMap<ModID, Dependency>;
  public readonly assetsDirectory: string;
  public assets = new Set<string>();
  public pluginClassInstance: PluginClass | null = null;

  public constructor(
    public readonly baseDirectory: string,
    public readonly manifest: Manifest,
    public readonly legacyMode: boolean,
  ) {
    if (!this.baseDirectory.endsWith('/')) this.baseDirectory += '/';

    this.id = this.manifest.id;

    if (this.manifest.version != null) {
      try {
        this.version = new semver.SemVer(this.manifest.version, {
          includePrerelease: true,
        });
      } catch (err) {
        if (utils.errorHasMessage(err)) {
          // TODO: put a link to semver docs here
          err.message = `mod version '${this.manifest.version}' is not a valid semver version: ${err.message}`;
        }
        throw err;
      }
    }

    let dependencies = new Map<ModID, Dependency>();

    if (this.manifest.dependencies != null) {
      for (let [depId, dep] of Object.entries(this.manifest.dependencies)) {
        if (typeof dep === 'string') dep = { version: dep };

        let depVersionRange: semver.Range;
        try {
          depVersionRange = new semver.Range(dep.version, {
            includePrerelease: true,
          });
        } catch (err) {
          if (utils.errorHasMessage(err)) {
            err.message = `dependency version constraint '${dep.version}' for mod '${depId}' is not a valid semver range: ${err.message}`;
          }
          throw err;
        }

        dependencies.set(depId, {
          version: depVersionRange,
          optional: dep.optional ?? false,
        });
      }
    }

    this.dependencies = dependencies;

    this.assetsDirectory = this.resolvePath(`${this.manifest.assetsDir ?? 'assets'}/`);
  }

  public async findAllAssets(): Promise<void> {
    let assets: string[] = [];
    if (this.manifest.assets != null) {
      assets = this.manifest.assets.map((path) => paths.jailRelative(path));
    } else if (utils.PLATFORM_TYPE === utils.PlatformType.DESKTOP) {
      assets = await filesDesktop.findRecursively(this.assetsDirectory);
    }
    this.assets = new Set(assets);
  }

  public async initClass(): Promise<void> {
    let script = this.manifest.plugin;
    if (script == null) return;
    let scriptFullPath = this.resolvePath(script);

    let module: { default: new (mod: ModPublic) => PluginClass };
    try {
      module = await import(utils.cwdFilePathToURL(scriptFullPath).href);
    } catch (err) {
      if (utils.errorHasMessage(err)) {
        err.message = `Error while importing '${scriptFullPath}': ${err.message}`;
      }
      throw err;
    }

    if (!utils.hasKey(module, 'default')) {
      throw new Error(`Module '${scriptFullPath}' has no default export`);
    }

    let ModPluginClass = module.default;
    this.pluginClassInstance = new ModPluginClass(this);
  }

  public async executeStage(stage: LoadingStage): Promise<void> {
    let pluginCls = this.pluginClassInstance;
    if (pluginCls != null) {
      if (!this.legacyMode) {
        if (stage in pluginCls) await pluginCls[stage]!(this);
      } else {
        let legacyPluginCls = pluginCls as LegacyPluginClass;
        let methodName: keyof LegacyPluginClass = stage === 'poststart' ? 'main' : stage;
        if (methodName in legacyPluginCls) await legacyPluginCls[methodName]!();
      }
    }

    let script = this.manifest[stage];
    if (script == null) return;
    let scriptFullPath = this.resolvePath(script);

    await import(utils.cwdFilePathToURL(scriptFullPath).href);
  }

  public resolvePath(path: string): string {
    return paths.join(this.baseDirectory, paths.jailRelative(path));
  }
}
