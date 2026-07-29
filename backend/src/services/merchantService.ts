// src/services/merchantService.ts
import { v4 as uuidv4 } from 'uuid';
import { getSupabaseClient } from '../routes/supabase';
import {
    MerchantProfile,
    MerchantSubmission,
    OnboardingStatus,
    StatusUpdate
} from '../types/merchant';
import { NotFoundError, ConflictError, BadRequestError } from '../utils/errors';
import { logger } from '../utils/logger';

// In-memory storage (replace with database in production)
const merchants = new Map<string, MerchantProfile>();
const merchantsByUserId = new Map<string, string>(); // user_id -> merchantId mapping

export class MerchantService {
    /**
     * Create a new merchant profile
     */
    async createMerchant(
        user_id: string,
        data: MerchantSubmission
    ): Promise<MerchantProfile> {
        // Check if user already has a merchant profile
        if (merchantsByUserId.has(user_id)) {
            throw new ConflictError(
                'Merchant profile already exists for this user',
                'MERCHANT_ALREADY_EXISTS'
            );
        }

        const merchantId = uuidv4();
        const now = new Date().toISOString();

        const merchant: MerchantProfile = {
            id: merchantId,
            user_id,
            full_name: data.fullName,           // ✅ ADDED
            mobile_number: data.phone,          // ✅ ADDED
            email: data.email,
            business_name: data.business_name,
            onboarding_status: 'draft',
            created_at: now,
            updated_at: now,
            // Legacy/optional fields from data
           
            businessType: data.businessType,
            registrationNumber: data.registrationNumber,
            taxId: data.taxId,
            phone: data.phone,
            addressLine1: data.addressLine1,
            addressLine2: data.addressLine2,
            city: data.city,
            state: data.state,
            postalCode: data.postalCode,
            country: data.country,
            documents: data.documents
        };

        merchants.set(merchantId, merchant);
        merchantsByUserId.set(user_id, merchantId);

        logger.info('Merchant profile created', {
            merchantId,
            user_id,
            businessName: data.business_name
        });

        return merchant;
    }

    /**
     * Get merchant by ID
     */
    async getMerchantById(merchantId: string): Promise<MerchantProfile> {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('merchant_profiles')
            .select('*')
            .eq('id', merchantId)
            .single();

        if (error) {
            console.error('Supabase query failed:', error);
            throw new Error("Database lookup failed during merchant retrieval.");
        }
        if (!data) {
            throw new NotFoundError(
                'Merchant not found',
                'MERCHANT_NOT_FOUND'
            );
        }
        return data as MerchantProfile;
    }

    /**
     * Get merchant by user ID
     */
    async getMerchantByUserId(user_id: string): Promise<MerchantProfile | null> {
        const merchantId = merchantsByUserId.get(user_id);

        if (!merchantId) {
            return null;
        }

        return merchants.get(merchantId) || null;
    }

    /**
     * Update merchant profile
     */
    async updateMerchant(
        merchantId: string,
        data: Partial<MerchantSubmission>
    ): Promise<MerchantProfile> {
        const merchant = await this.getMerchantById(merchantId);

        // Only allow updates if status is draft or rejected
        if (!['draft', 'rejected'].includes(merchant.onboarding_status)) {
            throw new BadRequestError(
                'Cannot update merchant in current status',
                'INVALID_STATUS_FOR_UPDATE'
            );
        }

        const updated: MerchantProfile = {
            ...merchant,
            ...data,
            id: merchant.id,
            user_id: merchant.user_id,
            full_name: data.fullName || merchant.full_name,
            mobile_number: data.phone || merchant.mobile_number,
            onboarding_status: merchant.onboarding_status,
            updated_at: new Date().toISOString()
        };

        merchants.set(merchantId, updated);

        logger.info('Merchant profile updated', {
            merchantId,
            user_id: merchant.user_id
        });

        return updated;
    }

    /**
     * Update merchant status
     */
    async updateStatus(
        merchantId: string,
        newStatus: OnboardingStatus,
        reason?: string,
        additionalData?: Partial<MerchantProfile>
    ): Promise<MerchantProfile> {
        const merchant = await this.getMerchantById(merchantId);
        const oldStatus = merchant.onboarding_status as OnboardingStatus;

        // Validate status transition
        this.validateStatusTransition(oldStatus as OnboardingStatus, newStatus);

        const now = new Date().toISOString();
        const statusTimestampField = this.getStatusTimestampField(newStatus);

        const updated: MerchantProfile = {
            ...merchant,
            ...additionalData,
            onboarding_status: newStatus,
            rejectionReason: newStatus === 'rejected' ? reason : undefined,
            [statusTimestampField]: now,
            updated_at: now
        };

        merchants.set(merchantId, updated);

        const statusUpdate: StatusUpdate = {
            merchantId,
            oldStatus: oldStatus,           // ✅ FIXED
            newStatus: newStatus,
            reason,
            metadata: additionalData?.metadata
        };

        logger.onboarding(merchantId, newStatus, oldStatus, merchant.user_id);

        return updated;
    }

    /**
     * Get all merchants (with optional status filter)
     */
    async getAllMerchants(
        status?: OnboardingStatus
    ): Promise<MerchantProfile[]> {
        const supabase = getSupabaseClient();
        let query = supabase
            .from('merchant_profiles')
            .select('*');

        if (status) {
            query = query.eq('onboarding_status', status);
        }

        const { data, error } = await query;
        if (error) {
            console.error('Supabase query failed:', error);
            throw new Error(`Database error fetching merchants: ${error.message}`);
        }
        return data as MerchantProfile[];
    }

    /**
     * Delete merchant profile
     */
    async deleteMerchant(merchantId: string): Promise<void> {
        const merchant = await this.getMerchantById(merchantId);

        merchants.delete(merchantId);
        if (merchant.user_id) {
            merchantsByUserId.delete(merchant.user_id);
        }

        logger.info('Merchant profile deleted', {
            merchantId,
            user_id: merchant.user_id
        });
    }

    /**
     * Validate status transition
     */
    private validateStatusTransition(
        currentStatus: OnboardingStatus,
        newStatus: OnboardingStatus
    ): void {
        const validTransitions: Record<OnboardingStatus, OnboardingStatus[]> = {
            draft: ['submitted'],
            submitted: ['validating', 'rejected'],
            validating: ['pending_bank_approval', 'rejected'],
            pending_bank_approval: ['approved', 'rejected'],
            approved: [],
            rejected: ['submitted'],
            validation_failed: ['submitted'],
            bank_rejected: ['submitted'],
            verified: []
        };

        const allowedStatuses = validTransitions[currentStatus];

        if (!allowedStatuses.includes(newStatus)) {
            throw new BadRequestError(
                `Invalid status transition from ${currentStatus} to ${newStatus}`,
                'INVALID_STATUS_TRANSITION'
            );
        }
    }

    /**
     * Get the timestamp field name for a given status
     */
    private getStatusTimestampField(status: OnboardingStatus): string {
        const fieldMap: Record<OnboardingStatus, string> = {
            draft: 'onboarding_status',
            submitted: 'onboarding_status',
            validating: 'onboarding_status',
            pending_bank_approval: 'onboarding_status',
            approved: 'onboarding_status',
            rejected: 'onboarding_status',
            validation_failed: 'onboarding_status',
            bank_rejected: 'onboarding_status',
            verified: 'onboarding_status'
        };

        return fieldMap[status];
    }
}

export const merchantService = new MerchantService();