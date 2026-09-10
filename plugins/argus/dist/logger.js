/** Tiny zero-dependency ANSI colour + logging helper. */
const useColor = process.stdout.isTTY && process.env.NO_COLOR === undefined;
function wrap(code, s) {
    return useColor ? `\x1b[${code}m${s}\x1b[0m` : s;
}
export const color = {
    bold: (s) => wrap(1, s),
    dim: (s) => wrap(2, s),
    red: (s) => wrap(31, s),
    green: (s) => wrap(32, s),
    yellow: (s) => wrap(33, s),
    blue: (s) => wrap(34, s),
    magenta: (s) => wrap(35, s),
    cyan: (s) => wrap(36, s),
    gray: (s) => wrap(90, s),
};
let verbose = false;
export function setVerbose(v) {
    verbose = v;
}
/** Progress / status lines go to stderr so stdout stays clean for reports. */
export const log = {
    info(msg) {
        process.stderr.write(msg + "\n");
    },
    step(msg) {
        process.stderr.write(color.cyan("› ") + msg + "\n");
    },
    warn(msg) {
        process.stderr.write(color.yellow("! ") + msg + "\n");
    },
    error(msg) {
        process.stderr.write(color.red("✗ ") + msg + "\n");
    },
    debug(msg) {
        if (verbose)
            process.stderr.write(color.gray("  " + msg) + "\n");
    },
};
