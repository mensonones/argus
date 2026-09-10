import { DatabaseSync } from "node:sqlite";
const RETRY_LIMIT_MS = numberEnv("ARGUS_SQLITE_RETRY_MS", 15_000);
const SQLITE_BUSY_TIMEOUT_MS = Math.min(RETRY_LIMIT_MS, 2_500);
/**
 * Small resilience layer around node:sqlite. WAL permits concurrent readers;
 * busy_timeout plus bounded retry handles short write collisions between
 * reviewer processes without introducing an external lock-file protocol.
 */
export class ResilientDatabase {
    inner;
    constructor(filename) {
        this.inner = new DatabaseSync(filename);
        retryBusy(() => this.inner.exec(`PRAGMA busy_timeout=${SQLITE_BUSY_TIMEOUT_MS}`));
        retryBusy(() => this.inner.exec("PRAGMA journal_mode=WAL"));
        retryBusy(() => this.inner.exec("PRAGMA foreign_keys=ON"));
    }
    prepare(sql) {
        return new ResilientStatement(this.inner.prepare(sql));
    }
    exec(sql) {
        retryBusy(() => this.inner.exec(sql));
    }
    transaction(operation) {
        this.exec("BEGIN IMMEDIATE");
        try {
            const value = operation();
            this.exec("COMMIT");
            return value;
        }
        catch (error) {
            try {
                this.exec("ROLLBACK");
            }
            catch {
                // Preserve the original failure.
            }
            throw error;
        }
    }
    close() {
        this.inner.close();
    }
}
export class ResilientStatement {
    inner;
    constructor(inner) {
        this.inner = inner;
    }
    run(...params) {
        return retryBusy(() => this.inner.run(...params));
    }
    get(...params) {
        return retryBusy(() => this.inner.get(...params));
    }
    all(...params) {
        return retryBusy(() => this.inner.all(...params));
    }
}
function retryBusy(operation) {
    const started = Date.now();
    let delay = 20;
    while (true) {
        try {
            return operation();
        }
        catch (error) {
            if (!isBusy(error) || Date.now() - started >= RETRY_LIMIT_MS)
                throw error;
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay);
            delay = Math.min(250, Math.ceil(delay * 1.6));
        }
    }
}
function isBusy(error) {
    const candidate = error;
    const code = String(candidate?.code ?? "");
    const message = String(candidate?.message ?? "").toLowerCase();
    return code === "SQLITE_BUSY" || code === "SQLITE_LOCKED" ||
        message.includes("database is locked") || message.includes("database is busy");
}
function numberEnv(name, fallback) {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
}
