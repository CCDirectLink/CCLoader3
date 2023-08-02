import * as utils from '../../common/dist/utils.js';
import stripJsonComments from '../../common/vendor-libs/strip-json-comments.js';

import { loadScript, loadStylesheet } from '../../common/dist/resources.js';

export async function loadText(url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.text();
  } catch (err) {
    if (utils.errorHasMessage(err)) {
      err.message = `Failed to load text file '${url}': ${err.message}`;
    }
    throw err;
  }
}

export async function loadJSON<T = unknown>(url: string): Promise<T> {
  let text = await loadText(url);
  try {
    return JSON.parse(stripJsonComments(text));
  } catch (err) {
    if (utils.errorHasMessage(err)) {
      err.message = `Failed to parse JSON file '${url}': ${err.message}`;
    }
    throw err;
  }
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    let img = new Image();
    img.src = url;
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image '${url}'`));
  });
}

export const namespace: typeof ccmod.resources.plain = {
  loadText,
  loadJSON,
  loadImage,
  loadScript,
  loadStylesheet,
};
