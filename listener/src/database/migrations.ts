/**
 * Database Migrations Registry
 *
 * Manages schema migrations for the listener database.
 * Tracks applied migrations to ensure idempotent execution.
 *
 * Migration pattern:
 * - Each migration has unique ID and up() function
 * - Migrations run in order and are tracked in _migrations table
 * - Safe to run multiple times (already-applied migrations are skipped)
 */

import type { Database } from "bun:sqlite";

interface Migration {
  id: string;
  up: (db: Database) => void;
}

// Registry of all migrations
const migrations: Migration[] = [
  {
    id: "001_url_virtual_column",
    up: (db: Database) => {
      try {
        // Add virtual column for URL (extracted from JSON payload)
        // Virtual columns are computed on read, stored on disk as part of index only
        db.exec(`
          ALTER TABLE profiling_data
          ADD COLUMN url TEXT GENERATED ALWAYS AS (json_extract(payload, '$.request.uri')) VIRTUAL
        `);
        console.log("[Migration 001] Added virtual column: url");
      } catch (error: any) {
        // Gracefully handle "duplicate column name" error
        if (error.message.includes("duplicate column name")) {
          console.log("[Migration 001] Virtual column 'url' already exists, skipping");
        } else {
          throw error;
        }
      }

      // Create index on virtual column for fast URL filtering
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_url ON profiling_data(url)
      `);
      console.log("[Migration 001] Created index: idx_url");
    },
  },
  {
    id: "002_url_method_columns",
    up: (db: Database) => {
      try {
        // Add virtual column for HTTP method
        db.exec(`
          ALTER TABLE profiling_data
          ADD COLUMN http_method TEXT GENERATED ALWAYS AS (json_extract(payload, '$.request.method')) VIRTUAL
        `);
        console.log("[Migration 002] Added virtual column: http_method");
      } catch (error: any) {
        if (error.message.includes("duplicate column name")) {
          console.log("[Migration 002] Virtual column 'http_method' already exists, skipping");
        } else {
          throw error;
        }
      }

      try {
        // Add virtual column for HTTP status code
        db.exec(`
          ALTER TABLE profiling_data
          ADD COLUMN status_code INTEGER GENERATED ALWAYS AS (json_extract(payload, '$.response.status_code')) VIRTUAL
        `);
        console.log("[Migration 002] Added virtual column: status_code");
      } catch (error: any) {
        if (error.message.includes("duplicate column name")) {
          console.log("[Migration 002] Virtual column 'status_code' already exists, skipping");
        } else {
          throw error;
        }
      }
    },
  },
];

/**
 * Run pending migrations
 *
 * Creates _migrations tracking table if needed, then runs any
 * migrations that haven't been applied yet.
 *
 * @param db - Database instance
 */
export function runMigrations(db: Database): void {
  // Create migrations tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Get list of already-applied migrations
  const appliedMigrations = new Set(
    db.query<{ id: string }, []>("SELECT id FROM _migrations").all().map((row) => row.id)
  );

  // Run pending migrations
  for (const migration of migrations) {
    if (appliedMigrations.has(migration.id)) {
      // Already applied, skip
      continue;
    }

    console.log(`[Database] Running migration: ${migration.id}`);

    // Run migration
    migration.up(db);

    // Record migration as applied
    db.exec(`
      INSERT INTO _migrations (id) VALUES ('${migration.id}')
    `);

    console.log(`[Database] Migration ${migration.id} applied successfully`);
  }
}
