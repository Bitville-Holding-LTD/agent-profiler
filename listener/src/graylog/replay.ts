/**
 * Replay Mechanism for Unforwarded Records
 *
 * Processes buffered profiling data when Graylog recovers:
 * - FIFO order (oldest first)
 * - Batch processing to avoid overwhelming Graylog
 * - Clean exit when circuit breaker opens mid-replay
 *
 * Requirements covered:
 * - GELF-04: Buffer in SQLite during Graylog outages and replay when available
 */

import { getUnforwardedRecords, getUnforwardedCount } from "../database/queries.ts";
import { forwardToGraylog } from "./forwarder.ts";
import { isCircuitOpen } from "./circuit-breaker.ts";
import { isGraylogEnabled } from "./client.ts";

// Replay configuration
const BATCH_SIZE = 100;       // Records per batch
const BATCH_DELAY_MS = 100;   // Pause between batches to avoid overwhelming Graylog

let isReplaying = false;
let lastReplayStats = {
  started: null as Date | null,
  completed: null as Date | null,
  processed: 0,
  errors: 0,
  interrupted: false,
};

/**
 * Replay all unforwarded records to Graylog
 *
 * Called when circuit breaker closes (Graylog recovers).
 * Processes in FIFO order, stops cleanly if circuit opens.
 */
export async function replayUnforwardedRecords(): Promise<void> {
  // Prevent concurrent replays
  if (isReplaying) {
    console.log("[Replay] Replay already in progress, skipping");
    return;
  }

  // Check if Graylog is enabled
  if (!isGraylogEnabled()) {
    console.log("[Replay] Graylog disabled, skipping replay");
    return;
  }

  // Check initial count
  const totalPending = getUnforwardedCount();
  if (totalPending === 0) {
    console.log("[Replay] No unforwarded records to replay");
    return;
  }

  isReplaying = true;
  lastReplayStats = {
    started: new Date(),
    completed: null,
    processed: 0,
    errors: 0,
    interrupted: false,
  };

  console.log(`[Replay] Starting replay of ${totalPending} buffered records...`);

  try {
    let batchCount = 0;

    while (true) {
      // Check if circuit opened (Graylog failed again)
      if (isCircuitOpen()) {
        console.log("[Replay] Circuit breaker opened, stopping replay");
        lastReplayStats.interrupted = true;
        break;
      }

      // Fetch next batch of unforwarded records
      const records = getUnforwardedRecords(BATCH_SIZE);

      if (records.length === 0) {
        // All records processed
        break;
      }

      batchCount++;
      console.log(`[Replay] Processing batch ${batchCount} (${records.length} records)...`);

      // Process each record in the batch
      for (const record of records) {
        // Check circuit before each send
        if (isCircuitOpen()) {
          console.log("[Replay] Circuit breaker opened mid-batch, stopping replay");
          lastReplayStats.interrupted = true;
          break;
        }

        try {
          await forwardToGraylog(record.id, record);
          lastReplayStats.processed++;
        } catch (err) {
          console.error(`[Replay] Failed to forward record ${record.id}:`, err);
          lastReplayStats.errors++;
          // Continue with next record, circuit breaker will open if needed
        }
      }

      // If circuit opened during batch, exit outer loop
      if (lastReplayStats.interrupted) {
        break;
      }

      // Brief pause between batches to avoid overwhelming Graylog
      if (records.length === BATCH_SIZE) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }
  } finally {
    isReplaying = false;
    lastReplayStats.completed = new Date();

    const duration = lastReplayStats.completed.getTime() - lastReplayStats.started!.getTime();
    console.log(
      `[Replay] Complete: ${lastReplayStats.processed} processed, ` +
      `${lastReplayStats.errors} errors, ${duration}ms` +
      (lastReplayStats.interrupted ? " (interrupted)" : "")
    );
  }
}

/**
 * Get replay status for health checks
 */
export function getReplayStatus(): {
  isReplaying: boolean;
  pendingCount: number;
  lastReplay: {
    started: string | null;
    completed: string | null;
    processed: number;
    errors: number;
    interrupted: boolean;
  };
} {
  return {
    isReplaying,
    pendingCount: getUnforwardedCount(),
    lastReplay: {
      started: lastReplayStats.started?.toISOString() || null,
      completed: lastReplayStats.completed?.toISOString() || null,
      processed: lastReplayStats.processed,
      errors: lastReplayStats.errors,
      interrupted: lastReplayStats.interrupted,
    },
  };
}

/**
 * Check if replay is currently in progress
 */
export function isReplayInProgress(): boolean {
  return isReplaying;
}
