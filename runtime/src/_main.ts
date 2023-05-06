import * as paths from '../../common/dist/paths.js';
import { stdlibNamespace as utils } from '../../common/dist/utils.js';
import requireFixed from '../../common/dist/require.js';
import semver from '../../common/vendor-libs/semver.js';
import * as patchStepsLib from '../../common/vendor-libs/patch-steps-lib.js';

import { namespace as patchList } from './patch-list.js';
import { namespace as impactInitHooks } from './impact-init-hooks.js';
import { namespace as impactModuleHooks } from './impact-module-hooks.js';
import { namespace as resources } from './resources.js';
import { namespace as moduleCache } from './module-cache.js';

import './error-screen.js';
import './resources-injections.js';
import './lang-file-patcher.js';
import './greenworks-fix.js';

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
      patchStepsLib,
      patchList,
      impactInitHooks,
      impactModuleHooks,
      moduleCache,
      resources,
    });
  }

  public onImpactInit(): void {
    for (let cb of impactInitHooks.callbacks) cb();
  }

  public async postload(): Promise<void> {
    await import('./_postload.js');
  }
}
