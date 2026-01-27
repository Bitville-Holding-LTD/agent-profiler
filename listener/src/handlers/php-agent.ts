/**
 * PHP Agent Ingestion Handler
 *
 * Handles POST /ingest/php requests from PHP agents.
 * Authenticates, validates, and stores profiling data in SQLite.
 */

import { authenticateRequest } from "../middleware/auth.ts";
import { PhpPayloadSchema, type PhpPayload } from "../middleware/validation.ts";
import { insertProfilingData } from "../database/queries.ts";
import { forwardInsertedData } from "../graylog/forwarder.ts";

/**
 * Handle PHP agent ingestion request
 *
 * Flow:
 * 1. Authenticate via Bearer token
 * 2. Parse JSON payload
 * 3. Validate against schema
 * 4. Store in database
 * 5. Return success/error response
 *
 * @param req HTTP request with PHP profiling data
 * @returns HTTP response (200 OK, 400 Bad Request, 401 Unauthorized)
 */
export async function handlePhpAgent(req: Request): Promise<Response> {
  // Step 1: Authentication
  const auth = authenticateRequest(req);

  if (!auth.isValid) {
    console.error("[PHP Agent] Authentication failed:", auth.error);
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
    console.error("[PHP Agent] JSON parse error:", err);
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
  const validation = PhpPayloadSchema.safeParse(body);

  if (!validation.success) {
    console.error("[PHP Agent] Validation failed:", validation.error.format());
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

  const payload: PhpPayload = validation.data;

  // Step 4: Store in database
  try {
    const rowId = insertProfilingData({
      correlation_id: payload.correlation_id,
      project: auth.projectKey,  // Use authenticated project, not payload.project
      source: "php_agent",
      timestamp: payload.timestamp,
      duration_ms: payload.timing?.duration_ms ?? payload.elapsed_ms,
      payload: JSON.stringify(payload),
    });

    // Fire-and-forget async forward to Graylog (don't await)
    forwardInsertedData(rowId, {
      correlation_id: payload.correlation_id,
      project: auth.projectKey,
      source: "php_agent",
      timestamp: payload.timestamp,
      duration_ms: payload.timing?.duration_ms ?? payload.elapsed_ms,
      payload: JSON.stringify(payload),
    }).catch(err => {
      // Log error but don't fail the request
      console.error(`[PHP Agent] Graylog forward failed for row ${rowId}:`, err);
    });

    console.log(
      `[PHP Agent] Stored profiling data: project=${auth.projectKey}, ` +
      `correlation_id=${payload.correlation_id}, row_id=${rowId}`
    );

    // Step 5: Success response
    return new Response(
      JSON.stringify({
        success: true,
        row_id: rowId,
        correlation_id: payload.correlation_id,
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );
  } catch (err) {
    console.error("[PHP Agent] Database error:", err);
    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        message: "Failed to store profiling data",
        details: err instanceof Error ? err.message : String(err),
      }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      }
    );
  }
}
