import * as utils from './utils';

const nodejsUtil = window.require?.('util') as typeof import('util');

export enum LogLevel {
  LOG = 2,
  WARN = 1,
  ERROR = 0,
}

export type LogLevelName = keyof typeof LogLevel;
export type LogLevelsDict<T = boolean> = Record<LogLevelName, T>;

export const LOG_LEVEL_NAMES: readonly LogLevelName[] = ['LOG', 'WARN', 'ERROR'];

export const DEFAULT_LOG_LEVELS: LogLevelsDict = {
  LOG: false,
  WARN: true,
  ERROR: true,
};

function logLevelsToBitFlags(levels: LogLevelsDict): number {
  let flags = 0;
  for (let level of LOG_LEVEL_NAMES) {
    let enabled = levels[level];
    flags |= Number(enabled) << LogLevel[level];
  }
  return flags;
}

function logLevelsFromBitFlags(flags: number): LogLevelsDict {
  let levels = {} as LogLevelsDict;
  for (let level of LOG_LEVEL_NAMES) {
    let bit = LogLevel[level];
    levels[level] = Boolean(flags & (1 << bit));
  }
  return levels;
}

function getLogLevels(): LogLevelsDict {
  let flagsStr = localStorage.getItem('logFlags');
  if (flagsStr != null) {
    let flags = parseInt(flagsStr, 10);
    if (Number.isSafeInteger(flags)) {
      return logLevelsFromBitFlags(flags);
    }
  }
  return { ...DEFAULT_LOG_LEVELS };
}

export function setLogLevels(levels: LogLevelsDict): void {
  localStorage.setItem('logFlags', String(logLevelsToBitFlags(levels)));
}

const EVENTS_BLOCKED_BY_CONSOLE = [
  'mousewheel',
  'contextmenu',
  'mousedown',
  'mouseup',
  'mousemove',
  'touchstart',
  'touchend',
  'touchmove',
  'keydown',
  'keyup',
  'keypress',
] as const;

const LOG_LEVEL_APPEARENCE_DURATIONS: LogLevelsDict<number> = {
  LOG: 2000,
  WARN: 5000,
  ERROR: 15000,
};

let rootElement: HTMLElement;

export function inject(): void {
  let logLevels = getLogLevels();

  rootElement = utils.html('div', {
    id: 'ccloader-console',
    class: ['ccloader-overlay', 'ccloader-vbox', 'ccloader-vscroll'],
  });

  for (let eventType of EVENTS_BLOCKED_BY_CONSOLE) {
    rootElement.addEventListener(eventType, (event) => event.stopPropagation());
  }

  document.body.append(rootElement);

  function hookConsoleMethod(name: 'error' | 'warn' | 'log' | 'info', level: LogLevel): void {
    let old = console[name] as (...message: unknown[]) => void;
    console[name] = function (...message: unknown[]): void {
      let result = old.apply(this, message);
      log(level, ...message);
      return result;
    };
  }

  if (logLevels.ERROR) {
    hookConsoleMethod('error', LogLevel.ERROR);
  }
  if (logLevels.WARN) {
    hookConsoleMethod('warn', LogLevel.WARN);
  }
  if (logLevels.LOG) {
    hookConsoleMethod('log', LogLevel.LOG);
    hookConsoleMethod('info', LogLevel.LOG);
  }
}

function log(level: LogLevel, ...message: unknown[]): void {
  let levelName = LogLevel[level] as LogLevelName;

  let el = utils.html('div', {
    class: ['ccloader-message', `ccloader-${levelName}`],
    children: [`[${LogLevel[level]}] ${formatMessage(...message)}`],
  });

  rootElement.append(el);

  let removeTimeout = setTimeout(() => {
    el.remove();
  }, LOG_LEVEL_APPEARENCE_DURATIONS[levelName]);

  el.addEventListener('click', (event) => {
    event.stopPropagation();
    event.preventDefault();
    el.remove();
    clearTimeout(removeTimeout);
  });

  rootElement.scrollTo(0, rootElement.scrollHeight);
}

function formatMessage(...message: unknown[]): string {
  if (nodejsUtil != null) {
    let formatFn = nodejsUtil.format as (...args: unknown[]) => string;
    return formatFn(...message);
  } else {
    return message.map((m) => String(m)).join(' ');
  }
}
