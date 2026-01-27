import { Cron } from "croner";
import { getDatabase } from "./connection.ts";
import { deleteOldRecords } from "./queries.ts";

// Retention period: 7 days in seconds
const RETENTION_SECONDS = 7 * 24 * 60 * 60;

let cleanupJob: Cron | null = null;

/**
 * Run cleanup immediately (for testing or manual trigger)
 * @returns Number of records deleted
 */
export function runCleanupNow(): number {
  const cutoffTime = Math.floor(Date.now() / 1000) - RETENTION_SECONDS;

  console.log(`[Cleanup] Running cleanup, deleting records older than ${new Date(cutoffTime * 1000).toISOString()}`);

  const deleted = deleteOldRecords(cutoffTime);

  console.log(`[Cleanup] Deleted ${deleted} records`);

  // Run incremental vacuum to reclaim disk space
  // This is non-blocking and reclaims up to 100 pages
  if (deleted > 0) {
    const db = getDatabase();
    if (db) {
      db.run("PRAGMA incremental_vacuum(100);");
      console.log(`[Cleanup] Incremental vacuum completed`);
    }
  }

  return deleted;
}

/**
 * Start hourly cleanup job
 * Runs at minute 0 of every hour (0 * * * *)
 */
export function startCleanupJob(): void {
  if (cleanupJob) {
    console.log("[Cleanup] Job already running");
    return;
  }

  // Run immediately on startup to clean any accumulated data
  try {
    runCleanupNow();
  } catch (error) {
    console.error("[Cleanup] Initial cleanup failed:", error);
  }

  // Schedule hourly cleanup
  cleanupJob = Cron("0 * * * *", () => {
    try {
      runCleanupNow();
    } catch (error) {
      console.error("[Cleanup] Scheduled cleanup failed:", error);
    }
  });

  console.log("[Cleanup] Hourly cleanup job started (runs at minute 0)");
}

/**
 * Stop cleanup job (for graceful shutdown)
 */
export function stopCleanupJob(): void {
  if (cleanupJob) {
    cleanupJob.stop();
    cleanupJob = null;
    console.log("[Cleanup] Job stopped");
  }
}

/**
 * Get cleanup job status
 */
export function getCleanupStatus(): {
  running: boolean;
  nextRun: Date | null;
  retentionDays: number;
} {
  return {
    running: cleanupJob !== null,
    nextRun: cleanupJob?.nextRun() ?? null,
    retentionDays: 7,
  };
}
