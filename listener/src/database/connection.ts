import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { runMigrations } from "./migrations.ts";

// Singleton database instance
let db: Database | null = null;

/**
 * Initialize database with WAL mode and performance pragmas
 *
 * Enables:
 * - WAL mode for concurrent reads during writes
 * - Performance optimizations for embedded SQLite
 * - Incremental auto-vacuum for space reclamation
 * - Schema creation from schema.sql
 *
 * @returns Database instance
 */
export function initDatabase(): Database {
  if (db) {
    return db;
  }

  // Database path from environment variable (read at runtime)
  const DB_PATH = process.env.BITVILLE_DB_PATH || "/var/lib/bitville/listener.db";

  // Create database connection
  db = new Database(DB_PATH, { create: true });

  // CRITICAL: Enable WAL mode FIRST (before any operations)
  // WAL mode allows concurrent reads during writes
  db.exec("PRAGMA journal_mode = WAL");

  // Performance pragmas
  db.exec("PRAGMA synchronous = NORMAL");  // Balance safety vs performance
  db.exec("PRAGMA cache_size = -50000");   // 50MB cache (negative = KB)
  db.exec("PRAGMA temp_store = MEMORY");   // Temp tables in RAM

  // Gradual space reclamation
  db.exec("PRAGMA auto_vacuum = INCREMENTAL");

  // Load and execute schema
  const schemaPath = import.meta.dir + "/schema.sql";
  const schema = readFileSync(schemaPath, "utf-8");
  db.exec(schema);

  // Migration: Add forwarded_to_graylog column if missing
  const hasColumn = db.query("PRAGMA table_info(profiling_data)").all()
    .some((col: any) => col.name === 'forwarded_to_graylog');

  if (!hasColumn) {
    console.log("[Database] Migrating: Adding forwarded_to_graylog column...");
    // Add column with DEFAULT 1 for existing records (assume already sent)
    db.exec(`
      ALTER TABLE profiling_data
      ADD COLUMN forwarded_to_graylog INTEGER NOT NULL DEFAULT 1
      CHECK(forwarded_to_graylog IN (0, 1))
    `);
    // Create index for replay queries
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_forwarded_to_graylog
      ON profiling_data(forwarded_to_graylog, id)
    `);
    console.log("[Database] Migration complete: forwarded_to_graylog column added");
  }

  // Run migrations (virtual columns for URL filtering, etc.)
  console.log("[Database] Running migrations...");
  runMigrations(db);

  return db;
}

/**
 * Get database instance (must call initDatabase first)
 *
 * @returns Database instance or null if not initialized
 */
export function getDatabase(): Database | null {
  return db;
}

// Export singleton instance for convenience
export { db };
