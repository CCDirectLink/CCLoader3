import * as filesDesktop from './files.desktop';
import * as filesBrowser from './files.browser';
import * as filesAndroid from './files.android';
import * as utils from '@ccloader3/common/utils';

export const { loadText, isReadable, getModDirectoriesIn, getInstalledExtensions } = {
  [utils.PlatformType.DESKTOP]: filesDesktop,
  [utils.PlatformType.ANDROID]: filesAndroid,
  [utils.PlatformType.BROWSER]: filesBrowser,
}[utils.PLATFORM_TYPE];
