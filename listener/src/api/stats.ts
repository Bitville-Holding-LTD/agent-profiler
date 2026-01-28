/**
 * Statistics and Comparison API Endpoints
 *
 * Provides REST API for statistics and comparative analysis of profiling data.
 *
 * Endpoints:
 * - GET /api/stats - Aggregate statistics (overall or project-specific)
 * - GET /api/stats?url=... - URL-specific statistics with percentiles
 * - GET /api/compare?correlation_id=... - Compare request to historical averages
 *
 * Features:
 * - Zod schema validation for query parameters
 * - CORS headers for browser access
 * - Detailed validation error messages
 */

import { z } from "zod";
import {
  getUrlStatistics,
  getProjectStatistics,
  getComparisonData,
} from "../database/stats-queries.ts";

/**
 * Zod schema for stats query parameters
 *
 * Validates optional project and url filters.
 */
export const StatsParamsSchema = z.object({
  project: z.string().optional(),
  url: z.string().optional(),
});

/**
 * Zod schema for comparison query parameters
 *
 * Requires correlation_id for lookup.
 */
export const CompareParamsSchema = z.object({
  correlation_id: z.string().min(1, "correlation_id is required"),
});

/**
 * Handle statistics API requests
 *
 * Returns aggregate statistics or URL-specific metrics.
 *
 * Query patterns:
 * - GET /api/stats - Overall statistics
 * - GET /api/stats?project=myapp - Project-specific statistics
 * - GET /api/stats?project=myapp&url=/api/users - URL-specific statistics with percentiles
 *
 * @param req - HTTP request
 * @returns JSON response with statistics or validation error
 */
export function handleGetStats(req: Request): Response {
  try {
    const url = new URL(req.url);

    // Parse query parameters
    const rawParams: Record<string, any> = {};
    for (const [key, value] of url.searchParams.entries()) {
      rawParams[key] = value;
    }

    // Validate with Zod schema
    const parseResult = StatsParamsSchema.safeParse(rawParams);

    if (!parseResult.success) {
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

    const params = parseResult.data;

    // If URL parameter provided, return URL-specific statistics
    if (params.url) {
      const project = params.project || "";
      const urlStats = getUrlStatistics(project, params.url);

      if (!urlStats) {
        return new Response(
          JSON.stringify({
            error: "Not Found",
            message: "No data found for the specified URL pattern",
          }),
          {
            status: 404,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      }

      return new Response(JSON.stringify(urlStats), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // Otherwise, return project-wide statistics
    const projectStats = getProjectStatistics(params.project);

    return new Response(JSON.stringify(projectStats), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error: any) {
    console.error("[Stats API] Error:", error);

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
 * Handle comparison API requests
 *
 * Returns how a specific request compares to historical averages
 * for the same URL pattern.
 *
 * Query pattern:
 * - GET /api/compare?correlation_id=abc-123
 *
 * Response includes:
 * - Request details (correlation_id, url, duration, timestamp)
 * - Comparison metrics (avg_duration, percentile_rank, faster_than_percent, sample_size)
 *
 * @param req - HTTP request
 * @returns JSON response with comparison data or error
 */
export function handleGetComparison(req: Request): Response {
  try {
    const url = new URL(req.url);

    // Parse query parameters
    const rawParams: Record<string, any> = {};
    for (const [key, value] of url.searchParams.entries()) {
      rawParams[key] = value;
    }

    // Validate with Zod schema
    const parseResult = CompareParamsSchema.safeParse(rawParams);

    if (!parseResult.success) {
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

    const params = parseResult.data;

    // Fetch comparison data
    const comparisonData = getComparisonData(params.correlation_id);

    if (!comparisonData) {
      return new Response(
        JSON.stringify({
          error: "Not Found",
          message: "Request not found or has no duration data",
        }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    return new Response(JSON.stringify(comparisonData), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error: any) {
    console.error("[Comparison API] Error:", error);

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
