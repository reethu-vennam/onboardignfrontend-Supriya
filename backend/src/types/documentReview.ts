export interface DocumentValidationCheck {
    checkType: string;
    checkResult: 'pass' | 'fail';
    checkedValue: string | null;
    expectedValue: string | null;
    message: string;
}

export interface DocumentValidationResult {
    documentId: string;
    documentType: string;
    fileName: string;
    overallStatus: 'passed' | 'failed';
    checks: DocumentValidationCheck[];
    validatedAt: string;
}

export interface ScoreBreakdown {
    documentsUploaded: number;
    documentsUploadedMax: number;
    validationPassBonus: number;
    validationPassBonusMax: number;
    otherScore: number;
    total: number;
}

export interface MerchantDocWithValidations {
    id: string;
    merchant_id: string;
    document_type: string;
    file_name: string;
    file_path: string;
    status: string;
    validation_status: string;
    rejection_reason: string | null;
    uploaded_at: string;
    verified_at: string | null;
    validations: DocumentValidationCheck[];
}

export interface MerchantForReview {
    id: string;
    full_name: string;
    business_name: string;
    email: string;
    mobile_number: string;
    onboarding_status: string;
    onboarding_score: number;
    documents: MerchantDocWithValidations[];
    document_summary: {
        total: number;
        unchecked: number;
        passed: number;
        failed: number;
        pending: number;
    };
}

export interface BankDetailsRecord {
    id: string;
    merchant_id: string;
    account_number: string;
    ifsc_code: string;
    bank_name: string;
    account_holder_name: string;
}
