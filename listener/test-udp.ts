/**
 * Test script for UDP receiver
 *
 * Tests:
 * 1. UDP server starts successfully
 * 2. Valid PHP payload is received and stored
 * 3. Invalid JSON increases error count
 * 4. Server stops cleanly
 */

import { startUdpServer, stopUdpServer, getUdpStats } from "./src/handlers/udp-receiver";
import { initDatabase, getDatabase } from "./src/database/connection";
import { queryByProject } from "./src/database/queries";
import dgram from "node:dgram";

console.log("=== UDP Receiver Test ===\n");

// Initialize test database
const TEST_DB_PATH = "/tmp/test-udp.db";
Bun.env.BITVILLE_DB_PATH = TEST_DB_PATH;

// Remove old test database
try {
  const fs = require("node:fs");
  fs.unlinkSync(TEST_DB_PATH);
  fs.unlinkSync(TEST_DB_PATH + "-shm");
  fs.unlinkSync(TEST_DB_PATH + "-wal");
} catch (e) {
  // Ignore if doesn't exist
}

initDatabase();
console.log("✓ Test database initialized\n");

// Test 1: Start UDP server
console.log("Test 1: Starting UDP server on port 8444...");
await startUdpServer(8444);
const stats1 = getUdpStats();
if (stats1.running && stats1.port === 8444) {
  console.log(`✓ UDP server running on port ${stats1.port}\n`);
} else {
  console.error("❌ FAILED: UDP server not running");
  process.exit(1);
}

// Test 2: Send valid PHP payload
console.log("Test 2: Sending valid PHP payload via UDP...");
const validPayload = JSON.stringify({
  correlation_id: "test-udp-123",
  project: "test-project",
  timestamp: Date.now() / 1000,
  elapsed_ms: 600,
  request: {
    method: "GET",
    uri: "/test",
  },
  server: {
    hostname: "test-server",
    php_version: "7.4",
    sapi: "fpm",
  },
});

const client = dgram.createSocket("udp4");
client.send(validPayload, 8444, "localhost", (err) => {
  if (err) {
    console.error("❌ FAILED: Error sending UDP packet:", err);
    process.exit(1);
  }
  client.close();
});

// Wait for packet processing
await new Promise(resolve => setTimeout(resolve, 100));

const stats2 = getUdpStats();
if (stats2.received === 1) {
  console.log(`✓ Packet received (count: ${stats2.received})`);
} else {
  console.error(`❌ FAILED: Expected 1 received, got ${stats2.received}`);
  process.exit(1);
}

// Check database
const records = queryByProject("test-project");
if (records.length === 1 && records[0].correlation_id === "test-udp-123") {
  console.log(`✓ Data stored in database\n`);
} else {
  console.error("❌ FAILED: Data not found in database");
  console.error("Records:", records);
  process.exit(1);
}

// Test 3: Send invalid JSON
console.log("Test 3: Sending invalid JSON...");
const invalidPayload = "this is not json";
const client2 = dgram.createSocket("udp4");
client2.send(invalidPayload, 8444, "localhost", (err) => {
  if (err) {
    console.error("❌ FAILED: Error sending UDP packet:", err);
    process.exit(1);
  }
  client2.close();
});

// Wait for packet processing
await new Promise(resolve => setTimeout(resolve, 100));

const stats3 = getUdpStats();
if (stats3.errors === 1) {
  console.log(`✓ Error count increased (errors: ${stats3.errors})`);
  console.log(`  Last error: ${stats3.lastError}\n`);
} else {
  console.error(`❌ FAILED: Expected 1 error, got ${stats3.errors}`);
  process.exit(1);
}

// Test 4: Stop UDP server
console.log("Test 4: Stopping UDP server...");
stopUdpServer();
const stats4 = getUdpStats();
if (!stats4.running) {
  console.log("✓ UDP server stopped\n");
} else {
  console.error("❌ FAILED: UDP server still running");
  process.exit(1);
}

console.log("=== All Tests Passed ===");

// Close database
const db = getDatabase();
if (db) {
  db.close();
}
