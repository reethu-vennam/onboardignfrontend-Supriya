// src/services/validationService.ts
import { MerchantProfile } from '../types/merchant';
import {
    ValidationError as ValidationErrorClass,
    ValidationErrorItem
} from '../utils/errors';
import { logger } from '../utils/logger';

export class ValidationService {
    async validateMerchantProfile(merchant: MerchantProfile): Promise<void> {
        const errors: ValidationErrorItem[] = [];

        this.validateBusinessInfo(merchant, errors);
        this.validateContactInfo(merchant, errors);
        this.validateAddress(merchant, errors);
        this.validateDocuments(merchant, errors);

        if (errors.length > 0) {
            logger.warn('Merchant validation failed', {
                merchantId: merchant.id,
                errorCount: errors.length,
                fields: errors.map(e => e.field).join(', ')  // ✅ Convert array to string
            });

            throw new ValidationErrorClass(
                'Merchant validation failed',
                errors
            );
        }

        logger.info('Merchant validation passed', {
            merchantId: merchant.id,
            businessName: merchant.business_name
        });
    }

    private validateBusinessInfo(
        merchant: MerchantProfile,
        errors: ValidationErrorItem[]
    ): void {
        if (!merchant.business_name || merchant.business_name.trim().length < 2) {
            errors.push({
                field: 'businessName',
                message: 'Business name must be at least 2 characters',
                code: 'INVALID_BUSINESS_NAME'
            });
        }

        if (!merchant.businessType || merchant.businessType.trim().length === 0) {
            errors.push({
                field: 'businessType',
                message: 'Business type is required',
                code: 'MISSING_BUSINESS_TYPE'
            });
        }

        if (!merchant.registrationNumber || merchant.registrationNumber.trim().length === 0) {
            errors.push({
                field: 'registrationNumber',
                message: 'Registration number is required',
                code: 'MISSING_REGISTRATION_NUMBER'
            });
        }

        if (!merchant.taxId || merchant.taxId.trim().length === 0) {
            errors.push({
                field: 'taxId',
                message: 'Tax ID is required',
                code: 'MISSING_TAX_ID'
            });
        }
    }

    private validateContactInfo(
        merchant: MerchantProfile,
        errors: ValidationErrorItem[]
    ): void {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!merchant.email || !emailRegex.test(merchant.email)) {
            errors.push({
                field: 'email',
                message: 'Valid email address is required',
                code: 'INVALID_EMAIL'
            });
        }

        const phoneRegex = /^\+?[\d\s\-()]+$/;
        if (!merchant.phone || !phoneRegex.test(merchant.phone)) {
            errors.push({
                field: 'phone',
                message: 'Valid phone number is required',
                code: 'INVALID_PHONE'
            });
        }
    }

    private validateAddress(
        merchant: MerchantProfile,
        errors: ValidationErrorItem[]
    ): void {
        if (!merchant.addressLine1 || merchant.addressLine1.trim().length === 0) {
            errors.push({
                field: 'addressLine1',
                message: 'Address line 1 is required',
                code: 'MISSING_ADDRESS'
            });
        }

        if (!merchant.city || merchant.city.trim().length === 0) {
            errors.push({
                field: 'city',
                message: 'City is required',
                code: 'MISSING_CITY'
            });
        }

        if (!merchant.state || merchant.state.trim().length === 0) {
            errors.push({
                field: 'state',
                message: 'State is required',
                code: 'MISSING_STATE'
            });
        }

        if (!merchant.postalCode || merchant.postalCode.trim().length === 0) {
            errors.push({
                field: 'postalCode',
                message: 'Postal code is required',
                code: 'MISSING_POSTAL_CODE'
            });
        }

        if (!merchant.country || merchant.country.trim().length === 0) {
            errors.push({
                field: 'country',
                message: 'Country is required',
                code: 'MISSING_COUNTRY'
            });
        }
    }

    private validateDocuments(
        merchant: MerchantProfile,
        errors: ValidationErrorItem[]
    ): void {
        if (!Array.isArray(merchant.documents) || merchant.documents.length === 0) {
            errors.push({
                field: 'documents',
                message: 'At least one document is required',
                code: 'MISSING_DOCUMENTS'
            });
            return;
        }

        merchant.documents.forEach((doc, index) => {
            if (!doc.url || doc.url.trim().length === 0) {
                errors.push({
                    field: `documents[${index}].url`,
                    message: 'Document URL is required',
                    code: 'MISSING_DOCUMENT_URL'
                });
            }

            if (!doc.file_name || doc.file_name.trim().length === 0) {
                errors.push({
                    field: `documents[${index}].filename`,
                    message: 'Document filename is required',
                    code: 'MISSING_DOCUMENT_FILENAME'
                });
            }

            if (!doc.type) {
                errors.push({
                    field: `documents[${index}].type`,
                    message: 'Document type is required',
                    code: 'MISSING_DOCUMENT_TYPE'
                });
            }
        });

        const requiredTypes: Array<'business_license' | 'tax_certificate' | 'id_proof'> = [
            'business_license',
            'tax_certificate',
            'id_proof'
        ];

        const providedTypes = merchant.documents.map(d => d.type);

        requiredTypes.forEach(requiredType => {
            if (!providedTypes.includes(requiredType)) {
                errors.push({
                    field: 'documents',
                    message: `${requiredType} document is required`,
                    code: `MISSING_${requiredType.toUpperCase()}`
                });
            }
        });
    }
}

export const validationService = new ValidationService();