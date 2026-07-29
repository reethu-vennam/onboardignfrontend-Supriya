// backend/src/types/bank.ts
export interface BankApiRequest {
    merchantId: string;
    business_name: string;
    businessType: string;
    registrationNumber: string;
    taxId: string;
    email: string;
    phone: string;
    upiVpa: string;           // ✅ Add this
    upiQrString: string;      // ✅ Add this
    address: {
        line1: string;
        line2?: string;
        city: string;
        state: string;
        postalCode: string;
        country: string;
    };
    documents: Array<{
        type: string;
        url: string;
    }>;
    callbackUrl: string;
}

export interface BankApiResponse {
    success: boolean;
    applicationId?: string;
    message?: string;
    estimatedProcessingTime?: string;
}

export type BankDecisionStatus = 'approved' | 'rejected' | 'pending_info';

export interface BankDecision {
    approved: boolean;
    reason?: string;
    conditions?: string[];
    accountNumber?: string;
    merchantCode?: string;
}

export interface BankWebhookPayload {
    applicationId: string;
    merchantId: string;
    status: BankDecisionStatus;
    decision: BankDecision;
    processedAt: string;
    metadata?: Record<string, string | number | boolean | null>;
}

export interface BankApiError {
    code: string;
    message: string;
    details?: string;
}