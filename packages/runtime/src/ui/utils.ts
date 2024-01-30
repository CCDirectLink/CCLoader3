import { LocalizedString } from 'ultimate-crosscode-typedefs/file-types/mod-manifest';

export * from '@ccloader3/common/utils';

export function getLocalizedString(
  str: LocalizedString | null | undefined,
): string | null | undefined {
  if (str == null || typeof str === 'string') return str;
  return str[ig.currentLang] ?? str.en_US;
}

export function getModTitle(mod: modloader.Mod): string {
  return getLocalizedString(mod.manifest.title) ?? mod.id;
}

export function addEnumMember<N extends string>(enumObj: { [k in N]: number }, name: N): number {
  let number = Object.keys(enumObj).length;
  enumObj[name] = number;
  return number;
}
