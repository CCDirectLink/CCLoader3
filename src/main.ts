import * as modloader from './modloader.js';
import * as utils from '../common/dist/utils.js';

async function main(): Promise<void> {
  let onloadPromise = new Promise<void>((resolve) => {
    window.addEventListener('load', () => resolve());
  });

  if (typeof process !== 'undefined') {
    let { env } = process;

    if (env.CCLOADER_OPEN_DEVTOOLS != null) {
      delete env.CCLOADER_OPEN_DEVTOOLS;
      let win = nw.Window.get();
      await utils.showDevTools();
      win.focus();
      await utils.wait(500);
    }

    let urlOverride = env.CCLOADER_OVERRIDE_MAIN_URL;
    if (urlOverride != null) {
      delete env.CCLOADER_OVERRIDE_MAIN_URL;
      window.location.replace(urlOverride);
      return;
    }
  }

  await onloadPromise;
  await modloader.boot();
}

main().catch((err) => {
  console.error(err);
});
