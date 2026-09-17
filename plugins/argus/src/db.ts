import { createHash, randomUUID } from "node:crypto";
import {
  ensureDir,
  exportsDir,
  globalDbPath,
  globalDir,
  targetDbPath,
  targetDir,
} from "./paths.js";
import { ResilientDatabase } from "./sqlite.js";
import { ARGUS_VERSION, DATABASE_SCHEMA_VERSION } from "./version.js";
import { consolidateReconciled } from "./reconciliation.js";
import { reconciliationSchema } from "./validation.js";
import type {
  Category,
  ChallengeResult,
  ChallengeExecution,
  Confidence,
  Finding,
  EvidencePackage,
  FindingCorrection,
  RootCause,
  FindingContent,
  Severity,
} from "./types.js";

export interface Round {
  id: string;
  baseRef: string;
  status: "active" | "reported" | "abandoned";
  projectSummary: string;
  createdAt: string;
}

export interface StoredFinding extends Finding {
  roundId: string;
  createdAt: string;
}

export interface ReviewerRun {
  roundId: string;
  reviewer: string;
  status: "started" | "completed" | "failed";
  detail?: string;
  updatedAt: string;
}

const CORE_SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS rounds (
  id              TEXT PRIMARY KEY,
  base_ref        TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active',
  project_summary TEXT,
  created_at      TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS findings (
  id                 TEXT PRIMARY KEY,
  round_id           TEXT NOT NULL,
  reviewer           TEXT NOT NULL,
  category           TEXT NOT NULL,
  severity           TEXT NOT NULL,
  confidence         TEXT NOT NULL,
  title              TEXT NOT NULL,
  file               TEXT NOT NULL,
  start_line         INTEGER,
  end_line           INTEGER,
  description        TEXT,
  evidence           TEXT,
  impact             TEXT,
  scenario           TEXT,
  recommendation     TEXT,
  status             TEXT NOT NULL DEFAULT 'candidate',
  challenge_result   TEXT,
  challenge_reasoning TEXT,
  detected_by        TEXT,
  score              REAL,
  created_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_findings_round ON findings(round_id);
CREATE INDEX IF NOT EXISTS idx_findings_status ON findings(status);
CREATE TABLE IF NOT EXISTS reviewer_runs (
  round_id  TEXT NOT NULL,
  reviewer  TEXT NOT NULL,
  status    TEXT NOT NULL,
  detail    TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(round_id, reviewer)
);
`;

const MIGRATIONS = [
  { id: "001-core", sql: CORE_SCHEMA },
  {
    id: "002-baseline-and-suppressions",
    sql: `
      CREATE TABLE IF NOT EXISTS baseline_findings (
        fingerprint  TEXT PRIMARY KEY,
        source       TEXT NOT NULL,
        finding_json TEXT NOT NULL,
        imported_at  TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS suppressions (
        id          TEXT PRIMARY KEY,
        fingerprint TEXT NOT NULL UNIQUE,
        reason      TEXT NOT NULL,
        expires_at  TEXT,
        created_at  TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_baseline_source ON baseline_findings(source);
      CREATE INDEX IF NOT EXISTS idx_suppressions_expiry ON suppressions(expires_at);
    `,
  },
  { id: "003-evidence-packages", sql: "ALTER TABLE findings ADD COLUMN evidence_package TEXT;" },
  { id: "004-challenger-corrections", sql: "ALTER TABLE findings ADD COLUMN review_data TEXT;" },
] as const;

function nowIso(): string {
  return new Date().toISOString();
}

/** Per-target memory database, stored in `<repo>/.argus/memory.sqlite`. */
export class Memory {
  private db: ResilientDatabase;

  private constructor(db: ResilientDatabase) {
    this.db = db;
  }

  static open(repoRoot: string): Memory {
    ensureDir(targetDir(repoRoot));
    ensureDir(exportsDir(repoRoot));
    const db = new ResilientDatabase(targetDbPath(repoRoot));
    migrate(db);
    return new Memory(db);
  }

  close(): void {
    this.db.close();
  }

  setMeta(key: string, value: string): void {
    this.db
      .prepare(
        "INSERT INTO meta(key,value) VALUES(?,?) " +
          "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(key, value);
  }

  getMeta(key: string): string | undefined {
    const row = this.db
      .prepare("SELECT value FROM meta WHERE key=?")
      .get(key) as { value?: string } | undefined;
    return row?.value;
  }

  createRound(baseRef: string, projectSummary: string): Round {
    const id = randomUUID();
    const createdAt = nowIso();
    this.db.transaction(() => {
      this.db.prepare("UPDATE rounds SET status='abandoned' WHERE status='active'").run();
      this.db
        .prepare(
          "INSERT INTO rounds(id,base_ref,status,project_summary,created_at) " +
            "VALUES(?,?,?,?,?)",
        )
        .run(id, baseRef, "active", projectSummary, createdAt);
      this.setMeta("active_round", id);
    });
    return { id, baseRef, status: "active", projectSummary, createdAt };
  }

  activeRound(): Round | undefined {
    const id = this.getMeta("active_round");
    if (!id) return undefined;
    return this.getRound(id);
  }

  getRound(id: string): Round | undefined {
    const row = this.db
      .prepare("SELECT * FROM rounds WHERE id=?")
      .get(id) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      id: row.id as string,
      baseRef: row.base_ref as string,
      status: row.status as Round["status"],
      projectSummary: (row.project_summary as string) ?? "",
      createdAt: row.created_at as string,
    };
  }

  setRoundStatus(id: string, status: Round["status"]): void {
    this.db.prepare("UPDATE rounds SET status=? WHERE id=?").run(status, id);
  }

  recordReviewerRun(
    roundId: string,
    reviewer: string,
    status: ReviewerRun["status"],
    detail?: string,
  ): void {
    this.db.prepare(
      `INSERT INTO reviewer_runs(round_id,reviewer,status,detail,updated_at)
       VALUES(?,?,?,?,?)
       ON CONFLICT(round_id,reviewer) DO UPDATE SET
         status=excluded.status, detail=excluded.detail, updated_at=excluded.updated_at`,
    ).run(roundId, reviewer, status, detail ?? null, nowIso());
  }

  listReviewerRuns(roundId: string): ReviewerRun[] {
    const rows = this.db.prepare(
      "SELECT * FROM reviewer_runs WHERE round_id=? ORDER BY reviewer",
    ).all(roundId) as Record<string, unknown>[];
    return rows.map((row) => ({
      roundId: row.round_id as string,
      reviewer: row.reviewer as string,
      status: row.status as ReviewerRun["status"],
      detail: (row.detail as string) ?? undefined,
      updatedAt: row.updated_at as string,
    }));
  }

  recordFinding(roundId: string, f: Finding): StoredFinding {
    const createdAt = nowIso();
    this.db
      .prepare(
        `INSERT INTO findings(
          id, round_id, reviewer, category, severity, confidence, title, file,
          start_line, end_line, description, evidence, impact, scenario,
          recommendation, status, challenge_result, challenge_reasoning,
          detected_by, score, created_at, evidence_package, review_data
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET
          reviewer=excluded.reviewer, category=excluded.category,
          severity=excluded.severity, confidence=excluded.confidence,
          title=excluded.title, file=excluded.file,
          start_line=excluded.start_line, end_line=excluded.end_line,
          description=excluded.description, evidence=excluded.evidence,
          impact=excluded.impact, scenario=excluded.scenario,
          recommendation=excluded.recommendation, status=excluded.status,
          challenge_result=excluded.challenge_result,
          challenge_reasoning=excluded.challenge_reasoning,
          detected_by=excluded.detected_by, score=excluded.score,
          evidence_package=excluded.evidence_package, review_data=excluded.review_data`,
      )
      .run(
        f.id,
        roundId,
        f.reviewer,
        f.category,
        f.severity,
        f.confidence,
        f.title,
        f.file,
        f.lines?.start ?? null,
        f.lines?.end ?? null,
        f.description,
        JSON.stringify(f.evidence ?? []),
        f.impact,
        f.scenario ?? null,
        f.recommendation ?? null,
        f.status,
        f.challenge?.result ?? null,
        f.challenge?.reasoning ?? null,
        JSON.stringify(f.detectedBy ?? [f.reviewer]),
        f.score ?? null,
        createdAt,
        f.evidencePackage ? JSON.stringify(f.evidencePackage) : null,
        JSON.stringify({rootCause:f.rootCause, rootCauseValidated:f.rootCauseValidated, corrections:f.corrections}),
      );
    return { ...f, roundId, createdAt };
  }

  updateChallenge(
    roundId: string,
    findingId: string,
    result: ChallengeResult,
    reasoning: string,
    evidencePackage?: EvidencePackage,
    correction?: FindingCorrection,
    rootCause?: RootCause,
    execution?: ChallengeExecution,
  ): boolean {
    return this.db.transaction(() => {
      const row = this.db.prepare("SELECT * FROM findings WHERE id=? AND round_id=?")
        .get(findingId, roundId) as Record<string, unknown> | undefined;
      if (!row) return false;
      const original = rowToFinding(row);
      if (correction && original.evidencePackage && !evidencePackage) {
        throw new Error("A correction must replace the existing evidence package to avoid stale claims.");
      }
      let revised = original;
      if (correction) {
        const {title,description,evidence,impact,scenario,recommendation,severity,confidence} = original;
        const content: FindingContent = {title,description,evidence,impact,scenario,recommendation,severity,confidence};
        revised = {...original, ...correction,
          scenario:correction.scenario ?? undefined,
          recommendation:correction.recommendation ?? undefined,
          severity:correction.severity ?? original.severity,
          confidence:correction.confidence ?? original.confidence,
          corrections:[...(original.corrections ?? []), {reason:correction.reason, original:content}]};
      }
      const cause = rootCause ?? original.rootCause;
      const data = {rootCause:cause, rootCauseValidated:!!cause && result !== "REJECTED", corrections:revised.corrections, challengeExecution:execution};
      this.db.prepare(`UPDATE findings SET challenge_result=?, challenge_reasoning=?, status=?,
        evidence_package=COALESCE(?, evidence_package), review_data=?, title=?, description=?,
        evidence=?, impact=?, scenario=?, recommendation=?, severity=?, confidence=?
        WHERE id=? AND round_id=?`).run(result, reasoning,
          result === "REJECTED" ? "rejected" : "confirmed",
          evidencePackage ? JSON.stringify(evidencePackage) : null, JSON.stringify(data),
          revised.title,revised.description,JSON.stringify(revised.evidence),revised.impact,
          revised.scenario ?? null,revised.recommendation ?? null,revised.severity,revised.confidence,
          findingId,roundId);
      return true;
    });
  }

  getFinding(id: string): Finding | undefined {
    const row = this.db
      .prepare("SELECT * FROM findings WHERE id=?")
      .get(id) as Record<string, unknown> | undefined;
    return row ? rowToFinding(row) : undefined;
  }

  listFindings(roundId: string): Finding[] {
    const rows = this.db
      .prepare("SELECT * FROM findings WHERE round_id=? ORDER BY created_at")
      .all(roundId) as Record<string, unknown>[];
    return rows.map(rowToFinding);
  }

  /** Broad text search across all findings ever recorded for this target. */
  searchFindings(query: string, limit = 20): Finding[] {
    const like = `%${query}%`;
    const rows = this.db
      .prepare(
        "SELECT * FROM findings WHERE title LIKE ? OR description LIKE ? OR file LIKE ? " +
          "ORDER BY created_at DESC LIMIT ?",
      )
      .all(like, like, like, limit) as Record<string, unknown>[];
    return rows.map(rowToFinding);
  }

  previousReportedFindings(currentRoundId: string): Finding[] {
    const previous = this.db.prepare(
      `SELECT id FROM rounds
       WHERE status='reported' AND id<>?
       ORDER BY created_at DESC LIMIT 1`,
    ).get(currentRoundId) as { id?: string } | undefined;
    return previous?.id ? this.reportedFindings(previous.id) : [];
  }

  /** Preserve canonical history, including filtered/suppressed findings. */
  reportedFindings(roundId: string): Finding[] {
    const snapshot = this.getMeta(`reported-findings:${roundId}`);
    if (snapshot) return JSON.parse(snapshot) as Finding[];
    const all = this.listFindings(roundId);
    const plan = this.getMeta(`reconciliation:${roundId}`);
    if (plan) return consolidateReconciled(all, reconciliationSchema.parse(JSON.parse(plan).groups)).findings;
    return all.filter(f => f.status === "confirmed");
  }

  olderConfirmedFindings(currentRoundId: string): Finding[] {
    const rows = this.db.prepare(
      `SELECT id FROM rounds WHERE id<>? AND status='reported' ORDER BY created_at DESC`,
    ).all(currentRoundId) as { id: string }[];
    return rows.flatMap(row => this.reportedFindings(row.id));
  }

  importBaseline(source: string, findings: Finding[]): number {
    let imported = 0;
    this.db.transaction(() => {
      const statement = this.db.prepare(
        `INSERT INTO baseline_findings(fingerprint,source,finding_json,imported_at)
         VALUES(?,?,?,?)
         ON CONFLICT(fingerprint) DO UPDATE SET
           source=excluded.source, finding_json=excluded.finding_json,
           imported_at=excluded.imported_at`,
      );
      for (const finding of findings) {
        statement.run(findingFingerprint(finding), source, JSON.stringify(finding), nowIso());
        imported += 1;
      }
    });
    return imported;
  }

  listBaselineFindings(): Finding[] {
    const rows = this.db.prepare(
      "SELECT finding_json FROM baseline_findings ORDER BY imported_at DESC",
    ).all() as { finding_json: string }[];
    return rows.flatMap((row) => {
      try {
        return [JSON.parse(row.finding_json) as Finding];
      } catch {
        return [];
      }
    });
  }

  suppressFinding(finding: Finding, reason: string, expiresAt?: string): Suppression {
    const fingerprint = findingFingerprint(finding);
    const suppression: Suppression = {
      id: `suppression-${fingerprint}`,
      fingerprint,
      reason,
      expiresAt,
      createdAt: nowIso(),
    };
    this.db.prepare(
      `INSERT INTO suppressions(id,fingerprint,reason,expires_at,created_at)
       VALUES(?,?,?,?,?)
       ON CONFLICT(fingerprint) DO UPDATE SET
         reason=excluded.reason, expires_at=excluded.expires_at`,
    ).run(
      suppression.id,
      suppression.fingerprint,
      suppression.reason,
      suppression.expiresAt ?? null,
      suppression.createdAt,
    );
    return suppression;
  }

  listSuppressions(activeOnly = true): Suppression[] {
    const rows = this.db.prepare(
      `SELECT * FROM suppressions
       ${activeOnly ? "WHERE expires_at IS NULL OR expires_at > ?" : ""}
       ORDER BY created_at DESC`,
    ).all(...(activeOnly ? [nowIso()] : [])) as Record<string, unknown>[];
    return rows.map((row) => ({
      id: String(row.id),
      fingerprint: String(row.fingerprint),
      reason: String(row.reason),
      expiresAt: row.expires_at ? String(row.expires_at) : undefined,
      createdAt: String(row.created_at),
    }));
  }
}

export interface Suppression {
  id: string;
  fingerprint: string;
  reason: string;
  expiresAt?: string;
  createdAt: string;
}

/** Global cross-target memory (accepted/known findings), like Proteus global. */
export class GlobalMemory {
  private db: ResilientDatabase;
  private constructor(db: ResilientDatabase) {
    this.db = db;
  }
  static open(): GlobalMemory {
    ensureDir(globalDir());
    const db = new ResilientDatabase(globalDbPath());
    migrateGlobal(db);
    return new GlobalMemory(db);
  }
  addFinding(target: string, finding: Finding): void {
    const fingerprint = createHash("sha256")
      .update(`${target}\0${finding.file}\0${finding.title.toLowerCase()}`)
      .digest("hex");
    const now = nowIso();
    this.db.prepare(
      `INSERT INTO global_findings(fingerprint,target,finding_json,created_at,updated_at)
       VALUES(?,?,?,?,?)
       ON CONFLICT(fingerprint) DO UPDATE SET
         finding_json=excluded.finding_json, updated_at=excluded.updated_at`,
    ).run(fingerprint, target, JSON.stringify(finding), now, now);
  }
  search(query: string, limit = 20): Array<{
    fingerprint: string;
    target: string;
    finding: Finding;
    status: "active" | "retired";
    note?: string;
  }> {
    const like = `%${query}%`;
    const rows = this.db
      .prepare(
        "SELECT fingerprint,target,finding_json,status,note FROM global_findings " +
          "WHERE status='active' AND (target LIKE ? OR finding_json LIKE ?) " +
          "ORDER BY updated_at DESC LIMIT ?",
      )
      .all(like, like, limit) as Array<{
        fingerprint: string;
        target: string;
        finding_json: string;
        status: "active" | "retired";
        note?: string;
      }>;
    return rows.flatMap((row) => {
      try {
        return [{
          fingerprint: row.fingerprint,
          target: row.target,
          finding: JSON.parse(row.finding_json) as Finding,
          status: row.status,
          note: row.note ?? undefined,
        }];
      } catch {
        return [];
      }
    });
  }
  updateStatus(
    fingerprint: string,
    status: "active" | "retired",
    note?: string,
  ): boolean {
    const result = this.db.prepare(
      "UPDATE global_findings SET status=?, note=?, updated_at=? WHERE fingerprint=?",
    ).run(status, note ?? null, nowIso(), fingerprint);
    return result.changes > 0;
  }
  close(): void {
    this.db.close();
  }
}

export function findingFingerprint(finding: Pick<Finding, "file" | "title" | "category">): string {
  const normalizedTitle = finding.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const normalizedFile = finding.file.replace(/\\/g, "/").toLowerCase();
  return createHash("sha256")
    .update(`${normalizedFile}\0${finding.category}\0${normalizedTitle}`)
    .digest("hex");
}

function migrate(db: ResilientDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
  for (const migration of MIGRATIONS) {
    const applied = db.prepare("SELECT 1 AS found FROM schema_migrations WHERE id=?")
      .get(migration.id) as { found?: number } | undefined;
    if (applied) continue;
    db.transaction(() => {
      // Another process may have migrated while this one waited for the lock.
      if (db.prepare("SELECT 1 FROM schema_migrations WHERE id=?").get(migration.id)) return;
      db.exec(migration.sql);
      db.prepare("INSERT OR IGNORE INTO schema_migrations(id,applied_at) VALUES(?,?)")
        .run(migration.id, nowIso());
    });
  }
  db.prepare(
    "INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
  ).run("schema_version", String(DATABASE_SCHEMA_VERSION));
  db.prepare(
    "INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
  ).run("runtime_version", ARGUS_VERSION);
}

function migrateGlobal(db: ResilientDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS global_findings (
      fingerprint TEXT PRIMARY KEY,
      target       TEXT NOT NULL,
      finding_json TEXT NOT NULL,
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'active',
      note         TEXT
    );
  `);
  const columns = db.prepare("PRAGMA table_info(global_findings)").all() as Array<{ name: string }>;
  const names = new Set(columns.map((column) => column.name));
  if (!names.has("status")) {
    db.exec("ALTER TABLE global_findings ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
  }
  if (!names.has("note")) {
    db.exec("ALTER TABLE global_findings ADD COLUMN note TEXT");
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_global_findings_status ON global_findings(status)");
}

function rowToFinding(row: Record<string, unknown>): Finding {
  const review = typeof row.review_data === "string" ? JSON.parse(row.review_data) as
    Pick<Finding, "rootCause" | "rootCauseValidated" | "corrections"> & { challengeExecution?: ChallengeExecution } : {};
  const { challengeExecution, ...contentReview } = review;
  const start = row.start_line as number | null;
  const end = row.end_line as number | null;
  return {
    ...contentReview,
    id: row.id as string,
    title: row.title as string,
    category: row.category as Category,
    severity: row.severity as Severity,
    confidence: row.confidence as Confidence,
    file: row.file as string,
    lines:
      start != null ? { start, end: end ?? start } : undefined,
    description: (row.description as string) ?? "",
    evidence: safeJsonArray(row.evidence),
    evidencePackage: typeof row.evidence_package === "string"
      ? JSON.parse(row.evidence_package) as EvidencePackage : undefined,
    impact: (row.impact as string) ?? "",
    scenario: (row.scenario as string) ?? undefined,
    recommendation: (row.recommendation as string) ?? undefined,
    reviewer: row.reviewer as string,
    status: row.status as Finding["status"],
    challenge: row.challenge_result
      ? {
          result: row.challenge_result as ChallengeResult,
          reasoning: (row.challenge_reasoning as string) ?? "",
          execution: challengeExecution,
        }
      : undefined,
    detectedBy: safeJsonArray(row.detected_by),
    score: (row.score as number) ?? undefined,
  };
}

function safeJsonArray(v: unknown): string[] {
  if (typeof v !== "string") return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
