/* eslint-disable no-global-assign */

import * as impactModuleHooks from './impact-module-hooks';
import * as resources from './resources';

if (typeof require !== 'undefined') {
  const pathsNative = require('path') as typeof import('path');

  const GAME_ASSETS_FS_PATH = pathsNative.join(
    process.cwd(),
    resources.getGameAssetsURL().pathname,
  );

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

        let originalRequire: typeof require = require;
        try {
          // note, however, that such replacement of `require()` will most
          // likely break any mod code using some arcane semantics of `require()`
          // or any of its properties (e.g. `require.resolve`, `require.cache`)
          // inside of an injection into `ig.Greenworks`, though that's hardly
          // an issue in my opinion
          require = function (this: unknown, path: string, ...args2) {
            path = originalRequire.resolve(path, { paths: [GAME_ASSETS_FS_PATH] });
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
