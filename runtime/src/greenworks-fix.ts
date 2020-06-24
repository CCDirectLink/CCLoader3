/* eslint-disable no-global-assign */

import * as impactModuleHooks from './impact-module-hooks.js';
import { GAME_ASSETS_URL } from './resources.constants.js';

if (typeof require !== 'undefined' && !modloader.gameSourceIsObfuscated) {
  // `ig.Greenworks` was added only in v1.0.2, but this doesn't matter as the
  // module hook simply won't be fired if the respective module isn't created
  impactModuleHooks.add('impact.feature.greenworks.greenworks', () => {
    ig.Greenworks.inject({
      init(...args) {
        // Unfortunately, due to how `require()` behaves in nw.js, the default
        // implementation has to specify paths of `require()`d modules as
        // relative to the `assets` directory. On the other hand this isn't hard
        // to fix - we just have to inject the absolute path of the assets
        // directory into the search paths of `require()`.

        const pathsNative = require('path') as typeof import('path');

        let originalRequire: typeof require = require;
        try {
          let gameAssetsFsPath = pathsNative.join(process.cwd(), GAME_ASSETS_URL.pathname);

          // note, however, that such replacement of `require()` will most
          // likely break any mod code using some arcane semantics of `require()`
          // or any of its properties (e.g. `require.resolve`, `require.cache`)
          // inside of an injection into `ig.Greenworks`, though that's hardly
          // an issue in my opinion
          require = function (this: unknown, path: string, ...args2) {
            path = originalRequire.resolve(path, { paths: [gameAssetsFsPath] });
            return originalRequire.call(this, path, ...args2);
          } as typeof require;

          return this.parent(...args);
        } finally {
          require = originalRequire;
        }
      },
    });
  });
}
