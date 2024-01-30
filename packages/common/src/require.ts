// This code is based on the `mod-require-fix` mod:
// https://github.com/CCDirectLink/CCdiscord/blob/8c5dce9653b170ecb4d4a1ba5b170629539c2644/mod-require-fix/preload.js

import * as utils from './utils';

let requireFixed: NodeRequire = null!;

if (typeof require === 'function') {
  const paths = require('path') as typeof import('path');

  requireFixed = ((id) => {
    try {
      return require(id);
    } catch (_err) {
      let caller = getCaller();
      let searchPaths = getRequireSearchPaths(caller);
      // this will throw an error if it could not find it
      let pathToId = require.resolve(id, { paths: searchPaths });

      return require(pathToId);
    }
  }) as NodeRequire;

  Object.assign<NodeRequire, NodeRequire>(requireFixed, require);

  requireFixed.prototype = { constructor: requireFixed };

  function getRequireSearchPaths(caller: NodeJS.CallSite): string[] {
    let callerPath = resolveCallSiteFilePath(caller);
    if (callerPath == null) return [];

    let cwd = process.cwd();

    // just to avoid an infinite loop
    if (!callerPath.startsWith(cwd)) return [];

    let searchPaths = [];
    let currentDirectory;
    let currentPath = callerPath;
    do {
      currentDirectory = paths.dirname(currentPath);
      searchPaths.push(paths.join(currentDirectory, 'node_modules/'));

      currentPath = currentDirectory;
    } while (currentDirectory !== cwd);
    // the last pushed entry would be a duplicate
    searchPaths.pop();

    return searchPaths;
  }

  function resolveCallSiteFilePath(caller: NodeJS.CallSite): string | null {
    let fileNameStr = caller.getFileName();
    if (fileNameStr == null) return null;

    let url: URL | null = null;
    try {
      url = new URL(fileNameStr);
    } catch {}
    // the cal site is a script running in the browser context
    if (url != null) return paths.resolve(utils.cwdFilePathFromURL(url));

    // the call site is a built-in module
    if (!paths.isAbsolute(fileNameStr)) return null;

    // the call site is a script from the node.js context
    return paths.resolve(fileNameStr);
  }

  function getCaller(): NodeJS.CallSite {
    let stack: NodeJS.CallSite[];

    // https://v8.dev/docs/stack-trace-api
    // https://stackoverflow.com/a/13227808/12005228
    let err = new Error();
    let originalPrepareStackTrace = Error.prepareStackTrace;
    try {
      Error.prepareStackTrace = function (_err, stack2) {
        return stack2;
      };
      stack = err.stack as unknown as NodeJS.CallSite[];
    } finally {
      Error.prepareStackTrace = originalPrepareStackTrace;
    }

    // ignore the call site of this function (from which the mock error has
    // originated) and the one of our caller
    return stack[2];
  }
}

export default requireFixed;
