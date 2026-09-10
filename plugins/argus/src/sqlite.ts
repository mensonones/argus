import { DatabaseSync, StatementSync, type SQLInputValue } from "node:sqlite";

const RETRY_LIMIT_MS = numberEnv("ARGUS_SQLITE_RETRY_MS", 15_000);
const SQLITE_BUSY_TIMEOUT_MS = Math.min(RETRY_LIMIT_MS, 2_500);

/**
 * Small resilience layer around node:sqlite. WAL permits concurrent readers;
 * busy_timeout plus bounded retry handles short write collisions between
 * reviewer processes without introducing an external lock-file protocol.
 */
export class ResilientDatabase {
  private readonly inner: DatabaseSync;

  constructor(filename: string) {
    this.inner = new DatabaseSync(filename);
    retryBusy(() => this.inner.exec(`PRAGMA busy_timeout=${SQLITE_BUSY_TIMEOUT_MS}`));
    retryBusy(() => this.inner.exec("PRAGMA journal_mode=WAL"));
    retryBusy(() => this.inner.exec("PRAGMA foreign_keys=ON"));
  }

  prepare(sql: string): ResilientStatement {
    return new ResilientStatement(this.inner.prepare(sql));
  }

  exec(sql: string): void {
    retryBusy(() => this.inner.exec(sql));
  }

  transaction<T>(operation: () => T): T {
    this.exec("BEGIN IMMEDIATE");
    try {
      const value = operation();
      this.exec("COMMIT");
      return value;
    } catch (error) {
      try {
        this.exec("ROLLBACK");
      } catch {
        // Preserve the original failure.
      }
      throw error;
    }
  }

  close(): void {
    this.inner.close();
  }
}

export class ResilientStatement {
  constructor(private readonly inner: StatementSync) {}

  run(...params: SQLInputValue[]): ReturnType<StatementSync["run"]> {
    return retryBusy(() => this.inner.run(...params));
  }

  get(...params: SQLInputValue[]): unknown {
    return retryBusy(() => this.inner.get(...params));
  }

  all(...params: SQLInputValue[]): unknown[] {
    return retryBusy(() => this.inner.all(...params));
  }
}

function retryBusy<T>(operation: () => T): T {
  const started = Date.now();
  let delay = 20;
  while (true) {
    try {
      return operation();
    } catch (error) {
      if (!isBusy(error) || Date.now() - started >= RETRY_LIMIT_MS) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay);
      delay = Math.min(250, Math.ceil(delay * 1.6));
    }
  }
}

function isBusy(error: unknown): boolean {
  const candidate = error as { code?: unknown; message?: unknown };
  const code = String(candidate?.code ?? "");
  const message = String(candidate?.message ?? "").toLowerCase();
  return code === "SQLITE_BUSY" || code === "SQLITE_LOCKED" ||
    message.includes("database is locked") || message.includes("database is busy");
}

function numberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
