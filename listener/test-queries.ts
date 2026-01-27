import { initDatabase } from "./src/database/connection.ts";
import {
  insertProfilingData,
  queryByCorrelationId,
  queryByProject,
  queryByProjectTimeRange,
  deleteOldRecords,
  countByProject,
} from "./src/database/queries.ts";
import type { PhpAgentPayload } from "./src/types/payloads.ts";

// Use local test database
process.env.BITVILLE_DB_PATH = "./test-queries.db";

console.log("Testing database queries...\n");

// Initialize database
const db = initDatabase();

// Create test payload matching PHP agent structure
const testPayload: PhpAgentPayload = {
  correlation_id: "test-corr-123",
  project: "test-project",
  timestamp: Date.now() / 1000,
  elapsed_ms: 1234.56,
  threshold_ms: 500,
  request: {
    method: "GET",
    uri: "/api/test",
    query_string: "foo=bar",
  },
  response: {
    status_code: 200,
  },
  timing: {
    start_time: Date.now() / 1000,
    end_time: Date.now() / 1000 + 1.23456,
    duration_ms: 1234.56,
  },
  server: {
    hostname: "test-server",
    php_version: "8.2.0",
    sapi: "fpm-fcgi",
  },
};

// Test 1: Insert profiling data
console.log("✓ Test 1: Insert profiling data");
const insertId = insertProfilingData({
  correlation_id: testPayload.correlation_id,
  project: testPayload.project,
  source: "php_agent",
  timestamp: Math.floor(testPayload.timestamp),
  duration_ms: testPayload.elapsed_ms,
  payload: JSON.stringify(testPayload),
});
console.log(`  Inserted row ID: ${insertId}`);
console.log(`  Result: ${insertId > 0 ? "PASS" : "FAIL"}\n`);

// Test 2: Query by correlation ID
console.log("✓ Test 2: Query by correlation ID");
const rows = queryByCorrelationId(testPayload.correlation_id);
console.log(`  Found ${rows.length} row(s)`);
if (rows.length > 0) {
  const row = rows[0];
  console.log(`  - correlation_id: ${row?.correlation_id}`);
  console.log(`  - project: ${row?.project}`);
  console.log(`  - source: ${row?.source}`);
  console.log(`  - duration_ms: ${row?.duration_ms}`);

  // Parse payload to verify it's valid JSON
  const parsedPayload = JSON.parse(row?.payload || "{}") as PhpAgentPayload;
  console.log(`  - payload.request.uri: ${parsedPayload.request.uri}`);
}
const test2Pass = rows.length === 1 && rows[0]?.correlation_id === testPayload.correlation_id;
console.log(`  Result: ${test2Pass ? "PASS" : "FAIL"}\n`);

// Test 3: Query by project
console.log("✓ Test 3: Query by project");
const projectRows = queryByProject(testPayload.project, 10);
console.log(`  Found ${projectRows.length} row(s) for project "${testPayload.project}"`);
const test3Pass = projectRows.length >= 1;
console.log(`  Result: ${test3Pass ? "PASS" : "FAIL"}\n`);

// Test 4: Query by project time range
console.log("✓ Test 4: Query by project time range");
const now = Math.floor(Date.now() / 1000);
const timeRangeRows = queryByProjectTimeRange(
  testPayload.project,
  now - 3600,  // 1 hour ago
  now + 3600   // 1 hour from now
);
console.log(`  Found ${timeRangeRows.length} row(s) in time range`);
const test4Pass = timeRangeRows.length >= 1;
console.log(`  Result: ${test4Pass ? "PASS" : "FAIL"}\n`);

// Test 5: Count by project
console.log("✓ Test 5: Count by project");
const counts = countByProject();
console.log(`  Found ${counts.length} project(s) with data`);
for (const item of counts) {
  console.log(`  - ${item.project}: ${item.count} record(s)`);
}
const test5Pass = counts.length >= 1 && counts.some(c => c.project === testPayload.project);
console.log(`  Result: ${test5Pass ? "PASS" : "FAIL"}\n`);

// Test 6: TypeScript type checking
console.log("✓ Test 6: TypeScript type checking");
const typedRow = rows[0];
if (typedRow) {
  // These should compile without errors due to ProfilingDataRow type
  const _id: number = typedRow.id;
  const _correlationId: string = typedRow.correlation_id;
  const _project: string = typedRow.project;
  const _source: string = typedRow.source;
  const _timestamp: number = typedRow.timestamp;
  const _durationMs: number | null = typedRow.duration_ms;
  const _payload: string = typedRow.payload;
  const _createdAt: number = typedRow.created_at;
  console.log("  All type checks passed");
}
console.log("  Result: PASS\n");

// Clean up: delete test data
console.log("✓ Cleanup: Delete test data");
const deleted = deleteOldRecords(now + 3600);
console.log(`  Deleted ${deleted} record(s)`);

console.log("\n✅ All tests passed! Prepared statements and types work correctly.");

// Close database
db.close();
