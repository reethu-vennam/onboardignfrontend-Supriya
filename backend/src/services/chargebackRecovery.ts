// backend/src/services/chargebackRecovery.ts
//
// Chargeback recovery service.
// Recovery order: held rolling reserve -> pending settlement -> merchant balance -> distributor balance
// Supports cascading: splits amount across multiple sources when one is insufficient.
// Source of truth: Supabase for chargeback records, MariaDB for transaction history

import { getAdminClient } from '../routes/supabase';
import { logger } from '../utils/logger';
import { NotFoundError, ConflictError, BadRequestError } from '../utils/errors';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Chargeback {
    id: string;
    merchant_id: string;
    amount: number;
    currency: string;
    reason: string;
    status: 'pending' | 'recovering' | 'recovered' | 'failed';
    chargeback_date: string;
    recovered_at: string | null;
    recovery_source: string | null;
    recovery_steps: RecoveryStepRecord[];
    metadata: any;
    created_at: string;
    updated_at: string;
    merchant_balance?: number;
    pending_settlement?: number;
    rolling_reserve_held?: number;
    distributor_balance?: number;
}

export interface RecoveryStepRecord {
    source: string;
    amount: number;
    description: string;
    timestamp: string;
}

export interface ChargebackRecoveryResult {
    chargeback_id: string;
    recovered_amount: number;
    recovery_steps: RecoveryStepRecord[];
    total_recovered: number;
    previous_balance: number;
    new_balance: number;
    timestamp: string;
    success: boolean;
    error?: string;
}

export interface ChargebackRecoveryPlan {
    chargeback_id: string;
    merchant_id: string;
    distributor_id?: string;
    total_amount: number;
    recovery_steps: Array<{
        source: string;
        available: number;
        to_recover: number;
        priority: number;
        description: string;
    }>;
    total_available: number;
    is_cascading: boolean;
}

export interface ChargebackHistoryEntry {
    id: string;
    chargeback_id: string;
    merchant_id: string;
    action: string;
    event_type: string;
    previous_data: any;
    current_data: any;
    recovered_amount: number | null;
    recovery_source: string | null;
    recovery_details: any;
    timestamp: string;
    performed_by: string;
    comments: string | null;
    created_at: string;
}

export interface DistributorRecoverySummary {
    distributor_id: string;
    security_deposit: number;
    available_recovery_balance: number;
    total_recovered_amount: number;
    recovery_count: number;
    recent_recoveries: Array<{
        id: string;
        chargeback_id: string;
        amount: number;
        created_at: string;
    }>;
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function getUpdatedTimestamp(): string {
    return new Date().toISOString();
}

let merchantConfigCache: Map<string, { data: any; ts: number }> = new Map();
const CACHE_TTL = 5000;

async function getMerchantConfig(merchantId: string): Promise<any> {
    const cached = merchantConfigCache.get(merchantId);
    if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

    const admin = getAdminClient();
    const { data, error } = await admin
        .from('merchant_profiles')
        .select('id, distributor_id, rolling_reserve_enabled, rolling_reserve_percentage, rolling_reserve_fixed_inr, pending_settlement_amount, total_settled_amount, total_chargeback_amount, pending_chargeback_amount, chargeback_recovery_available')
        .eq('id', merchantId)
        .single();

    if (error) {
        if (error.code === 'PGRST116') {
            throw new NotFoundError(`Merchant not found: ${merchantId}`, 'MERCHANT_NOT_FOUND');
        }
        throw new Error(`Failed to fetch merchant config: ${error.message}`);
    }
    merchantConfigCache.set(merchantId, { data, ts: Date.now() });
    return data;
}

function clearMerchantCache(merchantId: string) {
    merchantConfigCache.delete(merchantId);
}

async function getRollingReserveBalance(merchantId: string): Promise<number> {
    const admin = getAdminClient();
    const { data, error } = await admin
        .from('rolling_reserve_ledger')
        .select('reserve_amount, status')
        .eq('merchant_id', merchantId)
        .eq('status', 'held');

    if (error) throw new Error(`Failed to fetch rolling reserve balance: ${error.message}`);
    return (data || []).reduce((sum: number, entry: any) => sum + parseFloat(entry.reserve_amount), 0);
}

async function getPendingSettlement(merchantId: string): Promise<number> {
    const merchant = await getMerchantConfig(merchantId);
    return merchant?.pending_settlement_amount || 0;
}

async function getDistributorConfig(distributorId: string): Promise<any> {
    const admin = getAdminClient();
    const { data, error } = await admin
        .from('distributor_profiles')
        .select('id, security_deposit, available_recovery_balance, total_recovered_amount')
        .eq('user_id', distributorId)
        .maybeSingle();

    if (error) throw new Error(`Failed to fetch distributor config: ${error.message}`);
    return data;
}

async function getDistributorBalance(distributorId: string): Promise<number> {
    const config = await getDistributorConfig(distributorId);
    return config?.available_recovery_balance || 0;
}

// ─── Recovery Plan ────────────────────────────────────────────────────────────

async function createRecoveryPlan(chargebackId: string, merchantId: string, amount: number): Promise<ChargebackRecoveryPlan> {
    const merchant = await getMerchantConfig(merchantId);
    const rollingReserve = await getRollingReserveBalance(merchantId);
    const pendingSettlement = merchant?.pending_settlement_amount || 0;
    const negativeBalance = Math.max(0, (merchant?.total_chargeback_amount || 0) - (merchant?.chargeback_recovery_available || 0) - amount);

    const distributorId = merchant?.distributor_id;
    let distributorBalance = 0;
    if (distributorId) {
        distributorBalance = await getDistributorBalance(distributorId);
    }

    const sources = [
        { source: 'rolling_reserve', available: rollingReserve, priority: 1, description: 'Held rolling reserve' },
        { source: 'pending_settlement', available: pendingSettlement, priority: 2, description: 'Pending settlement amount' },
        { source: 'merchant_balance', available: negativeBalance, priority: 3, description: 'Negative merchant balance' },
        { source: 'distributor_balance', available: distributorBalance, priority: 4, description: 'Distributor recovery balance' },
    ];

    const totalAvailable = sources.reduce((sum, s) => sum + s.available, 0);
    if (totalAvailable < amount) {
        throw new Error(`Insufficient recovery sources. Available: ${totalAvailable.toFixed(2)}, Required: ${amount.toFixed(2)}`);
    }

    let remaining = amount;
    const recoverySteps = sources.map((s) => {
        const toRecover = Math.min(s.available, remaining);
        remaining -= toRecover;
        return { ...s, to_recover: toRecover };
    }).filter((s) => s.to_recover > 0);

    return {
        chargeback_id: chargebackId,
        merchant_id: merchantId,
        distributor_id: distributorId || undefined,
        total_amount: amount,
        recovery_steps: recoverySteps,
        total_available: totalAvailable,
        is_cascading: recoverySteps.length > 1,
    };
}

// ─── Individual Source Recovery Helpers ────────────────────────────────────────

async function debitRollingReserve(merchantId: string, amount: number): Promise<void> {
    const admin = getAdminClient();
    const { data: heldEntries, error: fetchErr } = await admin
        .from('rolling_reserve_ledger')
        .select('id, reserve_amount')
        .eq('merchant_id', merchantId)
        .eq('status', 'held')
        .order('reserve_date', { ascending: true });

    if (fetchErr) throw new Error(`Failed to fetch reserve ledger: ${fetchErr.message}`);

    let remaining = amount;
    for (const entry of heldEntries || []) {
        if (remaining <= 0) break;
        const entryAmt = parseFloat(entry.reserve_amount);
        const debitAmt = Math.min(entryAmt, remaining);

        const newStatus = debitAmt >= entryAmt ? 'debited' : 'held';
        const { error: updateErr } = await admin
            .from('rolling_reserve_ledger')
            .update({
                status: newStatus,
                debit_reason: 'chargeback_recovery',
                debited_at: newStatus === 'debited' ? new Date().toISOString() : null,
                reserve_amount: entryAmt - debitAmt,
            })
            .eq('id', entry.id);

        if (updateErr) throw new Error(`Failed to debit reserve: ${updateErr.message}`);
        remaining -= debitAmt;
    }
}

async function debitPendingSettlement(merchantId: string, amount: number): Promise<void> {
    const admin = getAdminClient();
    const merchant = await getMerchantConfig(merchantId);
    const newAmount = Math.max(0, (merchant?.pending_settlement_amount || 0) - amount);

    const { error } = await admin
        .from('merchant_profiles')
        .update({ pending_settlement_amount: newAmount, updated_at: new Date().toISOString() })
        .eq('id', merchantId);

    if (error) throw new Error(`Failed to debit pending settlement: ${error.message}`);
}

async function debitDistributorBalance(distributorId: string, chargebackId: string, merchantId: string, amount: number): Promise<void> {
    const admin = getAdminClient();
    const config = await getDistributorConfig(distributorId);
    if (!config) throw new Error('Distributor profile not found');

    const newBalance = Math.max(0, (config?.available_recovery_balance || 0) - amount);
    const newTotalRecovered = (config?.total_recovered_amount || 0) + amount;

    const { error } = await admin
        .from('distributor_profiles')
        .update({
            available_recovery_balance: newBalance,
            total_recovered_amount: newTotalRecovered,
        })
        .eq('user_id', distributorId);

    if (error) throw new Error(`Failed to debit distributor balance: ${error.message}`);

    // Record in distributor recovery history (distributor_id = distributor_profiles.id)
    const { data: historyData, error: historyError } = await admin
        .from('distributor_recovery_history')
        .insert({
            distributor_id: config.id,
            chargeback_id: chargebackId,
            merchant_id: merchantId,
            amount,
            created_at: new Date().toISOString(),
        })
        .select();

    if (historyError) {
        logger.error(
            'Distributor history insert failed',
            new Error(historyError.message),
            {
                distributor_id: config.id,
                chargeback_id: chargebackId,
                merchant_id: merchantId,
                amount,
            }
        );
        throw new Error(historyError.message);
    }

    logger.info('Distributor recovery history inserted', {
        row_id: historyData?.[0]?.id || 'unknown',
        amount,
    });
}

// ─── Core Recovery Function (Cascading) ──────────────────────────────────────

async function executeCascadingRecovery(
    chargeback: Chargeback,
    plan: ChargebackRecoveryPlan,
    performedBy: string
): Promise<ChargebackRecoveryResult> {
    const admin = getAdminClient();
    const timestamp = getUpdatedTimestamp();

    // Atomic status transition: only update if currently 'pending'
    // Prevents race condition where two concurrent calls both pass the status check
    const { data: updatedChargeback, error: updateErr } = await admin
        .from('chargebacks')
        .update({ status: 'recovering', updated_at: timestamp })
        .eq('id', chargeback.id)
        .eq('status', 'pending')
        .select('id');

    if (updateErr || !updatedChargeback || updatedChargeback.length === 0) {
        const msg = updateErr ? updateErr.message : 'Chargeback was already being recovered by another request';
        throw new ConflictError(`Failed to start recovery: ${msg}`, 'RECOVERY_RACE_DETECTED');
    }

    const merchant = await getMerchantConfig(chargeback.merchant_id);
    const previousBalance = merchant?.chargeback_recovery_available || 0;

    const executedSteps: RecoveryStepRecord[] = [];
    let totalRecovered = 0;

    try {
        for (const step of plan.recovery_steps) {
            if (step.to_recover <= 0) continue;

            if (step.source === 'rolling_reserve') {
                await debitRollingReserve(chargeback.merchant_id, step.to_recover);
            } else if (step.source === 'pending_settlement') {
                await debitPendingSettlement(chargeback.merchant_id, step.to_recover);
            } else if (step.source === 'distributor_balance' && plan.distributor_id) {
                await debitDistributorBalance(plan.distributor_id, chargeback.id, chargeback.merchant_id, step.to_recover);
            }
            // merchant_balance: no debit needed, just tracking

            totalRecovered += step.to_recover;
            executedSteps.push({
                source: step.source,
                amount: step.to_recover,
                description: step.description,
                timestamp,
            });

            logger.info(`Chargeback recovery step: ${step.source}`, {
                chargeback_id: chargeback.id,
                merchant_id: chargeback.merchant_id,
                amount: step.to_recover,
            });
        }

        const newBalance = previousBalance + totalRecovered;
        const primarySource = executedSteps[0]?.source || 'merchant_balance';

        const { error: cbErr } = await admin
            .from('chargebacks')
            .update({
                status: 'recovered',
                recovered_at: timestamp,
                recovery_source: primarySource,
                recovery_steps: executedSteps,
                updated_at: timestamp,
            })
            .eq('id', chargeback.id);

        if (cbErr) throw new Error(`Failed to update chargeback: ${cbErr.message}`);

        const { error: merchantErr } = await admin
            .from('merchant_profiles')
            .update({
                chargeback_recovery_available: newBalance,
                pending_chargeback_amount: Math.max(0, (merchant?.pending_chargeback_amount || 0) - totalRecovered),
                updated_at: timestamp,
            })
            .eq('id', chargeback.merchant_id);

        if (merchantErr) throw new Error(`Failed to update merchant balance: ${merchantErr.message}`);

        await admin.from('chargeback_history').insert({
            chargeback_id: chargeback.id,
            merchant_id: chargeback.merchant_id,
            action: 'recover',
            event_type: plan.is_cascading ? 'cascading_recovery' : `${primarySource}_recovery`,
            previous_data: { status: chargeback.status },
            current_data: {
                chargeback_status: 'recovered',
                recovery_source: primarySource,
                recovery_steps: executedSteps,
                total_recovered: totalRecovered,
            },
            recovered_amount: totalRecovered,
            recovery_source: primarySource,
            recovery_details: {
                previous_balance: previousBalance,
                new_balance: newBalance,
                cascading: plan.is_cascading,
                steps: executedSteps,
            },
            performed_by: performedBy,
        });

        clearMerchantCache(chargeback.merchant_id);

        logger.info('Chargeback recovery completed', {
            chargeback_id: chargeback.id,
            merchant_id: chargeback.merchant_id,
            total_recovered: totalRecovered,
            sources: executedSteps.map((s) => s.source).join(', '),
            cascading: plan.is_cascading,
        });

        return {
            chargeback_id: chargeback.id,
            recovered_amount: totalRecovered,
            recovery_steps: executedSteps,
            total_recovered: totalRecovered,
            previous_balance: previousBalance,
            new_balance: newBalance,
            timestamp,
            success: true,
        };
    } catch (error) {
        await admin
            .from('chargebacks')
            .update({ status: 'failed', updated_at: timestamp })
            .eq('id', chargeback.id);

        await admin.from('chargeback_history').insert({
            chargeback_id: chargeback.id,
            merchant_id: chargeback.merchant_id,
            action: 'recover',
            event_type: 'recovery_failed',
            previous_data: { status: chargeback.status },
            current_data: { status: 'failed', error: error instanceof Error ? error.message : 'Unknown error' },
            performed_by: performedBy,
        });

        clearMerchantCache(chargeback.merchant_id);

        logger.error('Chargeback recovery failed', error instanceof Error ? error : undefined, {
            chargeback_id: chargeback.id,
            merchant_id: chargeback.merchant_id,
        });

        throw error;
    }
}

// ─── Public Functions ──────────────────────────────────────────────────────────

export async function getChargeback(chargebackId: string): Promise<Chargeback | null> {
    const admin = getAdminClient();

    const { data, error } = await admin
        .from('chargebacks')
        .select('*')
        .eq('id', chargebackId)
        .maybeSingle();

    if (error) throw new Error(`Failed to fetch chargeback: ${error.message}`);
    if (!data) return null;

    const merchant = await getMerchantConfig(data.merchant_id);
    const rollingReserve = await getRollingReserveBalance(data.merchant_id);
    const pendingSettlement = merchant?.pending_settlement_amount || 0;
    const negativeBalance = Math.max(0, (merchant?.total_chargeback_amount || 0) - (merchant?.chargeback_recovery_available || 0));
    let distributorBalance = 0;
    if (merchant?.distributor_id) {
        distributorBalance = await getDistributorBalance(merchant.distributor_id);
    }

    return {
        ...data,
        recovery_steps: data.recovery_steps || [],
        merchant_balance: negativeBalance,
        pending_settlement: pendingSettlement,
        rolling_reserve_held: rollingReserve,
        distributor_balance: distributorBalance,
    };
}

export async function getChargebacks(
    merchantId?: string,
    page = 1,
    limit = 20,
    status?: string
): Promise<{ data: Chargeback[]; total: number; page: number; limit: number }> {
    const admin = getAdminClient();
    const offset = (page - 1) * limit;

    let query = admin
        .from('chargebacks')
        .select('*')
        .order('chargeback_date', { ascending: false })
        .range(offset, offset + limit - 1);

    if (merchantId) query = query.eq('merchant_id', merchantId);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch chargebacks: ${error.message}`);

    let totalQuery = admin
        .from('chargebacks')
        .select('*', { count: 'exact', head: true });
    if (merchantId) totalQuery = totalQuery.eq('merchant_id', merchantId);
    if (status) totalQuery = totalQuery.eq('status', status);

    const { count } = await totalQuery;

    const merchantIds = [...new Set((data || []).map((c) => c.merchant_id))];
    const merchantMap: Record<string, any> = {};
    const distributorMap: Record<string, number> = {};

    if (merchantIds.length > 0) {
        const { data: merchants } = await admin
            .from('merchant_profiles')
            .select('id, full_name, email, business_name, distributor_id, total_chargeback_amount, pending_chargeback_amount, chargeback_recovery_available, pending_settlement_amount')
            .in('id', merchantIds);

        for (const m of merchants || []) {
            merchantMap[m.id] = m;
            if (m.distributor_id && !(m.distributor_id in distributorMap)) {
                const distConfig = await getDistributorConfig(m.distributor_id);
                distributorMap[m.distributor_id] = distConfig?.available_recovery_balance || 0;
            }
        }
    }

    const reserveMap: Record<string, number> = {};
    for (const mid of merchantIds) {
        reserveMap[mid] = await getRollingReserveBalance(mid);
    }

    const chargebacks = (data || []).map((chargeback) => {
        const m = merchantMap[chargeback.merchant_id];
        const distBalance = m?.distributor_id ? (distributorMap[m.distributor_id] || 0) : 0;
        return {
            ...chargeback,
            recovery_steps: chargeback.recovery_steps || [],
            merchant_name: m?.full_name || m?.business_name || m?.email || '—',
            merchant_balance: m ? Math.max(0, (m.total_chargeback_amount || 0) - (m.chargeback_recovery_available || 0)) : 0,
            pending_settlement: m?.pending_settlement_amount || 0,
            rolling_reserve_held: reserveMap[chargeback.merchant_id] || 0,
            distributor_balance: distBalance,
        };
    });

    return {
        data: chargebacks,
        total: count || 0,
        page,
        limit
    };
}

export async function getChargebackHistory(
    chargebackId: string,
    page = 1,
    limit = 50
): Promise<{ data: ChargebackHistoryEntry[]; total: number }> {
    const admin = getAdminClient();
    const offset = (page - 1) * limit;

    const { data, error } = await admin
        .from('chargeback_history')
        .select('*')
        .eq('chargeback_id', chargebackId)
        .order('timestamp', { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) throw new Error(`Failed to fetch chargeback history: ${error.message}`);

    const { count } = await admin
        .from('chargeback_history')
        .select('*', { count: 'exact', head: true })
        .eq('chargeback_id', chargebackId);

    return {
        data: data || [],
        total: count || 0,
    };
}

export async function createChargeback(data: {
    merchantId: string;
    amount: number;
    reason: string;
    currency?: string;
    metadata?: any;
    performedBy: string;
}): Promise<Chargeback> {
    const admin = getAdminClient();
    const timestamp = getUpdatedTimestamp();

    // Validate merchant exists
    const merchant = await getMerchantConfig(data.merchantId);

    const chargebackData = {
        merchant_id: data.merchantId,
        amount: data.amount,
        currency: data.currency || 'INR',
        reason: data.reason,
        status: 'pending' as const,
        chargeback_date: timestamp,
        recovered_at: null,
        recovery_source: null,
        recovery_steps: [],
        metadata: data.metadata || {},
        created_at: timestamp,
        updated_at: timestamp
    };

    const { data: chargeback, error } = await admin
        .from('chargebacks')
        .insert(chargebackData)
        .select()
        .single();

    if (error) throw new Error(`Failed to create chargeback: ${error.message}`);

    await admin
        .from('merchant_profiles')
        .update({
            pending_chargeback_amount: (merchant?.pending_chargeback_amount || 0) + data.amount,
            total_chargeback_amount: (merchant?.total_chargeback_amount || 0) + data.amount,
            updated_at: timestamp,
        })
        .eq('id', data.merchantId);

    await admin.from('chargeback_history').insert({
        chargeback_id: chargeback.id,
        merchant_id: data.merchantId,
        action: 'create',
        event_type: 'chargeback_created',
        current_data: {
            id: chargeback.id,
            merchant_id: data.merchantId,
            amount: data.amount,
            currency: data.currency,
            reason: data.reason,
            status: 'pending',
            chargeback_date: timestamp
        },
        performed_by: data.performedBy
    });

    clearMerchantCache(data.merchantId);

    logger.info('Chargeback created', {
        chargeback_id: chargeback.id,
        merchant_id: data.merchantId,
        amount: data.amount
    });

    return { ...chargeback, recovery_steps: [] };
}

export async function recoverChargeback(
    chargebackId: string,
    performedBy: string
): Promise<ChargebackRecoveryResult> {
    const chargeback = await getChargeback(chargebackId);
    if (!chargeback) {
        throw new NotFoundError('Chargeback not found', 'CHARGEBACK_NOT_FOUND');
    }

    if (chargeback.status !== 'pending') {
        throw new ConflictError(
            `Chargeback status is '${chargeback.status}'. Only 'pending' chargebacks can be recovered.`,
            'CHARGEBACK_ALREADY_RECOVERED'
        );
    }

    const plan = await createRecoveryPlan(chargebackId, chargeback.merchant_id, chargeback.amount);

    return executeCascadingRecovery(chargeback, plan, performedBy);
}

export async function getChargebackSummary(merchantId?: string): Promise<{
    total_chargebacks: number;
    pending_chargebacks: number;
    recovered_chargebacks: number;
    failed_chargebacks: number;
    total_amount: number;
    total_recovered: number;
    pending_amount: number;
}> {
    const admin = getAdminClient();

    let query = admin.from('chargebacks').select('status, amount');
    if (merchantId) query = query.eq('merchant_id', merchantId);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch chargeback summary: ${error.message}`);

    const records = data || [];
    return {
        total_chargebacks: records.length,
        pending_chargebacks: records.filter((r) => r.status === 'pending' || r.status === 'recovering').length,
        recovered_chargebacks: records.filter((r) => r.status === 'recovered').length,
        failed_chargebacks: records.filter((r) => r.status === 'failed').length,
        total_amount: records.reduce((sum, r) => sum + parseFloat(r.amount), 0),
        total_recovered: records.filter((r) => r.status === 'recovered').reduce((sum, r) => sum + parseFloat(r.amount), 0),
        pending_amount: records.filter((r) => r.status === 'pending' || r.status === 'recovering').reduce((sum, r) => sum + parseFloat(r.amount), 0),
    };
}

export async function getDistributorRecoverySummary(distributorId?: string): Promise<DistributorRecoverySummary[]> {
    const admin = getAdminClient();

    let query = admin
        .from('distributor_profiles')
        .select('id, security_deposit, available_recovery_balance, total_recovered_amount');

    if (distributorId) {
        query = query.eq('user_id', distributorId);
    }

    const { data: profiles, error } = await query;
    if (error) throw new Error(`Failed to fetch distributor profiles: ${error.message}`);

    const results: DistributorRecoverySummary[] = [];
    for (const p of profiles || []) {
        const { count } = await admin
            .from('distributor_recovery_history')
            .select('*', { count: 'exact', head: true })
            .eq('distributor_id', p.id);

        const { data: recent } = await admin
            .from('distributor_recovery_history')
            .select('id, chargeback_id, amount, created_at')
            .eq('distributor_id', p.id)
            .order('created_at', { ascending: false })
            .limit(10);

        results.push({
            distributor_id: p.id,
            security_deposit: parseFloat(p.security_deposit || '0'),
            available_recovery_balance: parseFloat(p.available_recovery_balance || '0'),
            total_recovered_amount: parseFloat(p.total_recovered_amount || '0'),
            recovery_count: count || 0,
            recent_recoveries: (recent || []).map((r: any) => ({
                id: r.id,
                chargeback_id: r.chargeback_id,
                amount: parseFloat(r.amount),
                created_at: r.created_at,
            })),
        });
    }

    return results;
}
