// src/middleware/validation.ts
import { Request, Response, NextFunction } from 'express';

interface ValidationErrorItem {
    field: string;
    message: string;
    code: string;
}

export const validateMerchantSubmission = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    const errors: ValidationErrorItem[] = [];
    const data = req.body;

    // Business Information
    if (!data.businessName || data.businessName.trim().length < 2) {
        errors.push({
            field: 'businessName',
            message: 'Business name must be at least 2 characters',
            code: 'INVALID_BUSINESS_NAME'
        });
    }

    if (!data.businessType) {
        errors.push({
            field: 'businessType',
            message: 'Business type is required',
            code: 'MISSING_BUSINESS_TYPE'
        });
    }

    if (!data.registrationNumber) {
        errors.push({
            field: 'registrationNumber',
            message: 'Registration number is required',
            code: 'MISSING_REGISTRATION_NUMBER'
        });
    }

    if (!data.taxId) {
        errors.push({
            field: 'taxId',
            message: 'Tax ID is required',
            code: 'MISSING_TAX_ID'
        });
    }

    // Contact Information
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!data.email || !emailRegex.test(data.email)) {
        errors.push({
            field: 'email',
            message: 'Valid email address is required',
            code: 'INVALID_EMAIL'
        });
    }

    const phoneRegex = /^\+?[\d\s\-()]+$/;
    if (!data.phone || !phoneRegex.test(data.phone)) {
        errors.push({
            field: 'phone',
            message: 'Valid phone number is required',
            code: 'INVALID_PHONE'
        });
    }

    // Address
    if (!data.addressLine1) {
        errors.push({
            field: 'addressLine1',
            message: 'Address line 1 is required',
            code: 'MISSING_ADDRESS'
        });
    }

    if (!data.city) {
        errors.push({
            field: 'city',
            message: 'City is required',
            code: 'MISSING_CITY'
        });
    }

    if (!data.state) {
        errors.push({
            field: 'state',
            message: 'State is required',
            code: 'MISSING_STATE'
        });
    }

    if (!data.postalCode) {
        errors.push({
            field: 'postalCode',
            message: 'Postal code is required',
            code: 'MISSING_POSTAL_CODE'
        });
    }

    if (!data.country) {
        errors.push({
            field: 'country',
            message: 'Country is required',
            code: 'MISSING_COUNTRY'
        });
    }

    // Documents
    if (!Array.isArray(data.documents) || data.documents.length === 0) {
        errors.push({
            field: 'documents',
            message: 'At least one document is required',
            code: 'MISSING_DOCUMENTS'
        });
    }

    if (errors.length > 0) {
        res.status(400).json({
            success: false,
            error: {
                code: 'VALIDATION_ERROR',
                message: 'Validation failed',
                details: JSON.stringify(errors)
            }
        });
        return;
    }

    next();
};