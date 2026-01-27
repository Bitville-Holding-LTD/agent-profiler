<?php
/**
 * Correlation ID Generator - Bitville APM
 *
 * Generates RFC 4122 UUID v4 compliant correlation IDs for linking
 * PHP requests to database activity.
 *
 * Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 * Where y = 8, 9, A, or B (variant bits)
 */

/**
 * Generate RFC 4122 UUID v4 compliant correlation ID
 *
 * Creates a globally unique identifier for correlating PHP requests
 * with database queries. Format matches UUID v4 specification with
 * proper version and variant bits.
 *
 * @return string UUID v4 format correlation ID
 */
function generate_correlation_id(): string
{
    try {
        // UUID v4 format with proper variant/version bits
        // Version 4 (random): Set bits 12-15 of time_hi_and_version to 0100
        // Variant (RFC 4122): Set bits 6-7 of clock_seq_hi_and_reserved to 10
        return sprintf(
            '%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0, 0xffff), mt_rand(0, 0xffff),  // 32 bits for time_low
            mt_rand(0, 0xffff),                        // 16 bits for time_mid
            mt_rand(0, 0x0fff) | 0x4000,              // 16 bits: 4 bits version (0100) + 12 bits time_hi
            mt_rand(0, 0x3fff) | 0x8000,              // 16 bits: 2 bits variant (10) + 14 bits clock_seq
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)  // 48 bits for node
        );
    } catch (\Throwable $e) {
        error_log("Bitville APM: Correlation ID generation failed - " . $e->getMessage());
        // Fallback to timestamp-based unique ID
        return 'fallback-' . uniqid('', true);
    }
}

/**
 * Format correlation ID as SQL comment
 *
 * Creates a SQL-safe comment that can be prepended to queries for
 * correlation with PHP requests. Postgres will log these comments.
 *
 * @param string $correlationId UUID v4 correlation ID
 * @return string SQL comment string
 */
function format_sql_comment(string $correlationId): string
{
    try {
        // SQL-safe comment format
        // Example: /* correlation:550e8400-e29b-41d4-a716-446655440000 */
        return "/* correlation:{$correlationId} */";
    } catch (\Throwable $e) {
        error_log("Bitville APM: SQL comment format failed");
        return '';
    }
}

/**
 * Extract correlation ID from SQL comment
 *
 * Parses SQL query to extract correlation ID from comment format.
 * Used for testing and debugging.
 *
 * @param string $sql SQL query string with or without comment
 * @return string|null Correlation ID if found, null otherwise
 */
function extract_correlation_from_comment(string $sql): ?string
{
    try {
        // Match format: /* correlation:uuid */
        if (preg_match('/\/\*\s*correlation:([a-f0-9-]+)\s*\*\//i', $sql, $matches)) {
            return $matches[1];
        }
        return null;
    } catch (\Throwable $e) {
        error_log("Bitville APM: Correlation extraction failed");
        return null;
    }
}
