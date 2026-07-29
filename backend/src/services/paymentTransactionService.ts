import { getSupabaseClient } from '../routes/supabase';
import { logger } from '../utils/logger';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface MerchantPaymentRecord {
    id: string;
    'Transaction Id': string | null;
    txn_details: JsonValue | null;
}

export type StorageOutcome = 'stored' | 'skipped' | 'not_found';

export interface StorageResult {
    outcome: StorageOutcome;
    merchantId?: string;
    transactionId: string;
}

const TRANSACTION_ID_KEYS = ['transaction_id', 'master_transaction_id', 'txnid', 'txn_id'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const normalizeJsonValue = (value: unknown): JsonValue => {
    if (value === null) {
        return null;
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }

    if (Array.isArray(value)) {
        return value.map((item) => normalizeJsonValue(item));
    }

    if (isRecord(value)) {
        const normalized: Record<string, JsonValue> = {};

        for (const [key, nestedValue] of Object.entries(value)) {
            normalized[key] = normalizeJsonValue(nestedValue);
        }

        return normalized;
    }

    return null;
};

export const extractPaymentTransactionId = (payload: unknown): string | null => {
    if (!isRecord(payload)) {
        return null;
    }

    for (const key of TRANSACTION_ID_KEYS) {
        const candidate = payload[key];

        if (typeof candidate === 'string' && candidate.trim()) {
            return candidate.trim();
        }
    }

    return null;
};

export const storeMerchantTransactionId = async (
    merchantId: string,
    transactionId: string
): Promise<StorageResult> => {
    const supabase = getSupabaseClient();

    const { data: merchant, error: fetchError } = await supabase
        .from('merchant_profiles')
        .select('id, "Transaction Id"')
        .eq('id', merchantId)
        .maybeSingle();

    if (fetchError) {
        logger.error('Failed to fetch merchant row before storing transaction id', fetchError);
        throw fetchError;
    }

    if (!merchant) {
        return {
            outcome: 'not_found',
            transactionId
        };
    }

    const existingTransactionId = merchant['Transaction Id'];

    if (existingTransactionId === transactionId) {
        return {
            outcome: 'skipped',
            merchantId: merchant.id,
            transactionId
        };
    }

    const { error: updateError } = await supabase
        .from('merchant_profiles')
        .update({
            'Transaction Id': transactionId,
            txn_details: null,
            updated_at: new Date().toISOString()
        })
        .eq('id', merchantId);

    if (updateError) {
        logger.error('Failed to store transaction id', updateError);
        throw updateError;
    }

    return {
        outcome: 'stored',
        merchantId,
        transactionId
    };
};

export const storeTxnDetailsByTransactionId = async (
    transactionId: string,
    txnDetails: unknown
): Promise<StorageResult> => {
    const supabase = getSupabaseClient();

    const { data: merchant, error: fetchError } = await supabase
        .from('merchant_profiles')
        .select('id, "Transaction Id", txn_details')
        .eq('Transaction Id', transactionId)
        .maybeSingle();

    if (fetchError) {
        logger.error('Failed to fetch merchant row before storing txn details', fetchError);
        throw fetchError;
    }

    if (!merchant) {
        return {
            outcome: 'not_found',
            transactionId
        };
    }

    if (merchant.txn_details !== null) {
        return {
            outcome: 'skipped',
            merchantId: merchant.id,
            transactionId
        };
    }

    const { error: updateError } = await supabase
        .from('merchant_profiles')
        .update({
            txn_details: normalizeJsonValue(txnDetails),
            updated_at: new Date().toISOString()
        })
        .eq('id', merchant.id)
        .is('txn_details', null);

    if (updateError) {
        logger.error('Failed to store txn details', updateError);
        throw updateError;
    }

    return {
        outcome: 'stored',
        merchantId: merchant.id,
        transactionId
    };
};