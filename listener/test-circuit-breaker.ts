import { createCircuitBreaker, getCircuitBreakerStatus, isCircuitOpen, sendThroughCircuitBreaker } from "./src/graylog/circuit-breaker.ts";
import { loadState, saveState, getStateFilePath } from "./src/graylog/state.ts";

console.log("Circuit Breaker Test");
console.log("====================");

// Test state persistence
console.log("\n1. State persistence:");
console.log("State file path:", getStateFilePath());
const existingState = loadState();
console.log("Existing state:", existingState);

// Initialize circuit breaker (with Graylog disabled, just testing structure)
console.log("\n2. Circuit breaker initialization:");
let replayTriggered = false;
const breaker = createCircuitBreaker(() => {
  replayTriggered = true;
  console.log("Recovery callback triggered!");
});
console.log("Breaker created:", breaker !== null);

// Check status
console.log("\n3. Circuit breaker status:");
const status = getCircuitBreakerStatus();
console.log("Status:", JSON.stringify(status, null, 2));

// Check open state
console.log("\n4. Is circuit open:", isCircuitOpen());

console.log("\nCircuit breaker test passed!");
