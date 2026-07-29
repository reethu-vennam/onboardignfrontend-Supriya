// src/services/mariadb.ts
// MariaDB connection to payments database (READ ONLY)
import mysql from 'mysql2/promise';
import { logger } from '../utils/logger';

let pool: mysql.Pool | null = null;

export function getMariaDBPool(): mysql.Pool {
    if (!pool) {
        pool = mysql.createPool({
            host: process.env.MARIADB_HOST,
            port: parseInt(process.env.MARIADB_PORT || '3306'),
            user: process.env.MARIADB_USER,
            password: process.env.MARIADB_PASSWORD,
            database: process.env.MARIADB_DATABASE,
            waitForConnections: true,
            connectionLimit: 5,
            queueLimit: 0,
            connectTimeout: 10000,
        });
        logger.info('MariaDB pool created', { host: process.env.MARIADB_HOST, database: process.env.MARIADB_DATABASE });
    }
    return pool;
}

/**
 * Look up MariaDB client_id (UUID) by email from client_profile table
 * master_transactions.client_id is the UUID that matches client_profile.client_id
 */
export async function getClientIdsByEmails(emails: string[]): Promise<Record<string, string>> {
    if (emails.length === 0) return {};
    const pool = getMariaDBPool();
    const placeholders = emails.map(() => '?').join(',');
    const [rows] = await pool.execute(
        `SELECT client_id, client_email FROM client_profile WHERE client_email IN (${placeholders})`,
        emails
    );
    const map: Record<string, string> = {};
    for (const row of rows as any[]) {
        if (row.client_email && row.client_id) {
            map[row.client_email.toLowerCase()] = String(row.client_id);
        }
    }
    return map;
}

/**
 * Fetch transactions from master_transactions table (READ ONLY)
 * JOINs easebuzz_processor_transaction_details for MDR/payment source info
 */
export async function getTransactionsByClientIds(
    clientIds: string[],
    filters?: {
        status?: string;
        search?: string;
        date_from?: string;
        date_to?: string;
    }
): Promise<any[]> {
    if (clientIds.length === 0) return [];

    const pool = getMariaDBPool();
    const placeholders = clientIds.map(() => '?').join(',');

    const sql = `
        SELECT
            mt.id,
            mt.order_reference,
            mt.client_id,
            mt.amount_requested,
            mt.amount_final,
            mt.currency,
            mt.status,
            mt.processor,
            mt.initiated_at,
            mt.completed_at,
            eb.deduction_percentage,
            eb.net_amount_debit,
            eb.cashback_percentage,
            eb.payment_source,
            eb.bank_ref_num,
            eb.mode,
            eb.card_type,
            eb.city AS eb_city,
            eb.state AS eb_state,
            eb.amount AS eb_amount,
            eb.customer_first_name,
            eb.customer_email,
            eb.txnid,
            eb.product_info,
            eb.card_number,
            eb.upi_va,
            cp.client_business_address
        FROM master_transactions mt
        LEFT JOIN easebuzz_processor_transaction_details eb ON mt.id = eb.master_transaction_id
        LEFT JOIN client_profile cp ON mt.client_id = cp.client_id
        WHERE mt.client_id IN (${placeholders})
    `;
    const params: any[] = [...clientIds];

    let whereClause = '';

    // Status filter
    if (filters?.status && filters.status !== 'all') {
        const statusMap: Record<string, string> = {
            success: 'SUCCESS',
            completed: 'SUCCESS',
            pending: 'PENDING',
            failed: 'FAILED',
            cancelled: 'CANCELLED',
            expired: 'EXPIRED',
            refunded: 'REFUNDED',
            initiated: 'INITIATED',
        };
        const dbStatus = statusMap[filters.status.toLowerCase()] || filters.status.toUpperCase();
        whereClause += ` AND mt.status = ?`;
        params.push(dbStatus);
    }

    // Date range filter
    if (filters?.date_from) {
        whereClause += ` AND mt.initiated_at >= ?`;
        params.push(filters.date_from);
    }
    if (filters?.date_to) {
        const endDate = new Date(filters.date_to);
        endDate.setHours(23, 59, 59, 999);
        whereClause += ` AND mt.initiated_at <= ?`;
        params.push(endDate.toISOString().slice(0, 19).replace('T', ' '));
    }

    // Search filter (by order_reference or id)
    if (filters?.search && filters.search.trim()) {
        const term = `%${filters.search.trim()}%`;
        whereClause += ` AND (mt.order_reference LIKE ? OR mt.id LIKE ?)`;
        params.push(term, term);
    }

    const finalSql = sql + whereClause + ` ORDER BY mt.initiated_at DESC`;

    const [rows] = await pool.execute(finalSql, params);
    return rows as any[];
}

/**
 * Get all merchant client_ids (UUIDs) from MariaDB client_profile (admin use)
 */
export async function getAllMerchantClientIds(): Promise<string[]> {
    const pool = getMariaDBPool();
    const [rows] = await pool.execute(
        `SELECT client_id FROM client_profile WHERE client_account_type = 'merchant'`
    );
    return (rows as any[]).map((r: any) => String(r.client_id)).filter(Boolean);
}

/**
 * Sync client_onboarded_by using client_id directly (no email lookup)
 * Supabase user_id == MariaDB client_id, so we match directly
 */
export async function syncClientOnboardedByClientId(
    merchantClientId: string,
    distributorClientId: string
): Promise<boolean> {
    const pool = getMariaDBPool();
    const [result] = await pool.execute(
        `UPDATE client_profile SET client_onboarded_by = ? WHERE client_id = ? AND client_onboarded_by IS NULL`,
        [distributorClientId, merchantClientId]
    );
    return (result as any).affectedRows > 0;
}

/**
 * Legacy: Sync client_onboarded_by using email
 */
export async function syncClientOnboardedBy(
    emailToDistributorId: Record<string, string>
): Promise<number> {
    const pool = getMariaDBPool();
    let updated = 0;
    for (const [email, distributorId] of Object.entries(emailToDistributorId)) {
        if (!email || !distributorId) continue;
        const [result] = await pool.execute(
            `UPDATE client_profile SET client_onboarded_by = ? WHERE client_email = ? AND client_onboarded_by IS NULL`,
            [distributorId, email]
        );
        if ((result as any).affectedRows > 0) {
            updated++;
        }
    }
    return updated;
}

/**
 * Get all merchants with name, email from MariaDB (admin use)
 */
export async function getAllMerchantsFromMariaDB(): Promise<any[]> {
    const pool = getMariaDBPool();
    const [rows] = await pool.execute(`
        SELECT
            cp.client_id,
            cp.client_name,
            cp.client_email,
            cp.client_mobile,
            cp.client_account_status,
            cp.client_onboarded_by,
            cp.created_at,
            dp.client_name AS distributor_name,
            dp.client_email AS distributor_email
        FROM client_profile cp
        LEFT JOIN client_profile dp ON cp.client_onboarded_by = dp.client_id
        WHERE cp.client_account_type = 'merchant'
        ORDER BY cp.created_at DESC
    `);
    return rows as any[];
}

/**
 * Fetch settled-but-uncollected transactions for settlement processing.
 * Returns successful transactions from MariaDB that are eligible for settlement.
 * Filters by: status = SUCCESS, completed_at <= cutoff date.
 * Returns only the fields needed for settlement calculation.
 */
export async function getUnsettledTransactionsForSettlement(
    clientIds: string[],
    cutoffDate: Date
): Promise<any[]> {
    if (clientIds.length === 0) return [];

    const pool = getMariaDBPool();
    const placeholders = clientIds.map(() => '?').join(',');

    // Format cutoff in local timezone to match MariaDB's completed_at timezone
    const y = cutoffDate.getFullYear();
    const M = String(cutoffDate.getMonth() + 1).padStart(2, '0');
    const d = String(cutoffDate.getDate()).padStart(2, '0');
    const h = String(cutoffDate.getHours()).padStart(2, '0');
    const m = String(cutoffDate.getMinutes()).padStart(2, '0');
    const s = String(cutoffDate.getSeconds()).padStart(2, '0');
    const cutoffStr = `${y}-${M}-${d} ${h}:${m}:${s}`;

    const sql = `
        SELECT
            mt.id,
            mt.order_reference,
            mt.client_id,
            mt.amount_requested,
            mt.amount_final,
            mt.currency,
            mt.status,
            mt.completed_at,
            eb.deduction_percentage,
            eb.net_amount_debit,
            eb.bank_ref_num,
            eb.txnid
        FROM master_transactions mt
        LEFT JOIN easebuzz_processor_transaction_details eb ON mt.id = eb.master_transaction_id
        WHERE mt.client_id IN (${placeholders})
          AND mt.status = 'SUCCESS'
          AND mt.completed_at IS NOT NULL
          AND mt.completed_at <= ?
        ORDER BY mt.completed_at ASC
    `;

    const [rows] = await pool.execute(sql, [...clientIds, cutoffStr]);
    return rows as any[];
}

/**
 * Insert a new client_profile record for an approved merchant.
 * This ensures the merchant exists in MariaDB so transactions can be linked.
 * All required NOT NULL columns are populated (client_password is auto-generated).
 * Handles duplicate mobile by using a fallback value.
 */
export async function insertClientProfile(params: {
    clientId: string;
    clientName: string;
    clientEmail: string;
    clientMobile?: string;
    distributorClientId?: string;
    clientPassword?: string;
}): Promise<void> {
    const pool = getMariaDBPool();
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const password = params.clientPassword || 'Temp@' + Math.random().toString(36).substring(2, 10);
    let mobile = params.clientMobile || '0000000000';
    try {
        await pool.execute(
            `INSERT INTO client_profile (
                client_id, client_name, client_email, client_mobile,
                client_account_type, client_account_status, client_password,
                client_onboarded_by, onboarding_completed,
                is_easebuzz_enabled, is_ntt_enabled,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'merchant', 'active', ?, ?, 1, 1, 1, ?, ?)`,
            [
                params.clientId,
                params.clientName,
                params.clientEmail,
                mobile,
                password,
                params.distributorClientId || null,
                now,
                now,
            ]
        );
    } catch (err: any) {
        // If duplicate mobile, retry with a unique dummy number
        if (err.errno === 1062 && err.message?.includes('client_mobile')) {
            mobile = '000' + Date.now().toString(36).toUpperCase();
            await pool.execute(
                `INSERT INTO client_profile (
                    client_id, client_name, client_email, client_mobile,
                    client_account_type, client_account_status, client_password,
                    client_onboarded_by, onboarding_completed,
                    is_easebuzz_enabled, is_ntt_enabled,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, 'merchant', 'active', ?, ?, 1, 1, 1, ?, ?)`,
                [
                    params.clientId,
                    params.clientName,
                    params.clientEmail,
                    mobile,
                    password,
                    params.distributorClientId || null,
                    now,
                    now,
                ]
            );
        } else {
            throw err;
        }
    }
    logger.info('Client profile created in MariaDB', {
        client_id: params.clientId,
        client_email: params.clientEmail,
    });
}

/**
 * Resolve MariaDB client_id from Supabase user_id (auth.users.id).
 * Since client_profile.client_id = auth.users.id, this is a direct UUID match.
 */
export async function getClientIdByUserId(userId: string): Promise<string | null> {
    const pool = getMariaDBPool();
    const [rows] = await pool.execute(
        `SELECT client_id FROM client_profile WHERE client_id = ? LIMIT 1`,
        [userId]
    );
    const result = rows as any[];
    return result.length > 0 ? String(result[0].client_id) : null;
}
