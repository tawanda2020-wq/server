/*
 * db/database.js
 * ------------------------------------------------------------------
 * Opens (or creates) the single-file SQLite database and applies
 * schema.sql on every boot (all statements are IF NOT EXISTS, so this
 * is safe to re-run). Exports the shared better-sqlite3 handle used
 * by every route/service in the server.
 * ------------------------------------------------------------------
 */
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'tracker.db');

// Ensure the containing folder exists (important on fresh cloud deploys).
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

module.exports = db;
