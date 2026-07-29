// backend/src/services/settlementService.ts
//
// Core settlement processing service.
// Calculates gross settlement, MDR deductions, rolling reserve, and net payout.
// Source of truth: MariaDB for amounts, Supabase for config and settlement records.

import { getAdminClient } from '../routes/supabase';
import { logger } from '../utils/logger';
import { NotFoundError, ConflictError, BadRequestError } from '../utils/errors';
import {
    getUnsettledTransactionsForSettlement,
} from './mariadb';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MerchantSettlementConfig {
    id: string;
    user_id: string;
    full_name: string;
    email: string;
    distributor_id: string;
    commission: number | null;
    rolling_reserve_enabled: boolean;
    rolling_reserve_percentage: number | null;
    rolling_reserve_fixed_inr: number | null;
    settlement_cycle_days: number;
    settlement_terms_locked: boolean;
    pending_settlement_amount: number;
    total_settled_amount: number;
    last_settled_at: string | null;
}

export interface MariaDBTransaction {
    id: string;
    order_reference: string;
    client_id: string;
    amount_requested: string;
    amount_final: string;
    currency: string;
    status: string;
    completed_at: string;
    deduction_percentage: string;
    net_amount_debit: string;
    bank_ref_num: string;
    txnid: string;
}

export interface SettlementCalculation {
    gross_amount: number;
    mdr_deduction: number;
    rolling_reserve_held: number;
    net_settlement_amount: number;
    transaction_count: number;
    transaction_refs: Array<{
        mariaDB_id: string;
        order_reference: string;
        amount: number;
        completed_at: string;
    }>;
}

export interface SettlementResult {
    merchant_id: string;
    distributor_id: string;
    settlement_batch_ref: string;
    calculation: SettlementCalculation;
    settlement_history_id: string;
    locked_terms: boolean;
}

export interface SettlementPreview {
    merchant_id: string;
    merchant_name: string;
    email: string;
    settlement_cycle_days: number;
    eligible_transaction_count: number;
    calculation: SettlementCalculation;
}

// ─── Business Day Calculation ────────────────────────────────────────────────

function addBusinessDays(startDate: Date, days: number): Date {
    const result = new Date(startDate);
    let added = 0;
    while (added < days) {
        result.setDate(result.getDate() + 1);
        const day = result.getDay();
        if (day !== 0 && day !== 6) {
            added++;
        }
    }
    return result;
}

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Get all eligible merchants for settlement.
 * Returns merchants that are not yet locked and have a distributor.
 */
export async function getEligibleMerchants(): Promise<MerchantSettlementConfig[]> {
    const admin = getAdminClient();

    const { data, error } = await admin
        .from('merchant_profiles')
        .select(`
            id, user_id, full_name, email, distributor_id, commission,
            rolling_reserve_enabled, rolling_reserve_percentage, rolling_reserve_fixed_inr,
            settlement_cycle_days, settlement_terms_locked,
            pending_settlement_amount, total_settled_amount, last_settled_at
        `)
        .eq('settlement_terms_locked', false)
        .not('distributor_id', 'is', null)
        .not('email', 'is', null);

    if (error) throw new Error(`Failed to fetch eligible merchants: ${error.message}`);
    return (data || []) as MerchantSettlementConfig[];
}

/**
 * Get a single merchant's settlement config.
 */
export async function getMerchantConfig(merchantId: string): Promise<MerchantSettlementConfig | null> {
    const admin = getAdminClient();

    const { data, error } = await admin
        .from('merchant_profiles')
        .select(`
            id, user_id, full_name, email, distributor_id, commission,
            rolling_reserve_enabled, rolling_reserve_percentage, rolling_reserve_fixed_inr,
            settlement_cycle_days, settlement_terms_locked,
            pending_settlement_amount, total_settled_amount, last_settled_at
        `)
        .eq('id', merchantId)
        .single();

    if (error || !data) return null;
    return data as MerchantSettlementConfig;
}

/**
 * Resolve MariaDB client_id from merchant profile.
 * Since client_profile.client_id = auth.users.id = merchant_profiles.user_id,
 * this is a direct UUID match — no DB query needed.
 */
function resolveClientId(merchant: MerchantSettlementConfig): string {
    return merchant.user_id;
}

/**
 * Get already-settled MariaDB transaction IDs for a merchant.
 * Queries settlement_history.transaction_refs (JSONB array of {mariaDB_id: ...}).
 * Returns a Set of MariaDB transaction IDs that have been settled.
 */
async function getSettledTransactionIds(merchantId: string): Promise<Set<string>> {
    const admin = getAdminClient();

    const { data, error } = await admin
        .from('settlement_history')
        .select('transaction_refs')
        .eq('merchant_id', merchantId)
        .eq('status', 'processed');

    if (error) throw new Error(`Failed to fetch settled transactions: ${error.message}`);
    if (!data) return new Set();

    const settledIds = new Set<string>();
    for (const record of data) {
        if (Array.isArray(record.transaction_refs)) {
            for (const ref of record.transaction_refs) {
                if (ref.mariaDB_id) {
                    settledIds.add(ref.mariaDB_id);
                }
            }
        }
    }
    return settledIds;
}

/**
 * Get pending transactions for a merchant from MariaDB.
 * Cutoff date = now - settlement_cycle_days.
 * Excludes transactions already settled (present in settlement_history.transaction_refs).
 * Accepts merchantId directly — resolves clientId internally.
 */
export async function getPendingTransactions(merchantId: string): Promise<MariaDBTransaction[]> {
    const merchant = await getMerchantConfig(merchantId);
    if (!merchant) throw new NotFoundError(`Merchant not found: ${merchantId}`, 'MERCHANT_NOT_FOUND');

    const clientId = resolveClientId(merchant);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - merchant.settlement_cycle_days);

    const allTransactions = await getUnsettledTransactionsForSettlement([clientId], cutoffDate);

    if (allTransactions.length === 0) return allTransactions;

    // Filter out already-settled transactions
    const settledIds = await getSettledTransactionIds(merchantId);
    if (settledIds.size === 0) return allTransactions;

    return allTransactions.filter((tx) => !settledIds.has(tx.id));
}

// ─── Pure Calculation Functions ──────────────────────────────────────────────

/**
 * Sum of transaction amounts (amount_final, falling back to amount_requested).
 */
export function getGrossSettlement(transactions: MariaDBTransaction[]): number {
    let gross = 0;
    for (const tx of transactions) {
        gross += parseFloat(tx.amount_final || tx.amount_requested || '0') || 0;
    }
    return Math.round(gross * 100) / 100;
}

/**
 * Sum of MDR deductions across all transactions.
 * MDR per transaction = amount_final * deduction_percentage / 100.
 */
export function getMDRDeduction(transactions: MariaDBTransaction[]): number {
    let totalMDR = 0;
    for (const tx of transactions) {
        const amountFinal = parseFloat(tx.amount_final || tx.amount_requested || '0') || 0;
        const deductionPct = parseFloat(tx.deduction_percentage || '0') || 0;
        totalMDR += amountFinal * deductionPct / 100;
    }
    return Math.round(totalMDR * 100) / 100;
}

/**
 * Calculate rolling reserve amount based on merchant config.
 * If percentage-based: reserve = gross * percentage / 100
 * If fixed INR: reserve = fixed amount
 * Capped at (gross - MDR) — can't reserve more than available.
 */
export function getRollingReserve(
    grossAmount: number,
    merchantConfig: Pick<MerchantSettlementConfig, 'rolling_reserve_enabled' | 'rolling_reserve_percentage' | 'rolling_reserve_fixed_inr'>,
    mdrDeduction = 0
): number {
    if (!merchantConfig.rolling_reserve_enabled) return 0;

    let reserve = 0;
    if (merchantConfig.rolling_reserve_percentage && merchantConfig.rolling_reserve_percentage > 0) {
        reserve = grossAmount * merchantConfig.rolling_reserve_percentage / 100;
    } else if (merchantConfig.rolling_reserve_fixed_inr && merchantConfig.rolling_reserve_fixed_inr > 0) {
        reserve = merchantConfig.rolling_reserve_fixed_inr;
    }

    const maxReserve = grossAmount - mdrDeduction;
    reserve = Math.min(reserve, Math.max(maxReserve, 0));
    return Math.round(reserve * 100) / 100;
}

/**
 * Net settlement amount = gross - MDR - reserve.
 */
export function getNetSettlement(grossAmount: number, mdrDeduction: number, reserveAmount: number): number {
    return Math.round((grossAmount - mdrDeduction - reserveAmount) * 100) / 100;
}

/**
 * Calculate full settlement breakdown for a set of transactions.
 * Composite function calling the individual pure functions above.
 */
export function calculateSettlement(
    transactions: MariaDBTransaction[],
    merchantConfig: MerchantSettlementConfig
): SettlementCalculation {
    const grossAmount = getGrossSettlement(transactions);
    const totalMDR = getMDRDeduction(transactions);
    const rollingReserveHeld = getRollingReserve(grossAmount, merchantConfig, totalMDR);
    const netSettlementAmount = getNetSettlement(grossAmount, totalMDR, rollingReserveHeld);

    const transactionRefs: SettlementCalculation['transaction_refs'] = transactions.map((tx) => ({
        mariaDB_id: tx.id,
        order_reference: tx.order_reference || tx.id,
        amount: parseFloat(tx.amount_final || tx.amount_requested || '0') || 0,
        completed_at: tx.completed_at,
    }));

    return {
        gross_amount: grossAmount,
        mdr_deduction: totalMDR,
        rolling_reserve_held: rollingReserveHeld,
        net_settlement_amount: netSettlementAmount,
        transaction_count: transactions.length,
        transaction_refs: transactionRefs,
    };
}

/**
 * Generate a unique settlement batch reference.
 */
function generateBatchRef(): string {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toISOString().slice(11, 19).replace(/:/g, '');
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `SETL-${dateStr}-${timeStr}-${random}`;
}

/**
 * Lock settlement terms for a merchant after first successful settlement.
 */
export async function lockSettlementTerms(merchantId: string): Promise<void> {
    const admin = getAdminClient();
    const { error } = await admin
        .from('merchant_profiles')
        .update({ settlement_terms_locked: true })
        .eq('id', merchantId);

    if (error) throw new Error(`Failed to lock settlement terms: ${error.message}`);
}

/**
 * Create a rolling reserve ledger entry.
 * Inserts with status='held', release_date = reserve_date + 15 business days.
 * Throws on failure — caller should handle before committing settlement history.
 */
export async function createReserveLedgerEntry(params: {
    merchantId: string;
    distributorId: string;
    batchRef: string;
    grossAmount: number;
    reserveAmount: number;
    settlementCycleDays: number;
}): Promise<void> {
    const admin = getAdminClient();
    const releaseDate = addBusinessDays(new Date(), 15);

    const { error } = await admin
        .from('rolling_reserve_ledger')
        .insert({
            merchant_id: params.merchantId,
            distributor_id: params.distributorId,
            transaction_ref: params.batchRef,
            gross_settlement_amount: params.grossAmount,
            reserve_amount: params.reserveAmount,
            reserve_date: new Date().toISOString().slice(0, 10),
            release_date: releaseDate.toISOString().slice(0, 10),
            status: 'held',
            settlement_cycle_days: params.settlementCycleDays,
        });

    if (error) throw new Error(`Failed to create reserve ledger entry: ${error.message}`);
}

/**
 * Process settlement for a single merchant.
 * Returns the settlement result or null if no eligible transactions.
 */
export async function processSettlementForMerchant(
    merchantId: string,
    dryRun = false
): Promise<SettlementResult | null> {
    const merchant = await getMerchantConfig(merchantId);
    if (!merchant) {
        throw new NotFoundError(`Merchant not found: ${merchantId}`, 'MERCHANT_NOT_FOUND');
    }

    if (merchant.settlement_terms_locked) {
        throw new ConflictError(
            `Settlement terms are locked for merchant: ${merchantId}`,
            'SETTLEMENT_TERMS_LOCKED'
        );
    }

    const transactions = await getPendingTransactions(merchantId);

    if (transactions.length === 0) {
        logger.info(`No eligible transactions for merchant ${merchantId}`);
        return null;
    }

    const calculation = calculateSettlement(transactions, merchant);

    if (calculation.gross_amount <= 0) {
        logger.info(`Zero gross amount for merchant ${merchantId}, skipping`);
        return null;
    }

    if (dryRun) {
        return {
            merchant_id: merchantId,
            distributor_id: merchant.distributor_id,
            settlement_batch_ref: 'DRY-RUN',
            calculation,
            settlement_history_id: 'dry-run',
            locked_terms: false,
        };
    }

    // Duplicate protection: re-check settlement history right before processing
    // to prevent double-execution from concurrent requests
    const settledIds = await getSettledTransactionIds(merchantId);
    const alreadySettled = transactions.filter((tx) => settledIds.has(tx.id));
    if (alreadySettled.length > 0) {
        throw new ConflictError(
            `Transaction(s) already settled for merchant ${merchantId}`,
            'SETTLEMENT_ALREADY_PROCESSED'
        );
    }

    const admin = getAdminClient();
    const batchRef = generateBatchRef();

    // 1. Create reserve ledger entry FIRST (throws on failure, nothing committed yet)
    if (calculation.rolling_reserve_held > 0) {
        await createReserveLedgerEntry({
            merchantId,
            distributorId: merchant.distributor_id,
            batchRef,
            grossAmount: calculation.gross_amount,
            reserveAmount: calculation.rolling_reserve_held,
            settlementCycleDays: merchant.settlement_cycle_days,
        });
    }

    // 2. Insert settlement_history record
    const { data: historyRecord, error: historyError } = await admin
        .from('settlement_history')
        .insert({
            merchant_id: merchantId,
            distributor_id: merchant.distributor_id,
            settlement_batch_ref: batchRef,
            settlement_date: new Date().toISOString().slice(0, 10),
            settlement_cycle_days: merchant.settlement_cycle_days,
            gross_amount: calculation.gross_amount,
            mdr_deduction: calculation.mdr_deduction,
            rolling_reserve_held: calculation.rolling_reserve_held,
            net_settlement_amount: calculation.net_settlement_amount,
            transaction_count: calculation.transaction_count,
            transaction_refs: calculation.transaction_refs,
            status: 'processed',
            processed_at: new Date().toISOString(),
        })
        .select('id')
        .single();

    if (historyError) {
        throw new Error(`Failed to create settlement_history: ${historyError.message}`);
    }

    // 3. Lock terms + update balances atomically via RPC
    await lockSettlementTerms(merchantId);

    const { error: balanceError } = await admin.rpc('increment_merchant_balances', {
        p_merchant_id: merchantId,
        p_pending_increment: calculation.net_settlement_amount,
        p_total_increment: calculation.net_settlement_amount,
    });

    if (balanceError) {
        throw new Error(`Failed to update merchant balances: ${balanceError.message}`);
    }

    // Update last_settled_at separately (not part of atomic increment)
    const { error: lastSettledError } = await admin
        .from('merchant_profiles')
        .update({ last_settled_at: new Date().toISOString() })
        .eq('id', merchantId);

    if (lastSettledError) {
        logger.error(`Failed to update last_settled_at for merchant ${merchantId}: ${lastSettledError.message}`);
    }

    logger.info(`Settlement processed for merchant ${merchantId}`, {
        batch_ref: batchRef,
        gross: calculation.gross_amount,
        mdr: calculation.mdr_deduction,
        reserve: calculation.rolling_reserve_held,
        net: calculation.net_settlement_amount,
        transactions: calculation.transaction_count,
    });

    return {
        merchant_id: merchantId,
        distributor_id: merchant.distributor_id,
        settlement_batch_ref: batchRef,
        calculation,
        settlement_history_id: historyRecord.id,
        locked_terms: true,
    };
}

/**
 * Process settlement batch for all eligible merchants.
 */
export async function processSettlementBatch(dryRun = false): Promise<{
    total: number;
    settled: number;
    skipped: number;
    failed: number;
    results: SettlementResult[];
    errors: Array<{ merchant_id: string; error: string }>;
}> {
    const merchants = await getEligibleMerchants();
    const mode = dryRun ? ' [DRY RUN]' : '';
    logger.info(`Settlement batch started${mode}: ${merchants.length} eligible merchants`);

    const results: SettlementResult[] = [];
    const errors: Array<{ merchant_id: string; error: string }> = [];
    let settled = 0;
    let skipped = 0;
    let failed = 0;

    for (const merchant of merchants) {
        try {
            const result = await processSettlementForMerchant(merchant.id, dryRun);
            if (result) {
                results.push(result);
                settled++;
            } else {
                skipped++;
            }
        } catch (err) {
            failed++;
            const errorMsg = err instanceof Error ? err.message : String(err);
            errors.push({ merchant_id: merchant.id, error: errorMsg });
            logger.error(`Settlement failed for merchant ${merchant.id}: ${errorMsg}`);
        }
    }

    logger.info(`Settlement batch completed${mode}: ${settled} settled, ${skipped} skipped, ${failed} failed`);

    return {
        total: merchants.length,
        settled,
        skipped,
        failed,
        results,
        errors,
    };
}

/**
 * Get settlement history for a merchant.
 */
export async function getSettlementHistory(
    merchantId: string,
    page = 1,
    limit = 20
): Promise<{ data: any[]; total: number; page: number; limit: number }> {
    const admin = getAdminClient();
    const offset = (page - 1) * limit;

    const { count } = await admin
        .from('settlement_history')
        .select('*', { count: 'exact', head: true })
        .eq('merchant_id', merchantId);

    const { data, error } = await admin
        .from('settlement_history')
        .select('*')
        .eq('merchant_id', merchantId)
        .order('settlement_date', { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) throw new Error(`Failed to fetch settlement history: ${error.message}`);

    return {
        data: data || [],
        total: count || 0,
        page,
        limit,
    };
}

/**
 * Get settlement summary for a merchant.
 */
export async function getSettlementSummary(merchantId: string): Promise<{
    total_settled_amount: number;
    total_settlements: number;
    total_gross_amount: number;
    total_mdr_deduction: number;
    total_reserve_held: number;
    pending_settlement_amount: number;
    last_settled_at: string | null;
    merchant: MerchantSettlementConfig | null;
}> {
    const admin = getAdminClient();

    const merchant = await getMerchantConfig(merchantId);

    const { data, error } = await admin
        .from('settlement_history')
        .select('gross_amount, mdr_deduction, rolling_reserve_held, net_settlement_amount')
        .eq('merchant_id', merchantId)
        .eq('status', 'processed');

    if (error) throw new Error(`Failed to fetch settlement summary: ${error.message}`);

    const records = data || [];

    // Query current outstanding reserve from rolling_reserve_ledger (status = 'held')
    // This reflects actual amounts after chargeback debits, unlike settlement_history which stores historical values.
    const { data: reserveEntries } = await admin
        .from('rolling_reserve_ledger')
        .select('reserve_amount')
        .eq('merchant_id', merchantId)
        .eq('status', 'held');

    const currentReserveHeld = (reserveEntries || []).reduce(
        (sum: number, r: any) => sum + (parseFloat(r.reserve_amount) || 0), 0
    );

    return {
        total_settled_amount: merchant?.total_settled_amount || 0,
        total_settlements: records.length,
        total_gross_amount: records.reduce((sum, r) => sum + (parseFloat(r.gross_amount) || 0), 0),
        total_mdr_deduction: records.reduce((sum, r) => sum + (parseFloat(r.mdr_deduction) || 0), 0),
        total_reserve_held: currentReserveHeld,
        pending_settlement_amount: merchant?.pending_settlement_amount || 0,
        last_settled_at: merchant?.last_settled_at || null,
        merchant,
    };
}

/**
 * Get rolling reserve ledger for a merchant.
 */
export async function getReserveLedger(
    merchantId: string,
    page = 1,
    limit = 20
): Promise<{ data: any[]; total: number; page: number; limit: number }> {
    const admin = getAdminClient();
    const offset = (page - 1) * limit;

    const { count } = await admin
        .from('rolling_reserve_ledger')
        .select('*', { count: 'exact', head: true })
        .eq('merchant_id', merchantId);

    const { data, error } = await admin
        .from('rolling_reserve_ledger')
        .select('*')
        .eq('merchant_id', merchantId)
        .order('reserve_date', { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) throw new Error(`Failed to fetch reserve ledger: ${error.message}`);

    return {
        data: data || [],
        total: count || 0,
        page,
        limit,
    };
}

/**
 * Preview settlement for a merchant without processing.
 */
export async function previewSettlement(merchantId: string): Promise<SettlementPreview | null> {
    const merchant = await getMerchantConfig(merchantId);
    if (!merchant) return null;

    const transactions = await getPendingTransactions(merchantId);
    if (transactions.length === 0) return null;

    const calculation = calculateSettlement(transactions, merchant);

    return {
        merchant_id: merchantId,
        merchant_name: merchant.full_name,
        email: merchant.email,
        settlement_cycle_days: merchant.settlement_cycle_days,
        eligible_transaction_count: transactions.length,
        calculation,
    };
}

// ─── Reserve Release ─────────────────────────────────────────────────────────

export interface ReserveReleaseResult {
    released_count: number;
    released_amount: number;
    errors: Array<{ ledger_id: string; error: string }>;
}

/**
 * Release rolling reserve entries whose release_date has passed.
 * Updates ledger status from 'held' to 'released' and increments
 * merchant_profiles.pending_settlement_amount + total_settled_amount
 * (the reserve was excluded from both at settlement time).
 */
export async function releaseReserve(): Promise<ReserveReleaseResult> {
    const admin = getAdminClient();
    const today = new Date().toISOString().slice(0, 10);

    // 1. Fetch all held reserves where release_date <= today
    const { data: entries, error: fetchError } = await admin
        .from('rolling_reserve_ledger')
        .select('id, merchant_id, distributor_id, reserve_amount, release_date')
        .eq('status', 'held')
        .lte('release_date', today);

    if (fetchError) {
        throw new Error(`Failed to fetch rolling_reserve_ledger: ${fetchError.message}`);
    }

    if (!entries || entries.length === 0) {
        logger.info('No reserve entries eligible for release');
        return { released_count: 0, released_amount: 0, errors: [] };
    }

    logger.info(`Reserve release batch started: ${entries.length} entries eligible`);

    let releasedCount = 0;
    let releasedAmount = 0;
    const errors: ReserveReleaseResult['errors'] = [];

    for (const entry of entries) {
        try {
            // 2. Update ledger entry status
            const { error: ledgerError } = await admin
                .from('rolling_reserve_ledger')
                .update({
                    status: 'released',
                    released_at: new Date().toISOString(),
                })
                .eq('id', entry.id);

            if (ledgerError) {
                throw new Error(`Ledger update failed: ${ledgerError.message}`);
            }

            // 3. Increment both balances atomically — reserve was excluded at settlement time
            const { error: balanceError } = await admin.rpc('increment_merchant_balances', {
                p_merchant_id: entry.merchant_id,
                p_pending_increment: entry.reserve_amount,
                p_total_increment: entry.reserve_amount,
            });

            if (balanceError) {
                throw new Error(`Merchant balance update failed: ${balanceError.message}`);
            }

            releasedCount++;
            releasedAmount += entry.reserve_amount;

            logger.info(`Reserve released for merchant ${entry.merchant_id}`, {
                ledger_id: entry.id,
                reserve_amount: entry.reserve_amount,
                release_date: entry.release_date,
            });
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            errors.push({ ledger_id: entry.id, error: errorMsg });
            logger.error(`Reserve release failed for entry ${entry.id}: ${errorMsg}`);
        }
    }

    releasedAmount = Math.round(releasedAmount * 100) / 100;

    logger.info(`Reserve release batch completed: ${releasedCount} released, ${errors.length} failed, total ${releasedAmount}`);

    return { released_count: releasedCount, released_amount: releasedAmount, errors };
}
