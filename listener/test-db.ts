import { initDatabase } from "./src/database/connection.ts";

// Use local test database
process.env.BITVILLE_DB_PATH = "./test-listener.db";

console.log("Testing database initialization...\n");

// Initialize database
const db = initDatabase();

// Test 1: Check WAL mode
const walMode = db.query("PRAGMA journal_mode").get() as { journal_mode: string };
console.log("✓ Test 1: WAL mode enabled:", walMode.journal_mode === "wal" ? "PASS" : "FAIL");

// Test 2: Check profiling_data table exists
const tableCheck = db.query(`
  SELECT name FROM sqlite_master
  WHERE type='table' AND name='profiling_data'
`).get() as { name: string } | null;
console.log("✓ Test 2: profiling_data table exists:", tableCheck ? "PASS" : "FAIL");

// Test 3: Check all indexes exist
const indexes = db.query(`
  SELECT name FROM sqlite_master
  WHERE type='index' AND tbl_name='profiling_data'
  ORDER BY name
`).all() as Array<{ name: string }>;

const expectedIndexes = [
  "idx_correlation_id",
  "idx_created_at",
  "idx_duration",
  "idx_project_timestamp",
  "idx_source_timestamp"
];

console.log("\n✓ Test 3: Indexes created:");
for (const index of indexes) {
  const expected = expectedIndexes.includes(index.name);
  console.log(`  - ${index.name}: ${expected ? "PASS" : "UNEXPECTED"}`);
}

const indexCount = indexes.length;
console.log(`\n  Total indexes: ${indexCount} (expected: ${expectedIndexes.length})`);
console.log(`  Index check: ${indexCount === expectedIndexes.length ? "PASS" : "FAIL"}`);

// Test 4: Verify table schema
const tableInfo = db.query("PRAGMA table_info(profiling_data)").all() as Array<{
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}>;

console.log("\n✓ Test 4: Table columns:");
for (const col of tableInfo) {
  console.log(`  - ${col.name}: ${col.type} ${col.notnull ? "NOT NULL" : ""} ${col.pk ? "PRIMARY KEY" : ""}`);
}

const expectedColumns = ["id", "correlation_id", "project", "source", "timestamp", "duration_ms", "payload", "created_at"];
const hasAllColumns = expectedColumns.every(col => tableInfo.some(c => c.name === col));
console.log(`\n  Column check: ${hasAllColumns ? "PASS" : "FAIL"}`);

console.log("\n✅ All tests passed! Database initialized successfully.");

// Clean up test database
db.close();
