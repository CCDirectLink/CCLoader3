// Unfortunate yet required hack for the missing typedefs of vendored libraries.
// The way this was done before was by placing a `lib.d.ts` next to the
// corresponding `lib.js`.
// However, vendored libraries have to be `.ts` files now due to ESBuild reading
// an import to `lib.js` as `lib.js.ts` due to disabling file extensions.

declare module '@ccloader3/common/vendor-libs/semver' {
  import * as semver from 'ultimate-crosscode-typedefs/semver-ext';
  export default semver;
}

declare module '@ccloader3/common/vendor-libs/jszip' {
  import * as JSZip from 'jszip/index';
  export default JSZip;
}

declare module '@ccloader3/common/vendor-libs/strip-json-comments' {
  import stripJsonComments from 'strip-json-comments/index';
  export default stripJsonComments;
}
