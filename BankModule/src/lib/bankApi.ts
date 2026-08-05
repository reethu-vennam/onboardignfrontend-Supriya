
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/bank';

export interface BankLoginPayload {
    email: string;
    password: string;
}

export interface BankLoginResponse {
    success: boolean;
    message: string;
    token: string;
    user: {
        userId: string;
        email: string;
        role: string;
        name: string;
        bankStaffId: string;
    };
}

export interface Application {
    id: string;
    full_name: string;
    email: string;
    business_name: string;
    onboarding_status: string;
    created_at: string;
    updated_at: string;
    bank_commercials?: any;
    pg_agreement_signed?: boolean;
    pg_agreement_signed_at?: string;
    pg_agreement_signature?: string;
    agreement_link?: string;
    selected_products?: any;
    has_pg_product?: boolean;
}

export interface ApplicationDecision {
    decision: 'approve' | 'reject';
    notes: string;
}

export const bankLogin = async (payload: BankLoginPayload): Promise<BankLoginResponse> => {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error('Login failed');
    const body = await response.json();
    if (!body.success || !body.data) throw new Error(body.message || 'Login failed');
    return { success: body.success, message: body.message, ...body.data };
};

export const getPendingApplications = async (token: string): Promise<Application[]> => {
    const response = await fetch(`${API_BASE_URL}/applications/pending`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to fetch pending KYCs');
    }
    const data = await response.json();
    return data.data || [];
};

export const sendAgreementLink = async (token: string, appId: string, agreementLink: string): Promise<any> => {
    const response = await fetch(`${API_BASE_URL}/applications/send-agreement-link/${appId}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ agreement_link: agreementLink })
    });
    if (!response.ok) throw new Error('Failed to send agreement link');
    const body = await response.json();
    if (!body.success) throw new Error(body.error?.message || 'Failed to send agreement link');
    return body;
};

export const getApplicationDetails = async (token: string, appId: string): Promise<any> => {
    const response = await fetch(`${API_BASE_URL}/applications/${appId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Failed to fetch application details');
    return response.json();
};

export const getAgreementSignedApplications = async (token: string): Promise<Application[]> => {
    const response = await fetch(`${API_BASE_URL}/applications/agreement-signed`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Failed to fetch agreement signed applications');
    const data = await response.json();
    return data.data || [];
};

export const sendAgreement = async (token: string, appId: string, commercials: any, notes?: string): Promise<any> => {
    const response = await fetch(`${API_BASE_URL}/applications/send-agreement/${appId}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ bank_commercials: commercials, notes })
    });
    if (!response.ok) throw new Error('Failed to send agreement');
    const body = await response.json();
    if (!body.success) throw new Error(body.error?.message || 'Failed to send agreement');
    return body;
};

export const finalDecision = async (token: string, appId: string, decision: 'approve' | 'reject', notes: string): Promise<any> => {
    const response = await fetch(`${API_BASE_URL}/applications/final-decision/${appId}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ decision, notes })
    });
    if (!response.ok) throw new Error('Final decision failed');
    const body = await response.json();
    if (!body.success) throw new Error(body.error?.message || 'Final decision failed');
    return body;
};

export const decideApplication = async (token: string, appId: string, payload: ApplicationDecision): Promise<any> => {
    const response = await fetch(`${API_BASE_URL}/applications/decide/${appId}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error('Decision failed');
    const body = await response.json();
    if (!body.success) throw new Error(body.error?.message || 'Decision failed');
    return body;
};

export const handleError = (error: unknown): string => {
    return error instanceof Error ? error.message : 'Error occurred';
};