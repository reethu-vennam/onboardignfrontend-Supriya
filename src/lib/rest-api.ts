import { authService } from './auth-service';

const API_BASE = import.meta.env.VITE_API_URL || '';

function formatApiErrorMessage(body: any): string | undefined {
  const message = body?.error?.message;
  const details = body?.error?.details;
  if (Array.isArray(details) && details.length > 0) {
    return `${message}: ${details.join(', ')}`;
  }
  if (details && typeof details === 'object') {
    const fieldErrors = Object.values(details).filter((v): v is string => typeof v === 'string');
    if (fieldErrors.length > 0) return `${message}: ${fieldErrors.join(', ')}`;
  }
  return message;
}

async function request(method: string, path: string, body?: any): Promise<any> {
  const token = authService.getToken();
  if (!token) throw new Error('Not authenticated');
  
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let errorMessage = `Request failed (${res.status})`;
    try {
      const errorBody = await res.json();
      errorMessage = formatApiErrorMessage(errorBody) || errorMessage;
    } catch {}
    throw new Error(errorMessage);
  }
  const data = await res.json();
  if (!data.success) {
    console.error(`API Error [${res.status}] ${method} ${path}:`, JSON.stringify(data));
    throw new Error(formatApiErrorMessage(data) || `Request failed (${res.status})`);
  }
  return data.data;
}

export const api = {
  get: (path: string) => request('GET', path),
  post: (path: string, body?: any) => request('POST', path, body),
  patch: (path: string, body?: any) => request('PATCH', path, body),
  delete: (path: string) => request('DELETE', path),

  getToken: () => authService.getToken(),
  getUser: () => authService.getUser(),

  // Merchant
  getMerchantProfile: () => api.get('/merchant/profile'),
  saveMerchantProfile: (data: any) => api.post('/merchant/profile', data),
  submitMerchantProfile: () => api.post('/merchant/submit'),
  validateBankAccount: (data: any) => api.post('/merchant/validate-bank-account', data),
  getIntegrationCost: () => api.post('/merchant/integration-cost'),

  // Ecosystem mandate (Onboarding Team's onboard -> token -> mandate -> status -> subscription
  // flow, proxied server-side so secret_key/service credentials never reach the browser)
  createEcosystemMandate: (data: { vpa: string; payerName: string; amount: string; startDate: string; endDate: string }) =>
    api.post('/merchant/ecosystem/mandate/create', data),
  pollEcosystemMandateStatus: (trxnno: string) =>
    api.post('/merchant/ecosystem/mandate/status', { trxnno }),

  // Admin
  getAdminMerchants: (status?: string) => api.get(`/admin/merchants${status ? `?status=${status}` : ''}`),
  validateMerchant: (id: string) => api.post(`/admin/merchants/${id}/validate`),
  submitMerchantToBank: (id: string) => api.post(`/admin/merchants/${id}/submit-to-bank`),
  approveMerchant: (id: string) => api.post(`/admin/merchants/${id}/approve`),
  rejectMerchant: (id: string, reason: string) => api.post(`/admin/merchants/${id}/reject`, { status: 'rejected', reason }),

  // Distributor
  createMerchant: (data: any) => api.post('/distributor/create-merchant', data),
  getDistributorMerchants: (status?: string) => api.get(`/distributor/merchants${status ? `?status=${status}` : ''}`),
  saveMerchantBankDetails: (merchantId: string, data: any) => api.post(`/distributor/save-bank-details?merchantId=${merchantId}`, data),
  submitDistributorMerchant: (merchantId: string) => api.post(`/distributor/submit-merchant-onboarding?merchantId=${merchantId}`),
  deleteDistributorMerchant: (merchantId: string) => api.delete(`/distributor/delete-merchant?merchantId=${merchantId}`),

  // Products
  getProductCatalog: () => api.get('/products/catalog'),
  getSubCatalog: (code: string) => api.get(`/products/sub-catalog/${code}`),
  updateProducts: (data: any) => api.post('/products/merchant/update-products', data),
  getSelectedProducts: () => api.get('/products/merchant/selected-products'),
  signAgreement: (data: any) => api.post('/products/merchant/sign-agreement', data),
  getAgreements: () => api.get('/products/merchant/agreements'),

  // Upload
  uploadFile: async (file: File, filePath?: string): Promise<any> => {
    const formData = new FormData();
    formData.append('file', file);
    if (filePath) formData.append('filePath', filePath);
    const token = authService.getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/api/upload/file`, { method: 'POST', headers, body: formData });
    const data = await res.json();
    if (!data.success) throw new Error(data.error?.message || 'Upload failed');
    return data.data;
  },

  // Settlement
  runSettlement: (dryRun = false) => api.post(`/settlement/run?dryRun=${dryRun}`),
  getSettlementHistory: (merchantId: string) => api.get(`/settlement/history?merchantId=${merchantId}`),
  getSettlementSummary: (merchantId: string) => api.get(`/settlement/summary/${merchantId}`),

  // Chargebacks
  createChargeback: (data: any) => api.post('/chargeback/create', data),
  getChargebacks: (merchantId?: string) => api.get(`/chargeback${merchantId ? `?merchantId=${merchantId}` : ''}`),

  // Webhooks
  getDemoQuota: () => api.get('/demo/quota'),
  incrementDemoQuota: (amount = 1) => api.post(`/demo/quota/increment?amount=${amount}`),
};
