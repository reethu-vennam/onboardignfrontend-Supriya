// src/services/bankService.ts
import axios, { AxiosError } from 'axios';
import {
    BankApiRequest,
    BankApiResponse,
    BankWebhookPayload,
    BankApiError
} from '../types/bank';
import { MerchantProfile } from '../types/merchant';
import { ExternalApiError, BadGatewayError } from '../utils/errors';
import { logger } from '../utils/logger';

export class BankApiService {
    private readonly apiUrl: string;
    private readonly apiKey: string;
    private readonly timeout: number;

    constructor() {
        this.apiUrl = process.env.BANK_API_URL || 'https://bank-api.example.com';
        this.apiKey = process.env.BANK_API_KEY || 'test-key';
        this.timeout = 30000; // 30 seconds
    }

    /**
     * Submit merchant application to bank
     */
    async submitMerchantApplication(
        merchant: MerchantProfile,upiVpa: string,             // <--- NEW REQUIRED ARGUMENT
    upiQrString: string 
    ): Promise<BankApiResponse> {
        const startTime = Date.now();

        try {
            const request: BankApiRequest = this.buildBankRequest(merchant,upiVpa, upiQrString);

            logger.info('Submitting merchant to bank API', {
                merchantId: merchant.id,
                business_name: merchant.business_name || "",
                apiUrl: this.apiUrl
            });

            const response = await axios.post<BankApiResponse>(
                `${this.apiUrl}/merchant-applications`,
                request,
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                        'X-Request-ID': merchant.id
                    },
                    timeout: this.timeout
                }
            );

            const duration = Date.now() - startTime;

            logger.bankApi(
                'submit_merchant',
                merchant.id,
                true,
                duration
            );

            return response.data;
        } catch (error) {
            const duration = Date.now() - startTime;

            logger.bankApi(
                'submit_merchant',
                merchant.id,
                false,
                duration,
                error instanceof Error ? error : undefined
            );

            throw this.handleBankApiError(error);
        }
    }

    /**
     * Build bank API request from merchant profile
     */
    private buildBankRequest(merchant: MerchantProfile,upiVpa: string, // <--- NEW REQUIRED ARGUMENT
    upiQrString: string): BankApiRequest {
        return {
            merchantId: merchant.id,
            business_name: merchant.business_name || "",
            businessType: merchant.businessType || "",
            registrationNumber: merchant.registrationNumber || "",
            upiVpa: upiVpa,       
            upiQrString: upiQrString, 
            taxId: merchant.taxId || "",
            email: merchant.email,
            phone: merchant.phone || "",
            address: {
                line1: merchant.addressLine1 || "",
                line2: merchant.addressLine2,
                city: merchant.city || "",
                state: merchant.state || "",
                postalCode: merchant.postalCode || "",
                country: merchant.country || "India"
            },
            documents: (merchant.documents || []).map(doc => ({
                type: doc.type || doc.document_type || "",
                url: doc.url || doc.file_path || ""
            })),
            callbackUrl: `${process.env.API_BASE_URL}/api/webhooks/bank`
        };
    }

    /**
     * Verify webhook payload signature
     */
    async verifyWebhook(payload: BankWebhookPayload): Promise<boolean> {
        // Basic validation
        const isValid = !!(
            payload.applicationId &&
            payload.merchantId &&
            payload.status &&
            payload.decision &&
            payload.processedAt
        );

        if (!isValid) {
            logger.warn('Invalid webhook payload structure', {
                hasApplicationId: !!payload.applicationId,
                hasMerchantId: !!payload.merchantId,
                hasStatus: !!payload.status,
                hasDecision: !!payload.decision
            });
        }

        return isValid;
    }

    /**
     * Get application status from bank (polling)
     */
    async getApplicationStatus(
        applicationId: string
    ): Promise<BankApiResponse> {
        const startTime = Date.now();

        try {
            logger.debug('Fetching application status from bank', {
                applicationId
            });

            const response = await axios.get<BankApiResponse>(
                `${this.apiUrl}/merchant-applications/${applicationId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`
                    },
                    timeout: this.timeout
                }
            );

            const duration = Date.now() - startTime;

            logger.externalApi(
                'bank',
                `/merchant-applications/${applicationId}`,
                duration,
                response.status
            );

            return response.data;
        } catch (error) {
            const duration = Date.now() - startTime;

            logger.externalApi(
                'bank',
                `/merchant-applications/${applicationId}`,
                duration,
                0,
                error instanceof Error ? error : undefined
            );

            throw this.handleBankApiError(error);
        }
    }

    /**
     * Handle bank API errors
     */
    private handleBankApiError(error: unknown): never {
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError<BankApiError>;

            if (axiosError.response?.data) {
                const bankError = axiosError.response.data;
                throw new ExternalApiError(
                    bankError.message || 'Bank API request failed',
                    axiosError.response.status,
                    bankError.code || 'BANK_API_ERROR',
                    bankError.details
                );
            }

            if (axiosError.code === 'ECONNABORTED') {
                throw new BadGatewayError(
                    'Bank API request timeout',
                    'BANK_API_TIMEOUT'
                );
            }

            if (axiosError.code === 'ECONNREFUSED') {
                throw new BadGatewayError(
                    'Cannot connect to bank API',
                    'BANK_API_UNAVAILABLE'
                );
            }

            throw new BadGatewayError(
                'Failed to communicate with bank API',
                'BANK_API_ERROR'
            );
        }

        throw new ExternalApiError(
            'Unknown bank API error',
            502,
            'UNKNOWN_BANK_ERROR'
        );
    }
}

export const bankApiService = new BankApiService();