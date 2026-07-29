// backend/src/services/settlementScheduler.ts
//
// Scheduled job for settlement batch processing.
// Runs daily at 2:00 AM IST.
// Prevents overlapping executions.

import cron from 'node-cron';
import { logger } from '../utils/logger';
import { processSettlementBatch } from './settlementService';

// ─── Overlap Prevention ──────────────────────────────────────────────────────

let settlementRunning = false;

// ─── Settlement Batch Job (Daily 2:00 AM IST) ────────────────────────────────

async function runSettlementBatch(dryRun = false) {
    if (settlementRunning) {
        logger.warn('Settlement batch job skipped — previous execution still running');
        return;
    }

    settlementRunning = true;
    const startTime = Date.now();
    const mode = dryRun ? ' [DRY RUN]' : '';

    try {
        logger.info(`Settlement batch job started${mode}`, { dry_run: dryRun });

        const result = await processSettlementBatch(dryRun);

        const durationMs = Date.now() - startTime;
        logger.info(`Settlement batch job completed${mode}`, {
            total: result.total,
            settled: result.settled,
            skipped: result.skipped,
            failed: result.failed,
            duration_ms: durationMs,
            error_count: result.errors.length,
            dry_run: dryRun,
        });

        if (result.errors.length > 0) {
            logger.warn('Settlement batch had merchant-level errors', {
                error_count: result.errors.length,
                first_error: result.errors[0]?.error,
            });
        }
    } catch (err) {
        const durationMs = Date.now() - startTime;
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error(`Settlement batch job failed${mode}`, undefined, {
            error: errorMsg,
            duration_ms: durationMs,
        });
    } finally {
        settlementRunning = false;
    }
}

// ─── Scheduler Startup ───────────────────────────────────────────────────────

/**
 * Start the settlement batch scheduler.
 * Reads SETTLEMENT_DRY_RUN env var for dry-run mode.
 */
export function startScheduler() {
    const dryRun = process.env.SETTLEMENT_DRY_RUN === 'true';

    const task = cron.schedule('0 2 * * *', () => runSettlementBatch(dryRun), {
        timezone: 'Asia/Kolkata',
    });

    logger.info('Settlement scheduler started', {
        cron: '0 2 * * * (2:00 AM IST daily)',
        timezone: 'Asia/Kolkata',
        dry_run: dryRun,
    });

    const shutdown = () => {
        logger.info('Settlement scheduler shutting down');
        task.stop();
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}

/**
 * Run settlement batch manually (for testing / admin trigger).
 * Returns the result without starting a cron job.
 */
export async function runSettlementBatchManual(dryRun = false) {
    return runSettlementBatch(dryRun);
}
