/**
 * Test script for rate limiting middleware
 *
 * Tests:
 * 1. First 100 requests are allowed
 * 2. 101st request is blocked
 * 3. After window reset, requests are allowed again
 */

import { checkRateLimit } from "./src/middleware/rate-limit";

console.log("=== Rate Limit Test ===\n");

const testIp = "1.2.3.4";

// Test 1: First 100 requests should be allowed
console.log("Test 1: Sending 100 requests...");
let allowedCount = 0;
for (let i = 0; i < 100; i++) {
  const result = checkRateLimit(testIp);
  if (result.allowed) {
    allowedCount++;
  }
}
console.log(`✓ ${allowedCount}/100 requests allowed\n`);

if (allowedCount !== 100) {
  console.error("❌ FAILED: Expected 100 allowed requests");
  process.exit(1);
}

// Test 2: 101st request should be blocked
console.log("Test 2: Sending 101st request...");
const blocked = checkRateLimit(testIp);
if (!blocked.allowed) {
  console.log(`✓ Request blocked (remaining: ${blocked.remaining})`);
  console.log(`  Reset at: ${new Date(blocked.resetAt).toISOString()}\n`);
} else {
  console.error("❌ FAILED: Expected request to be blocked");
  process.exit(1);
}

// Test 3: After window reset, requests should be allowed again
console.log("Test 3: Simulating window reset (this will take ~61 seconds)...");
console.log("  Waiting for rate limit window to expire...");

// Wait for window to expire (60 seconds + 1 second buffer)
await new Promise(resolve => setTimeout(resolve, 61000));

const afterReset = checkRateLimit(testIp);
if (afterReset.allowed) {
  console.log(`✓ Request allowed after window reset (remaining: ${afterReset.remaining})\n`);
} else {
  console.error("❌ FAILED: Expected request to be allowed after reset");
  process.exit(1);
}

console.log("=== All Tests Passed ===");
