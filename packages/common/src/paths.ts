// POSIX-only implementation of the `path` module, ported from
// https://github.com/nodejs/node/blob/680fb8fc62f6c17160b3727ba7400ce28f8d22d5/lib/path.js
// with small stylistic adjustements.

const CHAR_DOT: number = '.'.charCodeAt(0);
const CHAR_FORWARD_SLASH: number = '/'.charCodeAt(0);

function validateString(value: unknown, name: string): void {
  if (typeof value !== 'string') {
    throw new TypeError(`expected ${name} to be a string`);
  }
}

// Resolves . and .. elements in a path with directory names
function normalizeString(path: string, allowAboveRoot: boolean): string {
  let res = '';
  let lastSegmentLength = 0;
  let lastSlash = -1;
  let dots = 0;
  let code = 0;
  for (let i = 0; i <= path.length; i++) {
    if (i < path.length) code = path.charCodeAt(i);
    else if (code === CHAR_FORWARD_SLASH) break;
    else code = CHAR_FORWARD_SLASH;

    if (code === CHAR_FORWARD_SLASH) {
      if (lastSlash === i - 1 || dots === 1) {
        // NOOP
      } else if (dots === 2) {
        if (
          res.length < 2 ||
          lastSegmentLength !== 2 ||
          res.charCodeAt(res.length - 1) !== CHAR_DOT ||
          res.charCodeAt(res.length - 2) !== CHAR_DOT
        ) {
          if (res.length > 2) {
            let lastSlashIndex = res.lastIndexOf('/');
            if (lastSlashIndex === -1) {
              res = '';
              lastSegmentLength = 0;
            } else {
              res = res.slice(0, lastSlashIndex);
              lastSegmentLength = res.length - 1 - res.lastIndexOf('/');
            }
            lastSlash = i;
            dots = 0;
            continue;
          } else if (res.length !== 0) {
            res = '';
            lastSegmentLength = 0;
            lastSlash = i;
            dots = 0;
            continue;
          }
        }
        if (allowAboveRoot) {
          res += res.length > 0 ? `/..` : '..';
          lastSegmentLength = 2;
        }
      } else {
        if (res.length > 0) res += `/${path.slice(lastSlash + 1, i)}`;
        else res = path.slice(lastSlash + 1, i);
        lastSegmentLength = i - lastSlash - 1;
      }
      lastSlash = i;
      dots = 0;
    } else if (code === CHAR_DOT && dots !== -1) {
      dots++;
    } else {
      dots = -1;
    }
  }
  return res;
}

export function resolve(...args: string[]): string {
  let resolvedPath = '';
  let resolvedAbsolute = false;

  for (let i = args.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    let path = i >= 0 ? args[i] : process.cwd();

    validateString(path, 'path');

    // Skip empty entries
    if (path.length === 0) continue;

    resolvedPath = `${path}/${resolvedPath}`;
    resolvedAbsolute = path.charCodeAt(0) === CHAR_FORWARD_SLASH;
  }

  // At this point the path should be resolved to a full absolute path, but
  // handle relative paths to be safe (might happen when process.cwd() fails)

  // Normalize the path
  resolvedPath = normalizeString(resolvedPath, !resolvedAbsolute);

  if (resolvedAbsolute) return `/${resolvedPath}`;

  return resolvedPath.length > 0 ? resolvedPath : '.';
}

export function normalize(path: string): string {
  validateString(path, 'path');

  if (path.length === 0) return '.';

  let hasRoot = path.charCodeAt(0) === CHAR_FORWARD_SLASH;
  let trailingSeparator = path.charCodeAt(path.length - 1) === CHAR_FORWARD_SLASH;

  // Normalize the path
  path = normalizeString(path, !hasRoot);

  if (path.length === 0) {
    if (hasRoot) return '/';
    return trailingSeparator ? './' : '.';
  }
  if (trailingSeparator) path += '/';

  return hasRoot ? `/${path}` : path;
}

// equivalent to stripRoot(join('/', path))
export function jailRelative(path: string): string {
  validateString(path, 'path');

  if (path.length === 0) return '.';

  let trailingSeparator = path.charCodeAt(path.length - 1) === CHAR_FORWARD_SLASH;

  path = normalizeString(path, false);

  if (path.length === 0) path = '.';
  if (trailingSeparator) path += '/';
  return path;
}

export function isAbsolute(path: string): boolean {
  validateString(path, 'path');
  return path.length > 0 && path.charCodeAt(0) === CHAR_FORWARD_SLASH;
}

// equivalent to relative('/', path)
export function stripRoot(path: string): string {
  validateString(path, 'path');
  while (path.length > 0 && path.charCodeAt(0) === CHAR_FORWARD_SLASH) {
    path = path.slice(1);
  }
  return path;
}

export function join(...args: string[]): string {
  if (args.length === 0) return '.';
  let joined: string | null = null;
  for (let i = 0; i < args.length; i++) {
    let arg = args[i];
    validateString(arg, 'path');
    if (arg.length > 0) {
      if (joined == null) joined = arg;
      else joined += `/${arg}`;
    }
  }
  if (joined == null) return '.';
  return normalize(joined);
}

export function relative(from: string, to: string): string {
  validateString(from, 'from');
  validateString(to, 'to');

  if (from === to) return '';

  // Trim leading forward slashes.
  from = resolve(from);
  to = resolve(to);

  if (from === to) return '';

  let fromStart = 1;
  let fromEnd = from.length;
  let fromLen = fromEnd - fromStart;
  let toStart = 1;
  let toLen = to.length - toStart;

  // Compare paths to find the longest common path from root
  let length = fromLen < toLen ? fromLen : toLen;
  let lastCommonSep = -1;
  let i = 0;
  for (; i < length; i++) {
    let fromCode = from.charCodeAt(fromStart + i);
    if (fromCode !== to.charCodeAt(toStart + i)) break;
    else if (fromCode === CHAR_FORWARD_SLASH) lastCommonSep = i;
  }
  if (i === length) {
    if (toLen > length) {
      if (to.charCodeAt(toStart + i) === CHAR_FORWARD_SLASH) {
        // We get here if `from` is the exact base path for `to`.
        // For example: from='/foo/bar'; to='/foo/bar/baz'
        return to.slice(toStart + i + 1);
      }
      if (i === 0) {
        // We get here if `from` is the root
        // For example: from='/'; to='/foo'
        return to.slice(toStart + i);
      }
    } else if (fromLen > length) {
      if (from.charCodeAt(fromStart + i) === CHAR_FORWARD_SLASH) {
        // We get here if `to` is the exact base path for `from`.
        // For example: from='/foo/bar/baz'; to='/foo/bar'
        lastCommonSep = i;
      } else if (i === 0) {
        // We get here if `to` is the root.
        // For example: from='/foo/bar'; to='/'
        lastCommonSep = 0;
      }
    }
  }

  let out = '';
  // Generate the relative path based on the path difference between `to`
  // and `from`.
  for (i = fromStart + lastCommonSep + 1; i <= fromEnd; i++) {
    if (i === fromEnd || from.charCodeAt(i) === CHAR_FORWARD_SLASH) {
      out += out.length === 0 ? '..' : '/..';
    }
  }

  // Lastly, append the rest of the destination (`to`) path that comes after
  // the common path parts.
  return `${out}${to.slice(toStart + lastCommonSep)}`;
}

export function dirname(path: string): string {
  validateString(path, 'path');
  if (path.length === 0) return '.';
  let hasRoot = path.charCodeAt(0) === CHAR_FORWARD_SLASH;
  let end = -1;
  let matchedSlash = true;
  for (let i = path.length - 1; i >= 1; --i) {
    if (path.charCodeAt(i) === CHAR_FORWARD_SLASH) {
      if (!matchedSlash) {
        end = i;
        break;
      }
    } else {
      // We saw the first non-path separator
      matchedSlash = false;
    }
  }

  if (end === -1) return hasRoot ? '/' : '.';
  if (hasRoot && end === 1) return '//';
  return path.slice(0, end);
}

export function basename(path: string, ext?: string): string {
  if (ext != null) validateString(ext, 'ext');
  validateString(path, 'path');

  let start = 0;
  let end = -1;
  let matchedSlash = true;

  if (ext != null && ext.length > 0 && ext.length <= path.length) {
    if (ext === path) return '';
    let extIdx = ext.length - 1;
    let firstNonSlashEnd = -1;
    for (let i = path.length - 1; i >= 0; --i) {
      let code = path.charCodeAt(i);
      if (code === CHAR_FORWARD_SLASH) {
        // If we reached a path separator that was not part of a set of path
        // separators at the end of the string, stop now
        if (!matchedSlash) {
          start = i + 1;
          break;
        }
      } else {
        if (firstNonSlashEnd === -1) {
          // We saw the first non-path separator, remember this index in case
          // we need it if the extension ends up not matching
          matchedSlash = false;
          firstNonSlashEnd = i + 1;
        }
        if (extIdx >= 0) {
          // Try to match the explicit extension
          if (code === ext.charCodeAt(extIdx)) {
            if (--extIdx === -1) {
              // We matched the extension, so mark this as the end of our path
              // component
              end = i;
            }
          } else {
            // Extension does not match, so our result is the entire path
            // component
            extIdx = -1;
            end = firstNonSlashEnd;
          }
        }
      }
    }

    if (start === end) end = firstNonSlashEnd;
    else if (end === -1) end = path.length;
    return path.slice(start, end);
  }
  for (let i = path.length - 1; i >= 0; --i) {
    if (path.charCodeAt(i) === CHAR_FORWARD_SLASH) {
      // If we reached a path separator that was not part of a set of path
      // separators at the end of the string, stop now
      if (!matchedSlash) {
        start = i + 1;
        break;
      }
    } else if (end === -1) {
      // We saw the first non-path separator, mark this as the end of our
      // path component
      matchedSlash = false;
      end = i + 1;
    }
  }

  if (end === -1) return '';
  return path.slice(start, end);
}

export function extname(path: string): string {
  validateString(path, 'path');
  let startDot = -1;
  let startPart = 0;
  let end = -1;
  let matchedSlash = true;
  // Track the state of characters (if any) we see before our first dot and
  // after any path separator we find
  let preDotState = 0;
  for (let i = path.length - 1; i >= 0; --i) {
    let code = path.charCodeAt(i);
    if (code === CHAR_FORWARD_SLASH) {
      // If we reached a path separator that was not part of a set of path
      // separators at the end of the string, stop now
      if (!matchedSlash) {
        startPart = i + 1;
        break;
      }
      continue;
    }
    if (end === -1) {
      // We saw the first non-path separator, mark this as the end of our
      // extension
      matchedSlash = false;
      end = i + 1;
    }
    if (code === CHAR_DOT) {
      // If this is our first dot, mark it as the start of our extension
      if (startDot === -1) startDot = i;
      else if (preDotState !== 1) preDotState = 1;
    } else if (startDot !== -1) {
      // We saw a non-dot and non-path separator before our dot, so we should
      // have a good chance at having a non-empty extension
      preDotState = -1;
    }
  }

  if (
    startDot === -1 ||
    end === -1 ||
    // We saw a non-dot character immediately before the dot
    preDotState === 0 ||
    // The (right-most) trimmed path component is exactly '..'
    (preDotState === 1 && startDot === end - 1 && startDot === startPart + 1)
  ) {
    return '';
  }
  return path.slice(startDot, end);
}
