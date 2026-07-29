// backend/src/types/merchant.ts
// Complete MerchantProfile type with all fields used across the codebase

export interface MerchantProfile {
    // Primary fields (snake_case for Supabase)
    id: string;
    user_id: string;
    full_name: string;
    mobile_number: string;
    email: string;
    pan_number?: string;
    aadhaar_number?: string;
    business_name?: string;
    gst_number?: string;
    onboarding_status: string;

    // Product catalog fields (NEW)
    selected_products?: SelectedProductData[];
    total_monthly_cost?: number;
    total_onetime_cost?: number;
    total_integration_cost?: number;
    agreement_signed?: boolean;
    agreement_signed_at?: string;
    agreement_ip_address?: string;
    agreement_signature?: string;

    // Legacy/existing business fields (camelCase - for compatibility)
    
    businessType?: string;
    registrationNumber?: string;
    taxId?: string;
    phone?: string;
    website?: string;

    // Address fields
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;

    // Bank integration fields
    bankApplicationId?: string;
    bankResponse?: any;

    // Documents
    documents?: MerchantDocument[];

    // Status tracking
    submittedAt?: string;
    rejectionReason?: string;
    metadata?: any;

    // Timestamps
    created_at: string;
    updated_at: string;
}

// Product-related types (for product catalog)
export interface SelectedProductData {
    product_code: string;
    product_name: string;
    pricing_type: 'monthly' | 'onetime' | 'integration' | 'free';
    price: number;
    additional_costs?: {
        sim_cost?: number;
        amc?: number;
        mid_count?: number;
    };
}

// Document types
export interface MerchantDocument {
    id?: string;
    merchant_id?: string;
    document_type: string;
    file_name: string;
    file_path: string;
    file_size?: number;
    mime_type?: string;
    status?: string;
    uploaded_at?: string;
    type?: string; // Alias for document_type
    url?: string; // Alias for file_path
}

// Onboarding status enum
export type onboarding_status =
    | 'draft'
    | 'submitted'
    | 'validating'
    | 'pending_bank_approval'
    | 'approved'
    | 'rejected'
    | 'validation_failed'
    | 'bank_rejected'
    | 'verified';
export type OnboardingStatus = onboarding_status;
// Merchant submission data
export interface MerchantSubmission {
    fullName: string;
    email: string;
    phone: string;
    business_name: string;
    businessType: string;
    registrationNumber: string;
    taxId: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    documents: MerchantDocument[];
}

// Status update data
export interface StatusUpdate {
    merchantId: string;
    newStatus: onboarding_status;
    oldStatus: onboarding_status;
    reason?: string;
    updatedBy?: string;
    metadata?: any;
}

// User session type (for req.user)
export interface UserSession {
    user_id: string;
    email: string;
    role: string;
    merchantId?: string; // Added for product routes
    bankStaffId?: string;
    supportStaffId?: string;
    firstName?: string;
    lastName?: string;
}

// Decoded JWT token
export interface DecodedToken {
    user_id: string;
    email: string;
    role: string;
    merchantId?: string;
    bankStaffId?: string;
    supportStaffId?: string;
    firstName?: string;
    lastName?: string;
}