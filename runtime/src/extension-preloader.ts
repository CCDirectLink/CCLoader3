// Fixes files from extensions potentially not being loaded during the game's loading
// Author: https://github.com/EL20202
// https://github.com/EL20202/crosscode-extension-asset-preloader/blob/master/postload.js

import { join } from "path";
import { existsSync, readFileSync, readdirSync } from "fs";

const extensionFolder = "assets/extension";

let folders = readdirSync(extensionFolder);

for (const extensionName of folders) {
  const filepath = join(extensionFolder, extensionName);
  if (existsSync(`${filepath}/${extensionName}.json`)) {
    let data = JSON.parse(readFileSync(`${filepath}/${extensionName}.json`, { encoding: "utf-8" }));

    if (!data.files) break;

    for (let extFile of data.files) {
      ig.fileForwarding[extFile] = `extension/${extensionName}/${extFile}`;
    }
  }
}
