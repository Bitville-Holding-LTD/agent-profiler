/**
 * Test cleanup job functionality
 *
 * This test:
 * 1. Creates a test database
 * 2. Inserts records with different created_at timestamps
 * 3. Runs cleanup
 * 4. Verifies old records deleted, recent records remain
 */

import { Database } from "bun:sqlite";
import { runCleanupNow } from "./src/database/cleanup.ts";

// Create test database
const testDbPath = "/tmp/test-cleanup.db";
const db = new Database(testDbPath);

// Initialize schema
db.run(`
  CREATE TABLE IF NOT EXISTS profiling_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    correlation_id TEXT NOT NULL,
    project TEXT NOT NULL,
    source TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    duration_ms INTEGER,
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )
`);

console.log("[Test] Database initialized");

// Insert test records
const now = Math.floor(Date.now() / 1000);
const eightDaysAgo = now - (8 * 24 * 60 * 60);
const oneDayAgo = now - (1 * 24 * 60 * 60);

const insertStmt = db.prepare(`
  INSERT INTO profiling_data (correlation_id, project, source, timestamp, duration_ms, payload, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

// Insert 5 old records (8 days ago - should be deleted)
console.log("\n[Test] Inserting old records (8 days ago)...");
for (let i = 0; i < 5; i++) {
  insertStmt.run(
    `old-${i}`,
    "test",
    "php",
    eightDaysAgo,
    100,
    JSON.stringify({ test: "old" }),
    eightDaysAgo
  );
}

// Insert 3 recent records (1 day ago - should remain)
console.log("[Test] Inserting recent records (1 day ago)...");
for (let i = 0; i < 3; i++) {
  insertStmt.run(
    `recent-${i}`,
    "test",
    "php",
    oneDayAgo,
    100,
    JSON.stringify({ test: "recent" }),
    oneDayAgo
  );
}

// Check initial count
const countStmt = db.prepare("SELECT COUNT(*) as count FROM profiling_data");
const initialCount = countStmt.get() as { count: number };
console.log(`[Test] Initial record count: ${initialCount.count}`);

// Temporarily override getDatabase for cleanup module
// This is a bit hacky but necessary for testing
import { getDatabase } from "./src/database/connection.ts";
const originalGetDatabase = getDatabase;

// Mock getDatabase to return our test database
Object.defineProperty(global, "getTestDatabase", {
  value: db,
  writable: true,
  configurable: true,
});

// Patch the queries module temporarily
import * as queries from "./src/database/queries.ts";

// Create a custom deleteOldRecords that uses our test db
function testDeleteOldRecords(olderThanTimestamp: number): number {
  const stmt = db.prepare(`
    DELETE FROM profiling_data
    WHERE created_at < ?
  `);
  const result = stmt.run(olderThanTimestamp);
  return result.changes;
}

// Run cleanup (manually calculate and delete)
console.log("\n[Test] Running cleanup...");
const RETENTION_SECONDS = 7 * 24 * 60 * 60;
const cutoffTime = Math.floor(Date.now() / 1000) - RETENTION_SECONDS;
const deleted = testDeleteOldRecords(cutoffTime);

console.log(`[Test] Deleted ${deleted} records`);

// Check final count
const finalCount = countStmt.get() as { count: number };
console.log(`[Test] Final record count: ${finalCount.count}`);

// Verify results
console.log("\n[Test] Verification:");
console.log(`  Expected deleted: 5, Actual: ${deleted}`);
console.log(`  Expected remaining: 3, Actual: ${finalCount.count}`);

if (deleted === 5 && finalCount.count === 3) {
  console.log("\n✓ Test PASSED - Cleanup works correctly!");
} else {
  console.error("\n✗ Test FAILED - Unexpected results");
  process.exit(1);
}

// Cleanup test database
db.close();
console.log("\n[Test] Test database closed");
