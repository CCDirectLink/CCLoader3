import * as resources from './resources';
import * as impactInitHooks from './impact-init-hooks';
import * as impactModuleHooks from './impact-module-hooks';
import * as utils from '@ccloader3/common/utils';

impactInitHooks.add(() => {
  $.ajaxSetup({
    beforeSend(_jqXhr: JQueryXHR, settings: JQueryAjaxSettings): boolean {
      if (settings.dataType !== 'json' || settings.type !== 'GET') {
        return true;
      }

      let { url } = settings;
      if (typeof url !== 'string') {
        return true;
      }

      if (!url.startsWith(resources.MOD_PROTOCOL_PREFIX)) {
        let gameAssetsURL = resources.getGameAssetsURL().href;

        let parsedURL = new URL(url, document.baseURI).href;
        if (!parsedURL.startsWith(gameAssetsURL)) {
          return true;
        }

        // This is the only request to a local PHP script in the entire game,
        // that is, a script located inside the assets directory. However, it is
        // not patched not only because its a PHP script. See, `ig.ExtensionList`
        // has a bug: it calls this PHP script which, of course, doesn't work in
        // the production version, when the game is running in the browser (in
        // nw.js it just uses `fs.readdir`). The function which triggers the
        // network request (`ig.ExtensionList#onExtensionListLoaded`) assigns
        // the same handler for both successes and errors. On success nothing
        // extraordinary would have happened: the handler would simply receive a
        // JSON response containing the list of extensions and move on. However:
        // the first argument of an error handler for `$.ajax` is the `JQueryXHR`
        // instance (unlike for success where it is the received data), but the
        // game doesn't crash under normal conditions as it uses a plain old
        // "for i" loop to iterate the received list: `list.length` returns
        // `undefined` when the `jqXHR` instance is received, so nothing is
        // iterated and nothing crashes. In our case though I have to ignore
        // this specific request and just let JQuery handle it because of the
        // returned `null`s in the request hijacking code below.
        if (parsedURL.startsWith(`${gameAssetsURL}page/api/get-extension-list.php`)) {
          return true;
        }
      }

      if (ig.root.length > 0 && url.startsWith(ig.root)) {
        url = url.slice(ig.root.length);
      }

      let cacheSuffix = resources.getCacheSuffix();
      if (cacheSuffix.length > 0 && url.endsWith(cacheSuffix)) {
        url = url.slice(0, -cacheSuffix.length);
      }

      let { context, success, error, complete } = settings;
      delete settings.success;
      delete settings.error;
      delete settings.complete;
      resources
        .loadJSON(url, { callerThisValue: context })
        .then(
          (data) => {
            if (success != null) {
              // About returning `null` instead of the instance of `JQueryXHR`:
              // it should be obvious that while I technically can pass the
              // `JQueryXHR` object received by the overall `beforeSend` function,
              // it will be invalid because it has been hijacked and aborted.
              // `null` is returned instead here and for other handlers because
              // neither mods nor the game rely on any arguments besides the
              // received JSON data, and this should discourage future uses of
              // `$.ajax` for fetching assets from mods.
              success.call(context, data, 'hijacked', null!);
            }
          },
          (err) => {
            // errors aren't really handled by the game though, so let's log it
            // here as well
            console.error(err);
            if (error != null) {
              error.call(context, null!, 'hijacked', err);
            }
          },
        )
        .finally(() => {
          if (complete != null) {
            complete.call(context, null!, 'hijacked');
          }
        });

      return false;
    },
  });
});

impactModuleHooks.add('impact.base.image', () => {
  ig.Image.inject({
    loadInternal(path) {
      // Some image paths include trailing whitespace which the devs didn't
      // notice because JS automatically trims whitespace (note: encoded
      // whitespace, i.e. `%20`-like entities, are left untouched) in URLs. I'm
      // assuming that there are no such JSON paths because JQuery automatically
      // encodes URIs before requesting and there are no instances of leading
      // whitespace because `ig.root` is not empty in the development version.
      path = path.trimRight();
      // NOTE: Strictly speaking, Impact's file forwarding must be applied
      // first, before trimming, as in the game, but I'm not sure if this will
      // break anything because the current behavior certainly haven't so far,
      // so TODO: test this and restore the correct order.
      path = applyImpactFileForwarding(path);
      resources.loadImage(path, { callerThisValue: this }).then(
        (img) => {
          this.data = img;
          this.onload();
        },
        (err) => {
          // errors aren't displayed by `ig.Image`
          console.error(err);
          this.onerror();
        },
      );
    },

    // the default implementation appends a query with the current date in
    // milliseconds instead of using `ig.getCacheSuffix()` because reloading was
    // implemented for images before a more general reload system,
    // `ig.Loadable#reload` existed, so let's fix this by calling the default
    // implementation
    debugReload: true,
    reload() {
      if ('reload' in ig.Loadable.prototype) {
        // I kinda gave up fixing the `ImpactClass` here
        ig.Loadable.prototype.reload.call(this);
      } else {
        // doubt that someone will ever need the semantics of the default
        // `ig.Loadable#reload` implementation in pre-1.1.0 versions which have
        // been abandoned by everyone except speedrunners
        this.load();
      }
    },
  });
});

impactModuleHooks.add('impact.base.sound', () => {
  function loadAudio<
    Ret,
    Args extends [string, ...unknown[]],
    This extends { parent(this: This, ...args: Args): Ret },
  >(this: This, ...args: Args): Ret {
    let path = args[0];

    let resolvedPath = path;
    let lastDotIndex = resolvedPath.lastIndexOf('.');
    if (lastDotIndex >= 0) {
      resolvedPath = resolvedPath.slice(0, lastDotIndex);
    }
    resolvedPath += `.${ig.soundManager.format.ext}`;
    resolvedPath = applyImpactFileForwarding(resolvedPath);
    let resolvedURL = resources.resolvePathToURL(resolvedPath);

    let originalGetFilePath = ig.getFilePath;
    try {
      ig.getFilePath = (_path) => resolvedURL;
      return this.parent(...args);
    } finally {
      ig.getFilePath = originalGetFilePath;
    }
  }

  ig.SoundManager.inject({
    loadWebAudio: loadAudio,
    load: loadAudio,
  });
});

function applyImpactFileForwarding(path: string): string {
  let table = ig.fileForwarding;
  let tableKey = `${ig.root}${path}`;
  if (utils.hasKey(table, tableKey)) {
    path = table[tableKey];
    path = path.slice(ig.root.length);
  }
  return path;
}
