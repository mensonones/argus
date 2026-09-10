/** Tiny zero-dependency ANSI colour + logging helper. */

const useColor =
  process.stdout.isTTY && process.env.NO_COLOR === undefined;

function wrap(code: number, s: string): string {
  return useColor ? `\x1b[${code}m${s}\x1b[0m` : s;
}

export const color = {
  bold: (s: string) => wrap(1, s),
  dim: (s: string) => wrap(2, s),
  red: (s: string) => wrap(31, s),
  green: (s: string) => wrap(32, s),
  yellow: (s: string) => wrap(33, s),
  blue: (s: string) => wrap(34, s),
  magenta: (s: string) => wrap(35, s),
  cyan: (s: string) => wrap(36, s),
  gray: (s: string) => wrap(90, s),
};

let verbose = false;

export function setVerbose(v: boolean): void {
  verbose = v;
}

/** Progress / status lines go to stderr so stdout stays clean for reports. */
export const log = {
  info(msg: string): void {
    process.stderr.write(msg + "\n");
  },
  step(msg: string): void {
    process.stderr.write(color.cyan("› ") + msg + "\n");
  },
  warn(msg: string): void {
    process.stderr.write(color.yellow("! ") + msg + "\n");
  },
  error(msg: string): void {
    process.stderr.write(color.red("✗ ") + msg + "\n");
  },
  debug(msg: string): void {
    if (verbose) process.stderr.write(color.gray("  " + msg) + "\n");
  },
};
