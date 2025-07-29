/* eslint-disable consistent-return */
// This may be one of the worst pieces of this codebase. Please don't judge too heavily!

import semver from '@ccloader3/common/vendor-libs/semver';
import type { LocalizedString } from 'ultimate-crosscode-typedefs/file-types/mod-manifest';

interface LegacyMod {
  baseDirectory: string;
  name: LocalizedString;
  displayName: LocalizedString;
}

const Plugin = class Plugin {
  public preload(): void {}
  public postload(): void {}
  public prestart(): void {}
  public main(): void {}
};

// The de-facto Simplify Compat Layer
// <https://github.com/CCDirectLink/CCLoader/blob/0b23512543bf85ef21757b36492f991c03a16ef7/assets/mods/simplify/mod.js>
const _simplify = {
  version: '2.14.2',
  updateHandlers: [] as Array<() => void>,

  registerUpdate(handler?: () => void) {
    if (handler && typeof handler === 'function') {
      this.updateHandlers.push(handler);
    }
  },
  // technically never called by us, but let's keep it in just to be sure.
  fireUpdate() {
    for (const handler of this.updateHandlers) {
      handler();
    }
  },

  getMod(name: string): LegacyMod | undefined {
    const mod = modloader.loadedMods.get(name);
    if (!mod) return;

    return {
      baseDirectory: mod.baseDirectory,
      name: mod.id,
      displayName: mod.manifest.title || mod.id,
    };
  },

  // seriously? :harold:
  jumpHigh() {
    ig.game.playerEntity.doJump(185, 16, 100);
  },
};

// For some reason this was just an alias to `window`????
const cc = window;
const simplify = new Proxy(_simplify, {
  get(target, p) {
    // This is honestly just vile
    const prop = target[p as keyof typeof _simplify];
    p = String(p);

    // Should it ever occur that I've forgotten something in the compat layer, let the user know.
    if (!prop) {
      console.warn(new Error(`Couldn't find '${p}' in Simplify compat layer. Please report!`));
      return;
    }

    console.debug(new Error(`Simplify property '${p}' requested. This is deprecated.`));
    return prop;
  },
});

Object.assign(window, {
  cc,
  simplify,
  Plugin,
  semver,

  versions: Array.from(modloader.installedMods.values()).reduce<Record<string, string>>(
    (acc, mod) => {
      if (!mod.version) {
        console.debug('Mod without a version detected in construction of window.versions');
        return acc;
      }
      acc[mod.id] = mod.version.toString();
      return acc;
    },
    {},
  ),
  activeMods: [...modloader.loadedMods.values()],
  inactiveMods: [...modloader.installedMods.values()].filter(
    (mod) => !modloader.modDataStorage.isModEnabled(mod.id),
  ),
});

// For some reason these were distinct events despite the fact that they fire
// right after eachother. After the `main` stage ran, `modsLoaded` was
// dispatched, while Simplify was already listening for it, causing it to
// trigger immediately. Strange decision to even include `simplifyInitialized`.
document.body.addEventListener('modsLoaded', () => {
  document.body.dispatchEvent(new Event('simplifyInitialized', { bubbles: true }));
});
