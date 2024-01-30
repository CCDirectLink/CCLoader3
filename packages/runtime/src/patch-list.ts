import * as utils from '@ccloader3/common/utils';
import {
  PatchList as PatchListPublic,
  ResourcePatchList as ResourcePatchListPublic,
  ResourcePatcherSimple,
  ResourcePatcherWithDeps,
} from 'ultimate-crosscode-typedefs/modloader-stdlib/patch-list';

export class PatchList<P> implements PatchListPublic<P> {
  public patternPatchers: Array<[RegExp, P]> = [];
  public specificPatchers = new Map<string, P[]>();

  public forPath(path: string): P[] {
    let patchers = [];

    for (let i = 0, len = this.patternPatchers.length; i < len; i++) {
      let [pattern, patcher] = this.patternPatchers[i];
      if (pattern.test(path)) patchers.push(patcher);
    }

    let specificForThisPath = this.specificPatchers.get(path);
    if (specificForThisPath != null) patchers.push(...specificForThisPath);

    return patchers;
  }

  public add(path: string | RegExp, patcher: P): void {
    if (typeof path === 'string') {
      let list = utils.mapGetOrInsert(this.specificPatchers, path, []);
      list.push(patcher);
    } else {
      this.patternPatchers.push([path, patcher]);
    }
  }
}

export class ResourcePatchList<Data, Ctx>
  extends PatchList<ResourcePatcherWithDeps<Data, unknown, Ctx>>
  implements ResourcePatchListPublic<Data, Ctx>
{
  public add<Data2 extends Data = Data, Deps = never>(
    path: string | RegExp,
    patcher: ResourcePatcherSimple<Data2, Deps, Ctx> | ResourcePatcherWithDeps<Data2, Deps, Ctx>,
  ): void {
    if (typeof patcher === 'function') patcher = { patcher };
    super.add(path, patcher as unknown as ResourcePatcherWithDeps<Data, unknown, Ctx>);
  }
}

export const namespace: typeof ccmod.patchList = { PatchList, ResourcePatchList };
