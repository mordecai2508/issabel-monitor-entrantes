'use strict';

const Database = require('better-sqlite3');
const path     = require('path');

const DB_PATH = path.join(__dirname, 'monitor.sqlite');

/**
 * Initialise (or open) the local SQLite database, create tables,
 * and migrate users from config.json on first run.
 *
 * @param {object} config  The parsed config.json object
 * @returns {Database}     The open better-sqlite3 instance
 */
function initDb(config) {
  const db = new Database(DB_PATH);

  // Ensure WAL mode for better concurrency
  db.pragma('journal_mode = WAL');

  // ── users table ────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      username   TEXT    UNIQUE NOT NULL,
      password   TEXT    NOT NULL,
      role       TEXT    NOT NULL CHECK (role IN ('admin', 'operador')),
      active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      last_login TEXT
    )
  `);

  // ── audit_log table ────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id   INTEGER,
      username  TEXT,
      action    TEXT NOT NULL CHECK (action IN ('login', 'logout', 'login_failed')),
      ip        TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ── index for fast audit queries ───────────────────────────────
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp
    ON audit_log (timestamp DESC)
  `);

  // ── migrate users from config.json → SQLite ────────────────────
  const insert = db.prepare(
    `INSERT OR IGNORE INTO users (id, username, password, role, active)
     VALUES (?, ?, ?, ?, 1)`
  );

  const migrateAll = db.transaction((users) => {
    for (const u of users) {
      insert.run(u.id, u.username, u.password, u.role);
    }
  });

  if (Array.isArray(config.users) && config.users.length > 0) {
    migrateAll(config.users);
  }

  return db;
}

module.exports = { initDb };
