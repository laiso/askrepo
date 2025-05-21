// シンプルなロガーモジュール
let isVerbose = false;

export function initLogger(verbose: boolean) {
  isVerbose = verbose;
}

export function log(...args: unknown[]) {
  if (isVerbose) {
    console.log('[VERBOSE]', ...args);
  }
}
