import * as paths from '@ccloader3/common/paths';
import { stdlibNamespace as utils } from '@ccloader3/common/utils';
import requireFixed from '@ccloader3/common/require';
import semver from '@ccloader3/common/vendor-libs/semver';
import * as patchStepsLib from '@ccloader3/common/vendor-libs/patch-steps';

import { namespace as patchList } from './patch-list';
import { namespace as impactInitHooks } from './impact-init-hooks';
import { namespace as impactModuleHooks } from './impact-module-hooks';
import { namespace as resources } from './resources';
import { namespace as moduleCache } from './module-cache';

import './error-screen';
import './resources-injections';
import './lang-file-patcher';
import './greenworks-fix';

export default class RuntimeModMainClass implements modloader.Mod.PluginClass {
  public constructor(mod: modloader.Mod) {
    if (window.ccmod == null) window.ccmod = {} as typeof ccmod;
    Object.assign<typeof ccmod, Partial<typeof ccmod>>(window.ccmod, {
      implementor: modloader.name,
      implementation: mod.id,
      paths,
      utils,
      require: requireFixed,
      semver,
      // @ts-expect-error genuinely no idea what's going on here.
      patchStepsLib,
      patchList,
      impactInitHooks,
      impactModuleHooks,
      moduleCache,
      resources,
    });
  }

  public onImpactInit(): void {
    for (let [_, mod] of modloader.loadedMods)
      if (mod.manifest.modPrefix)
        moduleCache.registerModPrefix(mod.manifest.modPrefix, mod.baseDirectory.substring(7));
    for (let cb of impactInitHooks.callbacks) cb();
  }

  public async postload(): Promise<void> {
    await import('./_postload.js');
  }
}
