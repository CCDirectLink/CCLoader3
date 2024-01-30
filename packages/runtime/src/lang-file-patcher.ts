// This module fixes a common problem with adding new strings to so-called Lang
// Files (files in the directory `data/lang/`). You see, under normal circumstances
// when using Lang Labels (in, e.g. map files) the `en_US` locale is considered
// the default, so when the Label doesn't contain a value for the current locale
// the one for `en_US` will be loaded as a fallback. This allows a mod author to
// not duplicate text for untranslated locales and acts as a future-proofing
// measure in case more locales are added to the base game (this has happened at
// least once: `zh_TW` was added in 1.3.0).
//
// Unfortunately there is no fallback feature for Lang Files. Lang Files for all
// locales in the base game have the same structure and contain the exact same
// number of strings, **only the Lang Files of the current locale are loaded**.
// This means that patching the `en_US` files doesn't provide a fallback for
// other locales. And to be honest, this is a pretty convenient use for old-school
// "object merging" patches: Lang Files are largely comprised of dictionaries
// and most of the time only adding stuff is necessary, not changing or deleting
// existing contents. In the past the only future-proof way to accomplish this
// was by adding values to the `ig.lang.labels` object either in `poststart` or
// by injecting code into the `ig.Lang` constructor.
//
// This method was abused in Simplify/CCLoader2 and some other mods. It had three
// problems though:
//
// 1. It allowed adding translations only for a single locale. Of course, you
//    can use objects of "language to text" pairs (essentially Lang Labels) and
//    select the correct translation based on `ig.currentLang`, but that would
//    be a partial reimplementation of Lang Files. Of course, nobody really
//    cared about this point though, since the modding community is largely
//    international and the lingua franca was English.
//
// 2. It relied either on `poststart` or `ig.Lang` injections, both of which are
//    problematic. `poststart` (or `main` as it was previously called) has been
//    frowned upon by the modloader developers, CCInjector didn't have it at all
//    for example. And numerous injections into a method or constructor of a
//    single class can make debugging of the said code unpleasant due to a deep
//    call stack, though this isn't a major issue.
//
// 3. Most notably, the added values were inaccessible in Localize Me
//    (<https://github.com/L-Sherry/Localize-me>), and so it was difficult to
//    localize strings injected into Lang Files from translation mods. Now that
//    I mention Localize Me, it should also be said that modded locales don't
//    suffer from this "fallback" problem: Localize Me by design will simply
//    skip untranslated strings or, more precisely, run them through `missing_cb`,
//    but the values will still be readable from `ig.lang.labels` in the game
//    nevertheless.
//
// And so, the chosen solution was to load Lang Files of the built-in locales
// and merge them over `en_US` ones, thus effectively making `en_US` values the
// fallback ones. This makes the fix future-proof, allows convenient patching
// with object merging as described above and, most importantly, allows seamless
// localization of modded strings inserted into Lang Files. Lang Files of Modded
// locales aren't touched because they don't really exist in the first place:
// Localize Me rewrites the URL to point to a built-in File and applies
// translation packs afterwards - so the merge would have been performed twice.
//
// NOTE: Mods can't rely on the fallback values being available when patches are
// applied.  See below for an explanation.

import * as impactModuleHooks from './impact-module-hooks';
import * as resources from './resources';

// Ideally this code has to run as early as possible, so that an accurate list of
// built-in locales can be obtained. In practice "as early as possible" means
// "before Localize Me or any other mod which adds entries to `ig.LANG_DETAILS`".
impactModuleHooks.add('game.config', () => {
  // `ig.SUPPORTED_LANG` is another possible source of locales, but it appears
  // to be unused in the game code, so it is possible for developers to simply
  // forget to update it.  On the other hand, it may be used in their editors.
  const BUILTIN_LOCALES = Object.keys(ig.LANG_DETAILS);
  const DEFAULT_LOCALE = 'en_US';

  // See `ig.Lang#loadInternal` in the game code
  function getLangFilePath(feature: string, locale: string): string {
    return feature.toPath('data/lang/', `.${locale}.json`);
  }

  ig.Lang.inject({
    // There isn't really a future-proof way to know the values in `ig.langFileList`
    // during `postload`, plus mods could add something to this array during
    // `prestart`, so instead this module's patchers are inserted just before
    // the usage site of `ig.langFileList`, which is `ig.Lang#loadInternal`.
    // This unfortunately means that we can't make any guarantees about the
    // execution time of the registered patchers, though in practice they will
    // be executed very late sometime after `startCrossCode`.
    loadInternal(...args) {
      for (let locale of BUILTIN_LOCALES) {
        if (locale === DEFAULT_LOCALE) continue;

        for (let feature of ig.langFileList) {
          resources.jsonPatches.add(getLangFilePath(feature, locale), {
            dependencies: () => resources.loadJSON(getLangFilePath(feature, DEFAULT_LOCALE)),
            patcher: (data, defaultLocaleData) =>
              ig.merge(/* original */ defaultLocaleData, /* new */ data, /* noArrayMerge */ true),
          });
        }
      }

      return this.parent(...args);
    },
  });
});
