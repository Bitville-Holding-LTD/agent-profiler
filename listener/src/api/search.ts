/**
 * Search API Endpoint
 *
 * Provides REST API for querying profiling data with filters and pagination.
 *
 * Endpoints:
 * - GET /api/search - Search profiling records with filters
 * - GET /api/projects - List unique project names
 *
 * Features:
 * - Zod schema validation for query parameters
 * - Cursor-based pagination
 * - CORS headers for browser access
 * - Detailed validation error messages
 */

import { z } from "zod";
import { paginatedSearch, getProjects, getStatistics } from "../database/search-queries.ts";

/**
 * Zod schema for search query parameters
 *
 * Validates and coerces query string values to correct types.
 */
export const SearchParamsSchema = z.object({
  project: z.string().optional(),
  source: z.enum(["php_agent", "postgres_agent"]).optional(),
  correlation_id: z.string().optional(),
  url: z.string().optional(),
  duration_min: z.coerce.number().positive().optional(),
  duration_max: z.coerce.number().positive().optional(),
  timestamp_start: z.coerce.number().optional(),
  timestamp_end: z.coerce.number().optional(),
  after: z.coerce.number().optional(), // Cursor for pagination
  limit: z.coerce.number().min(1).max(100).default(50),
});

export type SearchParamsType = z.infer<typeof SearchParamsSchema>;

/**
 * Handle search API requests
 *
 * Validates query parameters and returns filtered profiling data.
 *
 * @param req - HTTP request
 * @returns JSON response with search results or validation error
 */
export function handleSearch(req: Request): Response {
  try {
    const url = new URL(req.url);

    // Parse query parameters from URL
    const rawParams: Record<string, any> = {};
    for (const [key, value] of url.searchParams.entries()) {
      rawParams[key] = value;
    }

    // Validate with Zod schema
    const parseResult = SearchParamsSchema.safeParse(rawParams);

    if (!parseResult.success) {
      // Return validation errors
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: parseResult.error.errors,
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Execute search query
    const params = parseResult.data;
    const result = paginatedSearch(params);

    // Return search results
    return new Response(
      JSON.stringify({
        items: result.items,
        cursor: result.cursor,
        hasMore: result.cursor !== null,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error: any) {
    console.error("[Search API] Error:", error);

    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        message: error.message,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}

/**
 * Handle projects list API requests
 *
 * Returns list of unique project names for filter dropdown.
 *
 * @param req - HTTP request
 * @returns JSON response with project list
 */
export function handleGetProjects(req: Request): Response {
  try {
    const projects = getProjects();

    return new Response(
      JSON.stringify({
        projects,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error: any) {
    console.error("[Projects API] Error:", error);

    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        message: error.message,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}

/**
 * Handle statistics API requests
 *
 * Returns aggregate statistics about profiling data.
 *
 * @param req - HTTP request
 * @returns JSON response with statistics
 */
export function handleGetStatistics(req: Request): Response {
  try {
    const url = new URL(req.url);
    const project = url.searchParams.get("project") || undefined;

    const stats = getStatistics(project);

    return new Response(
      JSON.stringify(stats),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error: any) {
    console.error("[Statistics API] Error:", error);

    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        message: error.message,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}
