/**
 * Postgres Agent Ingestion Handler
 *
 * Handles POST /ingest/postgres requests from Postgres monitoring agent.
 * Authenticates, validates, and stores database metrics in SQLite.
 *
 * Phase 5 will implement the actual Postgres agent.
 * This handler provides the server-side endpoint.
 */

import { authenticateRequest } from "../middleware/auth.ts";
import { PostgresPayloadSchema, type PostgresPayload } from "../middleware/validation.ts";
import { insertProfilingData } from "../database/queries.ts";

/**
 * Handle Postgres agent ingestion request
 *
 * Flow:
 * 1. Authenticate via Bearer token
 * 2. Parse JSON payload
 * 3. Validate against schema
 * 4. Store in database
 * 5. Return success/error response
 *
 * @param req HTTP request with Postgres monitoring data
 * @returns HTTP response (200 OK, 400 Bad Request, 401 Unauthorized)
 */
export async function handlePostgresAgent(req: Request): Promise<Response> {
  // Step 1: Authentication
  const auth = authenticateRequest(req);

  if (!auth.isValid) {
    console.error("[Postgres Agent] Authentication failed:", auth.error);
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
        message: auth.error || "Invalid authentication",
      }),
      {
        status: 401,
        headers: { "content-type": "application/json" },
      }
    );
  }

  // Step 2: Parse JSON
  let body: unknown;
  try {
    body = await req.json();
  } catch (err) {
    console.error("[Postgres Agent] JSON parse error:", err);
    return new Response(
      JSON.stringify({
        error: "Bad Request",
        message: "Invalid JSON payload",
        details: err instanceof Error ? err.message : String(err),
      }),
      {
        status: 400,
        headers: { "content-type": "application/json" },
      }
    );
  }

  // Step 3: Validate schema
  const validation = PostgresPayloadSchema.safeParse(body);

  if (!validation.success) {
    console.error("[Postgres Agent] Validation failed:", validation.error.format());
    return new Response(
      JSON.stringify({
        error: "Bad Request",
        message: "Payload validation failed",
        details: validation.error.format(),
      }),
      {
        status: 400,
        headers: { "content-type": "application/json" },
      }
    );
  }

  const payload: PostgresPayload = validation.data;

  // Step 4: Store in database
  try {
    const rowId = insertProfilingData({
      correlation_id: payload.correlation_id || "",  // Postgres data may not have correlation
      project: auth.projectKey,  // Use authenticated project, not payload.project
      source: "postgres_agent",
      timestamp: payload.timestamp,
      duration_ms: null,  // DB metrics don't have request duration
      payload: JSON.stringify(payload),
    });

    console.log(
      `[Postgres Agent] Stored monitoring data: project=${auth.projectKey}, ` +
      `source=${payload.source}, row_id=${rowId}`
    );

    // Step 5: Success response
    return new Response(
      JSON.stringify({
        success: true,
        row_id: rowId,
        source: payload.source,
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );
  } catch (err) {
    console.error("[Postgres Agent] Database error:", err);
    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        message: "Failed to store monitoring data",
        details: err instanceof Error ? err.message : String(err),
      }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      }
    );
  }
}
