import axios from 'axios';
import { apiClient } from '@/lib/api-client';
import { authService } from '@/lib/auth-service';

const SABBPE_BASE_URL = import.meta.env.VITE_SABBPE_BASE_URL;
const PAYMENT_API_URL = import.meta.env.VITE_PAYMENT_API_URL;
const INTEGRATION_COST_API_URL = import.meta.env.VITE_API_URL || '';
const SABBPE_USER_ID = import.meta.env.VITE_SABBPE_USER_ID;
const SABBPE_MERCHANT_ID = import.meta.env.VITE_SABBPE_MERCHANT_ID;
const SABBPE_PASSWORD = import.meta.env.VITE_SABBPE_PASSWORD;
const FRONTEND_URL = import.meta.env.VITE_FRONTEND_URL;
const PRODUCT_INFO = import.meta.env.VITE_SABBPE_PRODUCT_INFO;
const CUSTOMER_FIRSTNAME = import.meta.env.VITE_SABBPE_CUSTOMER_FIRSTNAME;
const CUSTOMER_EMAIL = import.meta.env.VITE_SABBPE_CUSTOMER_EMAIL;
const CUSTOMER_PHONE = import.meta.env.VITE_SABBPE_CUSTOMER_PHONE;

const resolveFrontendUrl = () => {
  const configuredUrl = String(FRONTEND_URL || '').trim();
  const fallbackUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const url = configuredUrl || fallbackUrl;

  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url.replace(/\/+$/, '');

  return `https://${url.replace(/\/+$/, '')}`;
};

export interface SabbpeHostedPaymentCustomer {
  firstname: string;
  email: string;
  phone: string;
}

export interface SabbpeHostedPaymentRequest {
  orderReference: string;
}

interface SabbpeTokenResponse {
  status?: boolean;
  transaction_id?: string;
  sabbpe_token?: string;
  message?: string;
}

export interface SabbpeDecryptTokenResponse {
  gateway?: string;
  master_transaction_id?: string;
  merchant_order_ref?: string;
  status?: string;
  amount?: string;
  currency?: string;
  payment_completed_at?: string;
  payment_method?: string;
  message?: string;
}

export const storeSabbpeTransactionId = async (transactionId: string) => {
  if (!transactionId) throw new Error('Missing transaction id');
  return apiClient.post('/transaction/store-transaction-id', { transactionId });
};

export const storeSabbpeTxnDetails = async (payload: SabbpeDecryptTokenResponse) => {
  if (!payload?.master_transaction_id) throw new Error('Missing master transaction id in payment response');
  return apiClient.post('/transaction/store-txn-details', payload);
};

export const fetchSabbpeTxnDetails = async (transactionId: string) => {
  if (!transactionId) throw new Error('Missing transaction id');
  return apiClient.post('/transaction/details', { transactionId });
};

export const fetchIntegrationCost = async (): Promise<number> => {
  const token = authService.getToken();
  if (!token) throw new Error('Not authenticated. Please log in.');

  const baseUrl = INTEGRATION_COST_API_URL.replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/api/merchant/integration-cost`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    const message = (errorPayload as { message?: string })?.message || `Integration-cost request failed (${response.status})`;
    throw new Error(message);
  }

  const res = await response.json();
  const total = Number(res?.data?.totalIntegrationCost ?? 0);
  return total;
};

interface SabbpeInitiateResponse {
  status?: boolean;
  payment_url?: string;
  message?: string;
}

const ensureConfigured = () => {
  const missing = [
    ['VITE_SABBPE_BASE_URL', SABBPE_BASE_URL],
    ['VITE_SABBPE_USER_ID', SABBPE_USER_ID],
    ['VITE_SABBPE_MERCHANT_ID', SABBPE_MERCHANT_ID],
    ['VITE_SABBPE_PASSWORD', SABBPE_PASSWORD],
    ['VITE_FRONTEND_URL or browser origin', resolveFrontendUrl()],
    ['VITE_SABBPE_PRODUCT_INFO', PRODUCT_INFO],
    ['VITE_SABBPE_CUSTOMER_FIRSTNAME', CUSTOMER_FIRSTNAME],
    ['VITE_SABBPE_CUSTOMER_EMAIL', CUSTOMER_EMAIL],
    ['VITE_SABBPE_CUSTOMER_PHONE', CUSTOMER_PHONE],
  ].filter(([, value]) => !value);
  if (missing.length > 0) {
    throw new Error(`Missing SabbPe payment configuration: ${missing.map(([name]) => name).join(', ')}`);
  }
};

const requestSabbpeToken = async (orderReference: string) => {
  ensureConfigured();
  const tokenPayload = {
    sabbpe_userid: SABBPE_USER_ID,
    sabbpe_merchantid: SABBPE_MERCHANT_ID,
    sabbpe_password: SABBPE_PASSWORD,
    timestamp: formatSabbpeTimestamp(),
    merchant_order_ref: orderReference,
  };
  const tokenResponse = await axios.post<SabbpeTokenResponse>(
    `${SABBPE_BASE_URL}/sabbpe/v1/token`,
    tokenPayload,
    { headers: { 'Content-Type': 'application/json' } }
  );
  const sabbpeToken = tokenResponse.data?.sabbpe_token;
  if (!tokenResponse.data?.status || !sabbpeToken) {
    throw new Error(tokenResponse.data?.message || 'SabbPe token generation failed');
  }
  return { sabbpeToken, transactionId: tokenResponse.data?.transaction_id };
};

export const formatSabbpeTimestamp = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

export const buildSabbpeOrderReference = (merchantId?: string, userId?: string) => {
  const baseId = (merchantId || userId || 'ONB').replace(/[^a-zA-Z0-9]/g, '').slice(-10).toUpperCase();
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ONBOARDING-${baseId}-${Date.now()}-${suffix}`;
};

export const generateSabbpePaymentToken = async (orderReference?: string): Promise<string> => {
  const resolvedOrderReference = orderReference || buildSabbpeOrderReference(SABBPE_MERCHANT_ID, SABBPE_USER_ID);
  const { sabbpeToken } = await requestSabbpeToken(resolvedOrderReference);
  return sabbpeToken;
};

// Only the encrypted txnid from the callback URL is sent; including sabbpe_token makes SabbPe return 401.
export const decryptSabbpePaymentToken = async ({
  txnid,
}: { txnid: string }): Promise<SabbpeDecryptTokenResponse> => {
  if (!PAYMENT_API_URL) throw new Error('Missing VITE_PAYMENT_API_URL');
  const response = await axios.post<SabbpeDecryptTokenResponse>(
    `${PAYMENT_API_URL}/decrypt-token`,
    { txnid },
    { headers: { 'Content-Type': 'application/json' } }
  );
  return response.data;
};

export const startSabbpeHostedPayment = async (
  { orderReference }: SabbpeHostedPaymentRequest,
  amountOverride: number
): Promise<{ paymentUrl: string; transactionId?: string; sabbpeToken: string }> => {
  const { sabbpeToken, transactionId } = await requestSabbpeToken(orderReference);
  const amount = Number(amountOverride);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Invalid SabbPe payment amount from integration-cost API');
  }
  const initiatePayload = {
    sabbpe_token: sabbpeToken,
    amount,
    productinfo: PRODUCT_INFO,
    frontend_url: resolveFrontendUrl(),
    customer: { firstname: CUSTOMER_FIRSTNAME, email: CUSTOMER_EMAIL, phone: CUSTOMER_PHONE },
  };
  const initiateResponse = await axios.post<SabbpeInitiateResponse>(
    `${SABBPE_BASE_URL}/sabbpe/v1/initiate`,
    initiatePayload,
    { headers: { 'Content-Type': 'application/json' } }
  );
  const paymentUrl = initiateResponse.data?.payment_url;
  if (!initiateResponse.data?.status || !paymentUrl) {
    throw new Error(initiateResponse.data?.message || 'SabbPe payment initiation failed');
  }
  return { paymentUrl, transactionId, sabbpeToken };
};
