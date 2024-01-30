import * as resources from '@ccloader3/common/resources';
import semver from '@ccloader3/common/vendor-libs/semver';
import * as files from './files';
import { ChangelogFileData } from 'ultimate-crosscode-typedefs/file-types/changelog';
import { Config } from './config';
import * as paths from '@ccloader3/common/paths';
import * as utils from '@ccloader3/common/utils';

export const KNOWN_EXTENSION_IDS: ReadonlySet<string> = new Set([
  'fish-gear',
  'flying-hedgehag',
  'manlea',
  'ninja-skin',
  'post-game',
  'scorpion-robo',
  'snowman-tank',
]);

export async function loadVersion(
  config: Config,
): Promise<{ version: semver.SemVer; hotfix: number }> {
  let changelogText = await files.loadText(
    paths.jailRelative(paths.join(config.gameAssetsDir, 'data/changelog.json')),
  );
  let { changelog } = JSON.parse(changelogText) as ChangelogFileData;
  let latestEntry = changelog[0];

  let version = new semver.SemVer(latestEntry.version);

  let hotfix = 0;
  let changes = [];
  if (latestEntry.changes != null) changes.push(...latestEntry.changes);
  if (latestEntry.fixes != null) changes.push(...latestEntry.fixes);
  for (let change of changes) {
    let match = /^\W*HOTFIX\((\d+)\)/i.exec(change);
    if (match != null && match.length === 2) {
      hotfix = Math.max(hotfix, parseInt(match[1], 10));
    }
  }

  return { version, hotfix };
}

export async function buildNecessaryDOM(config: Config): Promise<void> {
  document.head.appendChild(
    utils.html('base', {
      attrs: {
        href: utils.cwdFilePathToURL(paths.join(config.gameAssetsDir, '/'), window.location.origin)
          .href,
      },
    }),
  );

  // meta tags have been removed, they appear to not affect anything

  document.body.appendChild(
    utils.html('div', {
      id: 'game',
      children: [
        utils.html('canvas', {
          id: 'canvas',
        }),
      ],
    }),
  );

  // By default the game's HTML page also contains a div element for the "option
  // list" described above, but it is useless as described above, so I removed
  // it. Fortunately jQuery functions don't complain when I remove it because
  // they operate on arrays of elements and handle empty arrays perfectly well.

  // The last inline script has been removed because:
  //  a) it contains an `uncaughtException` handler that silently hides all
  //     errors. Possibly a bug, though it is unlikely that it will be fixed soon
  //     if at all;
  //  b) responsibility of `doStartCrossCodePlz` is handled by the modloader
  //     itself.

  document.body.style.overflow = 'hidden';

  Object.assign(window, config.impactConfig);

  await config.onGameDOMCreated();

  await Promise.all([
    ...config.stylesheetURLs.map((url) => resources.loadStylesheet(url)),
    ...config.scriptURLs.map((url) =>
      // async is turned off so that these scripts are loaded in the order of
      // addition
      resources.loadScript(url, { async: false }),
    ),
  ]);
}

export async function loadMainScript(
  config: Config,
  eventReceiver: { onImpactInit(): void },
): Promise<() => void> {
  let domReadyCallback: () => void = null!;
  callOnImpactInit(() => {
    domReadyCallback = ig._DOMReady;
    ig._DOMReady = () => {};
    eventReceiver.onImpactInit();
  });

  // async is turned off so that the main script blocks the UI thread while it
  // is being executed
  await resources.loadScript(config.gameScriptURL, { async: false });

  if (!(domReadyCallback != null)) {
    throw new Error('Assertion failed: domReadyCallback != null');
  }

  return domReadyCallback;
}

function callOnImpactInit(callback: () => void): void {
  Object.defineProperty(window, 'ig', {
    configurable: true,
    enumerable: true,

    get() {
      // eslint-disable-next-line no-undefined
      return undefined;
    },

    set(value: typeof ig) {
      // This deletion is needed in order to force a reset of the property
      // descriptor of `window.ig`. Not sure if it can be handled more cleanly.
      delete (window as { ig?: typeof ig }).ig;
      window.ig = value;
      callback();
    },
  });
}

export function getStartFunction(): Promise<() => void> {
  return new Promise((resolve) => {
    // TODO: this replicates the behavior from the original HTML page, I hope we
    // can find a better solution to catch `window.startCrossCode` immediately.
    // Note that most of the time the `setTimeout` won't be fired since at this
    // time `startCrossCode` is most likely available because of the delays
    // caused by mods and event loop ticks caused by usages of promises in the
    // modloader.
    (function waitForStartFunction() {
      if (typeof window.startCrossCode === 'function') {
        resolve(window.startCrossCode);
      } else {
        console.log('waiting for startCrossCode()...');
        setTimeout(waitForStartFunction, 100);
      }
    })();
  });
}

export function getDelegateActivationFunction(): Promise<() => void> {
  return new Promise((resolve) => {
    if (ig.system.delegate == null) {
      let realSetDelegate = ig.system.setDelegate;
      ig.system.setDelegate = function (...args) {
        ig.system.setDelegate = realSetDelegate;
        resolve(() => realSetDelegate.apply(this, args));
      };
    } else {
      resolve(() => {});
    }
  });
}
