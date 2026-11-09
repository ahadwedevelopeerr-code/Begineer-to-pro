const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const defaultPath = path.join(__dirname, '..', 'data', 'codepath.sqlite');
const databasePath = process.env.CODEPATH_DB_PATH || defaultPath;
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new Database(databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_active_at TEXT NOT NULL,
    total_xp INTEGER NOT NULL DEFAULT 0,
    quiz_count INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    session_data TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS quiz_results (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id),
    student_name TEXT NOT NULL,
    topic TEXT NOT NULL,
    score INTEGER NOT NULL CHECK(score >= 0),
    total INTEGER NOT NULL CHECK(total > 0),
    percentage INTEGER NOT NULL CHECK(percentage BETWEEN 0 AND 100),
    attempted INTEGER NOT NULL CHECK(attempted BETWEEN 0 AND total),
    xp_earned INTEGER NOT NULL CHECK(xp_earned >= 0),
    completed_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_quiz_results_student_date
    ON quiz_results(student_id, completed_at DESC);
  CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  );
`);

function importLegacyResults() {
  if (process.env.CODEPATH_DB_PATH) return;
  const migration = 'import-legacy-json-results-v1';
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE name = ?').get(migration)) return;

  const legacyPath = path.join(__dirname, '..', 'data', 'quiz-results.json');
  let legacyResults = [];
  if (fs.existsSync(legacyPath)) {
    const parsed = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
    if (Array.isArray(parsed)) legacyResults = parsed;
  }

  const migrate = db.transaction(() => {
    if (legacyResults.length) {
      const studentId = 'legacy-import';
      const now = new Date().toISOString();
      db.prepare(`INSERT OR IGNORE INTO students (id, display_name, created_at, last_active_at)
        VALUES (?, ?, ?, ?)`).run(studentId, 'Legacy guest', now, now);
      const insert = db.prepare(`INSERT OR IGNORE INTO quiz_results
        (id, student_id, student_name, topic, score, total, percentage, attempted, xp_earned, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const result of legacyResults) {
        if (!result || typeof result.id !== 'string' || !Number.isInteger(result.score) ||
            !Number.isInteger(result.total) || result.total < 1) continue;
        insert.run(
          result.id, studentId, 'Legacy guest', String(result.topic || 'unknown'), result.score,
          result.total, Number.isInteger(result.percentage) ? result.percentage : Math.round(result.score / result.total * 100),
          Number.isInteger(result.attempted) ? result.attempted : 0, 0,
          result.completedAt || now
        );
      }
    }
    db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(migration, new Date().toISOString());
  });
  migrate();
}

importLegacyResults();

module.exports = db;