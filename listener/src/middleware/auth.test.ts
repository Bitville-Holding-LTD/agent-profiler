import { test, expect, beforeAll } from "bun:test";
import { authenticateRequest, refreshApiKeys, getApiKeyCount } from "./auth.ts";

// Test setup - set environment variable
beforeAll(() => {
  process.env.BITVILLE_API_KEY_TESTPROJECT = "test-key-123";
  process.env.BITVILLE_API_KEY_PRODUCTION = "prod-key-456";
  refreshApiKeys();
});

test("authenticateRequest: valid Bearer token", () => {
  const req = new Request("http://localhost:8443/ingest/php", {
    method: "POST",
    headers: {
      "Authorization": "Bearer test-key-123",
    },
  });

  const result = authenticateRequest(req);

  expect(result.isValid).toBe(true);
  expect(result.projectKey).toBe("testproject");
  expect(result.error).toBeUndefined();
});

test("authenticateRequest: different valid API key", () => {
  const req = new Request("http://localhost:8443/ingest/php", {
    method: "POST",
    headers: {
      "Authorization": "Bearer prod-key-456",
    },
  });

  const result = authenticateRequest(req);

  expect(result.isValid).toBe(true);
  expect(result.projectKey).toBe("production");
  expect(result.error).toBeUndefined();
});

test("authenticateRequest: invalid API key", () => {
  const req = new Request("http://localhost:8443/ingest/php", {
    method: "POST",
    headers: {
      "Authorization": "Bearer invalid-key",
    },
  });

  const result = authenticateRequest(req);

  expect(result.isValid).toBe(false);
  expect(result.projectKey).toBe("");
  expect(result.error).toBe("Invalid API key");
});

test("authenticateRequest: missing Authorization header", () => {
  const req = new Request("http://localhost:8443/ingest/php", {
    method: "POST",
  });

  const result = authenticateRequest(req);

  expect(result.isValid).toBe(false);
  expect(result.projectKey).toBe("");
  expect(result.error).toBe("Missing Authorization header");
});

test("authenticateRequest: missing Bearer prefix", () => {
  const req = new Request("http://localhost:8443/ingest/php", {
    method: "POST",
    headers: {
      "Authorization": "test-key-123",
    },
  });

  const result = authenticateRequest(req);

  expect(result.isValid).toBe(false);
  expect(result.projectKey).toBe("");
  expect(result.error).toBe("Missing Bearer token");
});

test("authenticateRequest: empty API key after Bearer", () => {
  // Note: Request headers trim trailing spaces, so we use a different approach
  // to test empty API key - sending "Bearer" followed by space and empty content
  const req = new Request("http://localhost:8443/ingest/php", {
    method: "POST",
    headers: {
      "Authorization": "Bearer  ",  // Double space gets trimmed to single, then empty after "Bearer "
    },
  });

  const result = authenticateRequest(req);

  expect(result.isValid).toBe(false);
  expect(result.projectKey).toBe("");
  // HTTP headers trim trailing whitespace, so "Bearer " becomes "Bearer"
  // This actually triggers "Missing Bearer token" not "Empty API key"
  expect(result.error).toBe("Missing Bearer token");
});

test("getApiKeyCount: returns correct count", () => {
  expect(getApiKeyCount()).toBe(2);
});
