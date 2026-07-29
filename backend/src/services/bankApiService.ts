// src/services/bankApiService.ts
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

        console.log('?? BankApiService initialized:');
        console.log('   BANK_API_URL from process.env:', process.env.BANK_API_URL);
        console.log('   Using apiUrl:', this.apiUrl);
        console.log('   BANK_API_KEY:', this.apiKey ? 'Present' : 'Missing');
    }

    /**
     * Submit merchant application to bank with UPI credentials
     */
    async submitMerchantApplication(
        merchant: MerchantProfile,
        upiVpa: string,
        upiQrString: string
    ): Promise<BankApiResponse> {
        const startTime = Date.now();

        try {
            const request: BankApiRequest = this.buildBankRequest(merchant, upiVpa, upiQrString);

            logger.info('Submitting merchant to bank API', {
                merchantId: merchant.id,
                business_name: merchant.business_name || "",
                upiVpa,
                apiUrl: this.apiUrl
            });

            const fullUrl = `${this.apiUrl}/merchant-applications`;
            console.log('\n?? DEBUG: About to call Bank API');
            console.log('?? Full URL:', fullUrl);
            console.log('?? Method: POST');
            console.log('?? Headers:', {
                'Authorization': `Bearer ${this.apiKey.substring(0, 10)}...`,
                'Content-Type': 'application/json',
                'X-Request-ID': merchant.id
            });
            console.log('?? Payload keys:', Object.keys(request));
            console.log('?? merchantId:', request.merchantId);
            console.log('?? business_name:', request.business_name);
            console.log('?? upiVpa:', request.upiVpa);

            const response = await axios.post<BankApiResponse>(
                fullUrl,
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

            console.log('? Bank API call successful!');
            console.log('? Response:', response.data);

            logger.bankApi(
                'submit_merchant',
                merchant.id,
                true,
                duration
            );

            return response.data;
        } catch (error) {
            const duration = Date.now() - startTime;

            console.log('? Bank API call failed');
            if (axios.isAxiosError(error)) {
                console.log('? Error code:', error.code);
                console.log('? Error message:', error.message);
                console.log('? Response status:', error.response?.status);
                console.log('? Response data:', error.response?.data);
            }

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
     * Build bank API request from merchant profile with UPI data
     */
    private buildBankRequest(
        merchant: MerchantProfile,
        upiVpa: string,
        upiQrString: string
    ): BankApiRequest {
        return {
            merchantId: merchant.id,
            business_name: merchant.business_name || "",
            businessType: merchant.businessType || "",
            registrationNumber: merchant.registrationNumber || "",
            taxId: merchant.taxId || "",
            email: merchant.email,
            phone: merchant.phone || "",
            upiVpa: upiVpa,
            upiQrString: upiQrString,
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