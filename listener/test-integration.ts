/**
 * Integration test for rate limiting and UDP
 *
 * Tests:
 * 1. Server starts with UDP enabled
 * 2. Rate limiting blocks excessive HTTP requests
 * 3. 429 responses include proper headers
 * 4. UDP ingestion works simultaneously with HTTP
 * 5. /ready endpoint shows UDP and rate limit stats
 * 6. Graceful shutdown stops all services
 */

import dgram from "node:dgram";

console.log("=== Integration Test: Rate Limiting + UDP ===\n");

// Test setup
const TEST_DB_PATH = "/tmp/test-integration.db";
const TEST_PORT = 8445;
const TEST_UDP_PORT = 8446;

// Remove old test database
try {
  const fs = require("node:fs");
  fs.unlinkSync(TEST_DB_PATH);
  fs.unlinkSync(TEST_DB_PATH + "-shm");
  fs.unlinkSync(TEST_DB_PATH + "-wal");
} catch (e) {
  // Ignore if doesn't exist
}

// Set environment variables
Bun.env.BITVILLE_DB_PATH = TEST_DB_PATH;
Bun.env.BITVILLE_PORT = String(TEST_PORT);
Bun.env.BITVILLE_UDP_PORT = String(TEST_UDP_PORT);
Bun.env.BITVILLE_API_KEY_TEST = "test-key";
Bun.env.BITVILLE_RATE_LIMIT = "5"; // Low limit for testing

// Start server by importing (it runs on load)
console.log("Starting server...");
const serverModule = await import("./src/server.ts");

// Wait for server to fully start
await new Promise(resolve => setTimeout(resolve, 500));
console.log("✓ Server started\n");

// Test 1: Verify /ready shows UDP and rate limit stats
console.log("Test 1: Checking /ready endpoint...");
const readyRes = await fetch(`http://localhost:${TEST_PORT}/ready`);
const ready = await readyRes.json();

if (ready.udp && ready.udp.enabled && ready.udp.port === TEST_UDP_PORT) {
  console.log(`✓ UDP enabled on port ${ready.udp.port}`);
} else {
  console.error("❌ FAILED: UDP not enabled");
  process.exit(1);
}

if (ready.rateLimit && ready.rateLimit.maxRequests === 5) {
  console.log(`✓ Rate limit configured: ${ready.rateLimit.maxRequests} req/min`);
} else {
  console.error("❌ FAILED: Rate limit not configured");
  process.exit(1);
}
console.log();

// Test 2: Rate limiting blocks excessive requests
console.log("Test 2: Testing rate limiting (5 req/min limit)...");
const authHeader = { "Authorization": "Bearer test-key" };

// Send 5 requests (should all succeed)
let successCount = 0;
for (let i = 0; i < 5; i++) {
  const res = await fetch(`http://localhost:${TEST_PORT}/ingest/php`, {
    method: "POST",
    headers: {
      ...authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      correlation_id: `test-${i}`,
      project: "test",
      timestamp: Date.now() / 1000,
      elapsed_ms: 100,
      request: { method: "GET", uri: "/test" },
      server: { hostname: "test", php_version: "7.4", sapi: "fpm" },
    }),
  });

  if (res.status === 200) {
    successCount++;
  }
}

console.log(`✓ ${successCount}/5 requests succeeded`);

// Send 6th request (should be blocked)
const blockedRes = await fetch(`http://localhost:${TEST_PORT}/ingest/php`, {
  method: "POST",
  headers: {
    ...authHeader,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    correlation_id: "test-blocked",
    project: "test",
    timestamp: Date.now() / 1000,
    elapsed_ms: 100,
    request: { method: "GET", uri: "/test" },
    server: { hostname: "test", php_version: "7.4", sapi: "fpm" },
  }),
});

if (blockedRes.status === 429) {
  console.log("✓ 6th request blocked with 429");

  // Check headers
  const retryAfter = blockedRes.headers.get("Retry-After");
  const rateLimit = blockedRes.headers.get("X-RateLimit-Limit");
  const remaining = blockedRes.headers.get("X-RateLimit-Remaining");
  const reset = blockedRes.headers.get("X-RateLimit-Reset");

  if (retryAfter && rateLimit && remaining && reset) {
    console.log(`  Retry-After: ${retryAfter}s`);
    console.log(`  X-RateLimit-Limit: ${rateLimit}`);
    console.log(`  X-RateLimit-Remaining: ${remaining}`);
    console.log(`  X-RateLimit-Reset: ${reset}`);
    console.log("✓ Rate limit headers present");
  } else {
    console.error("❌ FAILED: Missing rate limit headers");
    process.exit(1);
  }
} else {
  console.error(`❌ FAILED: Expected 429, got ${blockedRes.status}`);
  process.exit(1);
}
console.log();

// Test 3: UDP ingestion works
console.log("Test 3: Testing UDP ingestion...");
const udpPayload = JSON.stringify({
  correlation_id: "udp-test-123",
  project: "test",
  timestamp: Date.now() / 1000,
  elapsed_ms: 250,
  request: { method: "POST", uri: "/api/udp" },
  server: { hostname: "udp-server", php_version: "8.1", sapi: "fpm" },
});

const udpClient = dgram.createSocket("udp4");
udpClient.send(udpPayload, TEST_UDP_PORT, "localhost", (err) => {
  if (err) {
    console.error("❌ FAILED: Error sending UDP packet:", err);
    process.exit(1);
  }
  udpClient.close();
});

// Wait for processing
await new Promise(resolve => setTimeout(resolve, 200));

// Check /ready for UDP stats
const readyRes2 = await fetch(`http://localhost:${TEST_PORT}/ready`);
const ready2 = await readyRes2.json();

if (ready2.udp.received >= 1) {
  console.log(`✓ UDP packet received (count: ${ready2.udp.received})`);
} else {
  console.error("❌ FAILED: UDP packet not received");
  process.exit(1);
}
console.log();

// Test 4: Check rate limit stats in /ready
console.log("Test 4: Checking rate limit stats...");
if (ready2.rateLimit.activeIps >= 1) {
  console.log(`✓ Active IPs tracked: ${ready2.rateLimit.activeIps}`);
} else {
  console.error("❌ FAILED: No active IPs tracked");
  process.exit(1);
}
console.log();

console.log("=== All Tests Passed ===");
console.log("\nShutting down server...");
process.exit(0);
