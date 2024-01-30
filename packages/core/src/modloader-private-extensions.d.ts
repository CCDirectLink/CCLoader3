export {};

declare global {
  namespace modloader {
    var _runtimeMod: Mod;
  }

  var CrossAndroid: { executePostGameLoad(): void };
  var CrossAndroidModListProvider: { getModListAsJson(): string };
  var CrossAndroidExtensionListProvider: { getExtensionListAsJson(): string };
}
