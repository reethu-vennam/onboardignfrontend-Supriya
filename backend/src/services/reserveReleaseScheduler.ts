// backend/src/services/reserveReleaseScheduler.ts
//
// Scheduled job for rolling reserve release.
// Runs daily at 3:00 AM IST.
// Prevents overlapping executions.

import cron from 'node-cron';
import { logger } from '../utils/logger';
import { releaseReserve } from './settlementService';

// ─── Overlap Prevention ──────────────────────────────────────────────────────

let reserveReleaseRunning = false;

// ─── Reserve Release Job (Daily 3:00 AM IST) ─────────────────────────────────

async function runReserveRelease(dryRun = false) {
    if (reserveReleaseRunning) {
        logger.warn('Reserve release job skipped — previous execution still running');
        return;
    }

    reserveReleaseRunning = true;
    const startTime = Date.now();
    const mode = dryRun ? ' [DRY RUN]' : '';

    try {
        logger.info(`Reserve release job started${mode}`);

        const result = await releaseReserve();

        const durationMs = Date.now() - startTime;
        logger.info(`Reserve release job completed${mode}`, {
            released_count: result.released_count,
            released_amount: result.released_amount,
            failed_count: result.errors.length,
            duration_ms: durationMs,
            dry_run: dryRun,
        });

        if (result.errors.length > 0) {
            logger.warn('Reserve release had errors', {
                error_count: result.errors.length,
                first_error: result.errors[0]?.error,
            });
        }
    } catch (err) {
        const durationMs = Date.now() - startTime;
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error(`Reserve release job failed${mode}`, undefined, {
            error: errorMsg,
            duration_ms: durationMs,
        });
    } finally {
        reserveReleaseRunning = false;
    }
}

// ─── Scheduler Startup ───────────────────────────────────────────────────────

/**
 * Start the reserve release scheduler.
 * Reads SETTLEMENT_DRY_RUN env var for dry-run mode.
 */
export function startReserveReleaseScheduler() {
    const dryRun = process.env.SETTLEMENT_DRY_RUN === 'true';

    const task = cron.schedule('0 3 * * *', () => runReserveRelease(dryRun), {
        timezone: 'Asia/Kolkata',
    });

    logger.info('Reserve release scheduler started', {
        cron: '0 3 * * * (3:00 AM IST daily)',
        timezone: 'Asia/Kolkata',
        dry_run: dryRun,
    });

    const shutdown = () => {
        logger.info('Reserve release scheduler shutting down');
        task.stop();
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}

/**
 * Run reserve release manually (for testing / admin trigger).
 * Returns the result without starting a cron job.
 */
export async function runReserveReleaseManual(dryRun = false) {
    return runReserveRelease(dryRun);
}
