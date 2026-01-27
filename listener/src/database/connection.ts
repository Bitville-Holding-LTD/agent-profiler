import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";

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
