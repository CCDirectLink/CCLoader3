import * as utils from '@ccloader3/common/utils';
import stripJsonComments from '@ccloader3/common/vendor-libs/strip-json-comments';
import { loadScript, loadStylesheet } from '@ccloader3/common/resources';

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
