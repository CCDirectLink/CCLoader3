// based on https://github.com/CCDirectLink/DevModLoader/blob/7dd3c4ebee4b516b201205d0bb1c24913335b9f1/js/game/ig-interceptor.js

import * as impactInitHooks from './impact-init-hooks';
import { ImpactModuleHook } from 'ultimate-crosscode-typedefs/modloader-stdlib/impact-module-hooks';
import { PatchList } from './patch-list';

export const patchList = new PatchList<ImpactModuleHook>();

export function add(moduleName: string | RegExp, callback: ImpactModuleHook): void {
  patchList.add(moduleName, callback);
}

impactInitHooks.add(() => {
  let originalDefines = ig.defines;
  ig.defines = function (body) {
    let { name }: ig.Module = ig._current!;
    if (name == null) return originalDefines.call(this, body);

    return originalDefines.call(this, function (this: unknown, ...args: []) {
      body.apply(this, args);
      for (let callback of patchList.forPath(name!)) callback(name!);
    });
  };
});

export const namespace: typeof ccmod.impactModuleHooks = { patchList, add };
