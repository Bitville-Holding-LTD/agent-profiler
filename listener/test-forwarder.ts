import { initGelfClient, isGraylogEnabled } from "./src/graylog/client.ts";
import { createCircuitBreaker, getCircuitBreakerStatus } from "./src/graylog/circuit-breaker.ts";
import { buildGelfMessage, forwardToGraylog, canForward } from "./src/graylog/forwarder.ts";
import type { ProfilingDataRow } from "./src/types/payloads.ts";

console.log("Forwarder Test");
console.log("==============");

// Initialize (Graylog disabled by default)
initGelfClient();
createCircuitBreaker();

// Test buildGelfMessage
console.log("\n1. Build GELF message:");
const testRecord: ProfilingDataRow = {
  id: 123,
  correlation_id: "test-corr-456",
  project: "myproject",
  source: "php_agent",
  timestamp: Date.now() / 1000,
  duration_ms: 250.5,
  payload: JSON.stringify({
    request: {
      method: "GET",
      uri: "/api/users",
    },
    response: {
      status_code: 200,
    },
    sql: {
      total_queries: 5,
      total_duration_ms: 45.2,
    },
    server: {
      hostname: "web1.example.com",
    },
  }),
  created_at: Math.floor(Date.now() / 1000),
};

const gelfMessage = buildGelfMessage(testRecord);
console.log("GELF message:", JSON.stringify(gelfMessage, null, 2));

// Verify required fields
console.assert(gelfMessage.short_message === "php_agent - myproject", "short_message correct");
console.assert(gelfMessage._correlation_id === "test-corr-456", "_correlation_id correct");
console.assert(gelfMessage._project === "myproject", "_project correct");
console.assert(gelfMessage._duration_ms === 250.5, "_duration_ms correct");
console.assert(gelfMessage._url === "/api/users", "_url extracted");
console.assert(gelfMessage._method === "GET", "_method extracted");
console.assert(gelfMessage._status_code === 200, "_status_code extracted");
console.assert(gelfMessage._sql_queries === 5, "_sql_queries extracted");

// Test canForward
console.log("\n2. Can forward:", canForward());
console.log("Circuit breaker status:", getCircuitBreakerStatus());

// Test forwardToGraylog (will skip because Graylog disabled)
console.log("\n3. Forward test record (should skip, Graylog disabled):");
await forwardToGraylog(testRecord.id, testRecord);

console.log("\nForwarder test passed!");
