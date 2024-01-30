// This module is based on the work done by EL20202 in his extension asset preloader mod:
// https://github.com/EL20202/crosscode-extension-asset-preloader/blob/master/postload.js
// Fixes files from extensions potentially not being loaded during the game's loading

import * as files from '@ccloader3/core/files';
import { getInstalledExtensions } from '@ccloader3/core/files';
import * as paths from '@ccloader3/common/paths';
import * as configM from '@ccloader3/core/config';

declare global {
  namespace modloader {
    const config: configM.Config;
  }
}

const extensionFolder = paths.join(modloader.config.gameAssetsDir, 'extension');
const exts = await getInstalledExtensions(modloader.config);
for (const extensionName of exts) {
  const filepath = paths.join(extensionFolder, extensionName);
  const isReadable = await files.isReadable(`${filepath}/${extensionName}.json`);
  if (isReadable) {
    const text = await files.loadText(`${filepath}/${extensionName}.json`);
    const data = JSON.parse(text);

    if (!data.files) break;

    for (const extFile of data.files) {
      ig.fileForwarding[extFile] = `extension/${extensionName}/${extFile}`;
    }
  }
}
